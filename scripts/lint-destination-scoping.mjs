#!/usr/bin/env node
/**
 * 목적지 스코핑 정적 분석 — "case.data 에 새 키를 전역(top-level)으로 저장했는데
 * 목적지별 분리 명단에도 전역 허용 명단에도 없는" 미분류 키를 사전에 잡는 lint.
 *
 * 왜: destination 스코핑이 opt-in 화이트리스트라(DESTINATION_SCOPED_FIELD_KEYS),
 * 명단에 안 넣은 키는 조용히 전역 저장 → 한 목적지에서 한 게 다른 목적지로 누수.
 * 컴파일 에러도 안 나서 운영 중 발견될 때까지 반복됨. 이 lint 가 그 "깜빡"을 빌드에서 막는다.
 *
 * 검출: 케이스 data 를 spread 하는 객체 리터럴( `{ ...data, KEY: ... }` 류 )과
 *       data 변수 속성 대입( `nextData.KEY = ...` 류 )에서 KEY 를 추출.
 *       KEY 가 SCOPED(분리) 도 GLOBAL(전역 허용) 도 아니면 미분류 → 실패.
 *
 * 분류 추가:
 *   - 목적지마다 달라야 하는 값 → packages/domain/.../destination-scoped-fields.ts
 *     의 DESTINATION_SCOPED_FIELD_KEYS 에 추가 + 쓰기를 by_dest 로 라우팅.
 *   - 동물·보호자 신원 등 케이스 공통 값 → 같은 파일 GLOBAL_CASE_DATA_KEYS 에 추가.
 *
 * 오탐(케이스 data 가 아닌 객체 spread 가 잡힘) 시: 그 줄에 `// scoping-lint-ignore` 주석.
 *
 * Usage:  node scripts/lint-destination-scoping.mjs
 * Exit 0 = clean, Exit 1 = 미분류 키 발견.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ── 1) 분류 명단 읽기 (domain 단일 출처) ──────────────────────────────────
const SCOPED_SRC = path.join(ROOT, 'packages/domain/src/destination-scoped-fields.ts')
const src = readFileSync(SCOPED_SRC, 'utf-8')

function parseStringSet(name) {
  const re = new RegExp(`${name}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm')
  const m = src.match(re)
  if (!m) return null
  return new Set([...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2]))
}

const SCOPED = parseStringSet('DESTINATION_SCOPED_FIELD_KEYS')
if (!SCOPED) {
  console.error('✗ DESTINATION_SCOPED_FIELD_KEYS 를 찾지 못함 — 명단 파싱 실패')
  process.exit(1)
}
const GLOBAL = parseStringSet('GLOBAL_CASE_DATA_KEYS') ?? new Set()

// ── Baseline ──────────────────────────────────────────────────────────────
// lint 도입 시점(2026-06-11)에 이미 top-level 로 쓰이던 키들 — 신규 누수만 막기 위해
// "현행 유지(grandfather)" 한다. ⚠️ 여기 **새로 추가하지 말 것**. 신규 키는 SCOPED 또는
// GLOBAL 로 분류해야 한다. 아래 항목은 점진적으로 위 두 명단으로 옮겨 비워가는 게 목표.
//
// 2026-06-11 전수 조사 완료로 **baseline 비움** — 모든 기존 키를 SCOPED/GLOBAL 로 분류.
// 새 미분류 키는 곧바로 lint 실패. (mechanism 은 유지 — 향후 불가피한 grandfather 용.)
const SCOPING_LINT_BASELINE = new Set([])

// ── 2) 스캔 대상 — 케이스 data 를 쓰는 server action 계층 ──────────────────
const SCAN_DIRS = [
  'apps/portal/lib/actions',
  'apps/admin/lib/actions',
]

// 케이스 data 를 담는 것으로 인정하는 변수 식별자(이 베이스의 spread/대입만 검사).
// 'd' 는 patchCaseData((d) => …) 류 mutator 베이스 — 빠뜨리면 그 안의 scoped 키 top-level 쓰기가
// lint 를 그냥 통과한다(신고탭 수출 완료 버그가 이 구멍으로 숨어 있었음). Date 변수도 'd' 를 자주
// 쓰지만 그건 메서드 호출(d.setX())이라 대입/spread 패턴엔 안 걸린다.
const DATA_BASES = ['data', 'prev', 'prevData', 'nextData', 'next', 'baseData', 'merged', 'd']

function walk(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

/** 객체 리터럴 `{ ...base, KEY: ... }` 의 깊이-1 키들을 추출. */
function spreadSiblings(content) {
  const found = []
  const baseRe = new RegExp(`\\{\\s*\\.\\.\\.\\s*(${DATA_BASES.join('|')})\\b`, 'g')
  for (const m of content.matchAll(baseRe)) {
    // 여는 '{' 위치(= 매치 시작)부터 깊이 추적, 깊이 1 의 `IDENT:` 수집.
    let i = m.index
    let depth = 0
    for (; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) break }
      else if (depth === 1) {
        // 깊이 1 에서 `IDENT:` = 객체 키. 단, 객체 키는 바로 앞이 `{` 또는 `,` 여야 한다 —
        // 그래야 삼항연산자 콜론(`cond ? a : b` 의 `a :`)을 키로 오인하지 않는다.
        const rest = content.slice(i)
        const km = rest.match(/^([A-Za-z_$][\w$]*)\s*:/)
        if (km) {
          const prev = content.slice(0, i).replace(/\s+$/, '').slice(-1)
          if (prev === '{' || prev === ',') {
            const line = content.slice(0, i).split('\n').length
            found.push({ key: km[1], line })
          }
          i += km[1].length
        }
      }
    }
  }
  return found
}

