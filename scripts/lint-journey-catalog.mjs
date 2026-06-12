#!/usr/bin/env node
/**
 * 여정 카탈로그 정합성 정적 분석 — 새 목적지를 추가할 때 반복됐던 "조용한 누락"을 빌드에서 잡는다.
 *
 * 배경: 목적지별 카드(catalog + destination-overrides)는 검증 룰 id·검역 필드를 문자열로
 * 참조한다. 오타·삭제·등록 누락이 있어도 타입에러가 안 나서 운영 중에야 발견됐다
 * (예: override validationIds 의 체크가 어디에도 없어 배지가 안 뜸, 검역 필드를 스코핑
 * 명단에 안 넣어 다중 목적지 누수). 이 lint 가 그 깜빡을 PR 단계에서 막는다.
 *
 * 검사 3종:
 *   1) validationIds 무결성 — catalog.ts + destination-overrides.ts 의 모든 validationIds 항목이
 *      procedure-checks/*.ts 에 정의된 실제 check id 인가. (오타·삭제 감지)
 *   2) quarantine 필드 스코핑 — done: 'quarantine:<field>' 의 field 와 그 짝(_confirmed)이
 *      DESTINATION_SCOPED_FIELD_KEYS 에 등록됐는가. (다중 목적지 누수 차단)
 *   3) descriptionBySpecies 폴백 — descriptionBySpecies 를 쓰는 base 카드는 description(종 미상
 *      폴백)도 있는가. (종 분기 카드의 폴백 누락 감지)
 *
 * Usage:  node scripts/lint-journey-catalog.mjs
 * Exit 0 = clean, Exit 1 = 문제 발견.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DOMAIN = path.join(ROOT, 'packages/domain/src')

const read = (rel) => readFileSync(path.join(DOMAIN, rel), 'utf-8')

const problems = []

// ── 1) validationIds 무결성 ───────────────────────────────────────────────
// 모든 procedure-check id 수집 (procedure-checks/*.ts 의 `id: '...'`).
const checkIds = new Set()
const checksDir = path.join(DOMAIN, 'procedure-checks')
for (const f of readdirSync(checksDir)) {
  if (!f.endsWith('.ts') || f === 'types.ts' || f === 'utils.ts' || f === 'registry.ts') continue
  const src = readFileSync(path.join(checksDir, f), 'utf-8')
  for (const m of src.matchAll(/\bid:\s*'([^']+)'/g)) checkIds.add(m[1])
}

// catalog + override 의 validationIds 배열 안 id 수집.
const catalogSrc = read('journey-steps/catalog.ts')
const overrideSrc = read('journey-steps/destination-overrides.ts')
const referenced = new Set()
for (const src of [catalogSrc, overrideSrc]) {
  for (const block of src.matchAll(/validationIds:\s*\[([\s\S]*?)\]/g)) {
    // 배열 안 라인 주석(// …)을 먼저 제거 — 주석에 쓰인 따옴표('주의'·'common.' 등)를 id 로 오인 방지.
    const cleaned = block[1].replace(/\/\/[^\n]*/g, '')
    for (const id of cleaned.matchAll(/'([^']+)'/g)) referenced.add(id[1])
  }
}
for (const id of referenced) {
  // common.* 는 common.ts, 그 외 <country>.* 는 해당 파일 — 위에서 모두 수집됨.
  if (!checkIds.has(id)) {
    problems.push(`validationIds 가 가리키는 체크 '${id}' 가 procedure-checks 에 없습니다 (오타·삭제?).`)
  }
}

// ── 2) quarantine 필드 스코핑 ─────────────────────────────────────────────
const scopedSrc = read('destination-scoped-fields.ts')
const scopedKeys = (() => {
  const m = scopedSrc.match(/DESTINATION_SCOPED_FIELD_KEYS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/m)
  if (!m) return new Set()
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]))
})()
for (const src of [catalogSrc, overrideSrc]) {
  for (const m of src.matchAll(/done:\s*'quarantine:([a-z_]+)'/g)) {
    const field = m[1]
    const confirmKey = field.replace(/_date$/, '_confirmed')
    if (!scopedKeys.has(field)) {
      problems.push(`검역 필드 '${field}' 가 DESTINATION_SCOPED_FIELD_KEYS 에 없습니다 (다중 목적지 누수 위험).`)
    }
    if (!scopedKeys.has(confirmKey)) {
      problems.push(`검역 확인 플래그 '${confirmKey}' 가 DESTINATION_SCOPED_FIELD_KEYS 에 없습니다.`)
    }
  }
}

// ── 3) descriptionBySpecies 폴백 (base catalog 한정) ──────────────────────
// base 카드가 descriptionBySpecies 를 가지면 description(종 미상 폴백)도 있어야 한다.
// 각 step 객체 리터럴 단위로 본다(catalog 의 최상위 배열 항목 = '{ id:' 로 시작).
for (const stepBlock of catalogSrc.split(/\n  \{\n/).slice(1)) {
  if (!/descriptionBySpecies:/.test(stepBlock)) continue
  // descriptionBySpecies 앞에 (같은 블록 내) description: 이 있는지.
  const idx = stepBlock.indexOf('descriptionBySpecies:')
  const before = stepBlock.slice(0, idx)
  if (!/\bdescription:\s*\n?\s*'/.test(before)) {
    const idm = stepBlock.match(/\bid:\s*'([^']+)'/)
    problems.push(
      `카드 '${idm ? idm[1] : '?'}' 가 descriptionBySpecies 만 있고 description(종 미상 폴백)이 없습니다.`,
    )
  }
}

// ── 결과 ──────────────────────────────────────────────────────────────────
if (problems.length === 0) {
  console.log('✓ journey-catalog lint: 정합성 문제 없음')
  process.exit(0)
}
console.error(`✗ journey-catalog lint: ${problems.length}건`)
for (const p of problems) console.error(`  • ${p}`)
console.error('\n수정 안내:')
console.error('  - validationIds 오타/삭제 → procedure-checks/<country>.ts 의 id 와 정확히 일치시키세요.')
console.error('  - 검역 필드 누수 → destination-scoped-fields.ts 의 DESTINATION_SCOPED_FIELD_KEYS 에 추가하세요.')
console.error('  - descriptionBySpecies 폴백 → 같은 카드에 description(통합문)도 정의하세요.')
process.exit(1)
