#!/usr/bin/env node
/**
 * RLS 정책 정적 분석 — cases ↔ case_customer_links 사고 (42P17 infinite recursion)
 * 같은 함정을 사전에 잡는 lint.
 *
 * 검출하는 패턴: 양방향 inline cross-table subquery (사이클).
 *   - 정책 P_A on public.A 가 USING/WITH CHECK 안에서 `from public.B` 직접 참조
 *   - 정책 P_B on public.B 가 USING/WITH CHECK 안에서 `from public.A` 직접 참조
 *   → A 평가 시 B 평가, B 평가 시 다시 A 평가 → 무한 루프 (42P17)
 *
 * 단방향 cross-ref (A → B 만, B → A 없음) 는 안전 — B 의 정책이 SECURITY DEFINER
 * 헬퍼만 쓰면 체인이 끊기기 때문. 예: profiles_same_org_select 가 memberships 를
 * inline 참조하지만 memberships_select 는 is_org_member()/is_super_admin() 등
 * SECURITY DEFINER 만 사용 → 안전.
 *
 * 동일 (table, name) 쌍이 여러 마이그에 나타나면 최신 정의만 평가 (drop+create
 * 패턴 호환).
 *
 * Usage:  node scripts/lint-rls.mjs
 * Exit 0 = clean, Exit 1 = cycle 발견.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations')

const POLICY_RE = /create\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+([^;]+);/gis
const CROSS_REF_RE = /\bfrom\s+public\.(\w+)/gi

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{14}_.*\.sql$/.test(f))
  .sort()

/** key = `${table}.${name}` → { table, name, body, file } */
const latest = new Map()

for (const f of files) {
  const raw = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8')
  const content = stripComments(raw)
  for (const m of content.matchAll(POLICY_RE)) {
    const [, name, table, body] = m
    latest.set(`${table}.${name}`, { table, name, body, file: f })
  }
}

/** table → Set<refTable> — table 의 정책 중 하나라도 refTable 을 inline 참조하면 추가 */
const crossRefs = new Map()
/** table → Map<refTable, { policy, file }[]> — cycle 보고용 출처 추적 */
const refSources = new Map()

for (const [, p] of latest) {
  for (const m of p.body.matchAll(CROSS_REF_RE)) {
    const refTable = m[1]
    if (refTable === p.table) continue
    if (!crossRefs.has(p.table)) crossRefs.set(p.table, new Set())
    crossRefs.get(p.table).add(refTable)
    if (!refSources.has(p.table)) refSources.set(p.table, new Map())
    if (!refSources.get(p.table).has(refTable)) refSources.get(p.table).set(refTable, [])
    refSources.get(p.table).get(refTable).push({ policy: p.name, file: p.file })
  }
}

/** 양방향 cycle 탐지: 정렬해서 중복 (A→B, B→A) 한 번만 보고. */
const reported = new Set()
let warnings = 0

for (const [A, refs] of crossRefs) {
  for (const B of refs) {
    if (!crossRefs.get(B)?.has(A)) continue
    const key = [A, B].sort().join('|')
    if (reported.has(key)) continue
    reported.add(key)
    warnings++
    const aPolicies = refSources.get(A).get(B).map((s) => `${s.policy} (${s.file})`).join(', ')
    const bPolicies = refSources.get(B).get(A).map((s) => `${s.policy} (${s.file})`).join(', ')
    console.error(
      `\nRLS recursion risk between public.${A} ↔ public.${B}:\n` +
      `  - public.${A} 정책이 public.${B} 를 inline 참조: ${aPolicies}\n` +
      `  - public.${B} 정책이 public.${A} 를 inline 참조: ${bPolicies}\n` +
      `  → 양방향 inline 이라 무한 재귀 (42P17). 한쪽 또는 양쪽을 SECURITY DEFINER\n` +
      `    함수로 우회하세요 (예: public.is_<x>(<args>)). 사례:\n` +
      `    supabase/migrations/20260511000001_fix_cases_customer_rls_recursion.sql`,
    )
  }
}

if (warnings > 0) {
  console.error(`\nRLS lint: ${warnings} cycle(s) detected.`)
  process.exit(1)
}

console.log(
  `RLS lint: clean. ${latest.size} policies scanned across ${files.length} migrations. ` +
  `${[...crossRefs.values()].reduce((n, s) => n + s.size, 0)} inline cross-refs, no cycles.`,
)