/** `base.KEY = ...` (== 아님) 대입에서 KEY 추출. */
function assignTargets(content) {
  const found = []
  const re = new RegExp(`\\b(?:${DATA_BASES.join('|')})\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g')
  for (const m of content.matchAll(re)) {
    const line = content.slice(0, m.index).split('\n').length
    found.push({ key: m[1], line })
  }
  return found
}

const KEY_BLACKLIST_PROPS = new Set([
  // 케이스 data 가 아닌 흔한 객체 속성·메서드 — 오탐 억제(베이스명이 우연히 겹칠 때).
  'length', 'map', 'filter', 'find', 'slice', 'push', 'value', 'ok', 'error',
])

const problems = []          // 미분류 키 (SCOPED/GLOBAL 둘 다 아님)
const fallbackProblems = []  // SCOPED 키를 top-level 에 직접 쓰는 지점 (단일목적지 fallback 만 허용)
for (const rel of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, rel))) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const hits = [...spreadSiblings(content), ...assignTargets(content)]
    for (const { key, line } of hits) {
      const lineText = lines[line - 1] ?? ''
      if (lineText.includes('scoping-lint-ignore')) continue
      if (SCOPED.has(key)) {
        // SCOPED 키는 by_dest(writeByDestValue)로 써야 한다. top-level 직접 쓰기는 단일 목적지
        // (또는 토큰 미해석) fallback 에서만 정당 — 그 줄에 // scoping-fallback-ok 로 명시 허용.
        // 안 그러면 다중 목적지 read(strict flatten)가 top-level scoped 값을 떨궈 데이터가 증발한다.
        if (!lineText.includes('scoping-fallback-ok')) {
          fallbackProblems.push({ file: path.relative(ROOT, file), line, key })
        }
        continue
      }
      if (GLOBAL.has(key) || SCOPING_LINT_BASELINE.has(key) || KEY_BLACKLIST_PROPS.has(key)) continue
      problems.push({ file: path.relative(ROOT, file), line, key })
    }
  }
}

// ── 3) 보고 ───────────────────────────────────────────────────────────────
function groupByKey(list) {
  const m = new Map()
  for (const p of list) {
    if (!m.has(p.key)) m.set(p.key, [])
    m.get(p.key).push(`${p.file}:${p.line}`)
  }
  return m
}

let failed = false

if (problems.length > 0) {
  failed = true
  const byKey = groupByKey(problems)
  console.error(`✗ destination-scoping lint: 미분류 case.data 키 ${byKey.size}종\n`)
  for (const [key, locs] of [...byKey].sort()) {
    console.error(`  • ${key}`)
    for (const l of locs.slice(0, 4)) console.error(`      ${l}`)
    if (locs.length > 4) console.error(`      … +${locs.length - 4}`)
  }
  console.error(
    '\n각 키를 분류하세요 (destination-scoped-fields.ts):\n' +
    '  - 목적지마다 달라야 함 → DESTINATION_SCOPED_FIELD_KEYS + 쓰기를 by_dest 로\n' +
    '  - 케이스 공통(동물·보호자 신원 등) → GLOBAL_CASE_DATA_KEYS\n' +
    '  - 케이스 data 가 아닌 오탐 → 그 줄에 // scoping-lint-ignore',
  )
}

if (fallbackProblems.length > 0) {
  failed = true
  const byKey = groupByKey(fallbackProblems)
  console.error(`\n✗ destination-scoping lint: SCOPED 키를 top-level 에 직접 쓰는 지점 ${byKey.size}종\n`)
  for (const [key, locs] of [...byKey].sort()) {
    console.error(`  • ${key}`)
    for (const l of locs.slice(0, 6)) console.error(`      ${l}`)
    if (locs.length > 6) console.error(`      … +${locs.length - 6}`)
  }
  console.error(
    '\nSCOPED 키는 다중 목적지 read 가 by_dest[활성목적지]만 신뢰하고 top-level 은 떨군다(증발).\n' +
    '  - 다중 목적지에서 쓸 수 있는 경로면 → resolveWriteToken/resolveTabActiveDest 로 활성목적지를\n' +
    '    해석해 writeByDestValue 로 저장 (예: updateVetVisitDate, updateJpExportQuarantineFields).\n' +
    '  - 토큰이 null 일 때(목적지 없음/단일)만 도달하는 정당한 fallback 이면 → 그 줄에 // scoping-fallback-ok',
  )
}

if (failed) process.exit(1)
console.log('✓ destination-scoping lint: 미분류 키 없음 + SCOPED 키 top-level 직접 쓰기 없음')
process.exit(0)
