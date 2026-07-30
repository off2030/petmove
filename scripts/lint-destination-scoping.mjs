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

/**
 * ── 3-1) 계산된 키(액션 화이트리스트) 분류 강제 ────────────────────────────
 *
 * 위 스캔은 `nextData.KEY = …` 처럼 **리터럴로 쓴 키**만 본다. 그런데 date_array 카드들은
 * `nextData[fieldKey]` 로 쓴다 — 키가 런타임 변수라 스캔에 안 걸리고, 분류가 없어도 통과했다.
 * 이 구멍으로 infectious_disease_records 가 **목적지별이어야 하는데 미분류(=기본 전역)** 로
 * 굴러다녔다(2026-07-30 발견 — 호주용 3종 검사가 뉴질랜드 여정에서 '검사 완료'로 보였다).
 *
 * 그래서 서버 액션의 **허용 필드 화이트리스트**를 직접 읽어 그 키들의 분류를 검사한다.
 * 새 date_array 카드를 만들면 여기서 막힌다.
 */
const WHITELIST_SETS = [
  { file: 'apps/portal/lib/actions/cases.ts', name: 'PARASITE_FIELD_KEYS' },
  { file: 'apps/portal/lib/actions/cases.ts', name: 'VACCINE_ARRAY_FIELD_KEYS' },
]
const unclassifiedWhitelist = []
for (const { file, name } of WHITELIST_SETS) {
  let wsrc
  try {
    wsrc = readFileSync(path.join(ROOT, file), 'utf-8')
  } catch {
    continue
  }
  const wm = wsrc.match(new RegExp(`${name}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`, 'm'))
  if (!wm) continue
  for (const km of wm[1].matchAll(/'([^']+)'|"([^"]+)"/g)) {
    const key = km[1] ?? km[2]
    if (SCOPED.has(key) || GLOBAL.has(key)) continue
    unclassifiedWhitelist.push({ key, where: `${file} · ${name}` })
  }
}

/**
 * ── 3-2) 저장 후 폼 동기화는 flatten 한 뷰에서 ─────────────────────────────
 *
 * 서버 액션이 돌려주는 res.value 는 **raw** 다. 목적지별 키는 by_dest 에만 있고 top-level 은
 * 지워지므로, raw 로 읽으면 폼이 빈 값이 된다. 게다가 그 순간 form ≠ saved 라 dirty 가 켜져
 * 동기화 useEffect 마저 되돌려주지 못한다 — 입력한 값이 사라진 것처럼 보인다
 * (2026-07-30 전염병 검사에서 실제 발생).
 *
 * 필드가 전역이면 flatten 이 무해한 no-op 이므로 **예외 없이 flatten 을 요구**한다 —
 * "이 필드가 목적지별인가"를 매번 기억하지 않아도 되게.
 */
const RAW_READ_DIRS = ['apps/portal/components']
const rawReads = []
for (const rel of RAW_READ_DIRS) {
  for (const file of walk(path.join(ROOT, rel))) {
    const lines = readFileSync(file, 'utf-8').split('\n')
    lines.forEach((lineText, idx) => {
      if (!/res\.value\.data/.test(lineText)) return
      if (lineText.includes('scoping-lint-ignore')) return
      // 주석 줄은 규칙을 설명하는 문서라 제외.
      if (/^\s*(\/\/|\*)/.test(lineText)) return
      rawReads.push({ file: path.relative(ROOT, file), line: idx + 1 })
    })
  }
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

if (unclassifiedWhitelist.length > 0) {
  failed = true
  console.error(
    `\n✗ destination-scoping lint: 액션 화이트리스트에 있는데 **분류되지 않은 키** ${unclassifiedWhitelist.length}개\n`,
  )
  for (const { key, where } of unclassifiedWhitelist) console.error(`  • ${key}   (${where})`)
  console.error(
    '\n이 키들은 `nextData[fieldKey]` 처럼 **계산된 키**로 저장돼 위 스캔에 안 걸린다.\n' +
      '  목적지마다 달라야 하면 → DESTINATION_SCOPED_FIELD_KEYS + writeByDestValue 라우팅\n' +
      '  동물 단위 사실이면   → GLOBAL_CASE_DATA_KEYS\n' +
      '  분류 없이 두면 기본 전역이라 한 목적지에서 한 게 다른 목적지로 샌다.',
  )
}

if (rawReads.length > 0) {
  failed = true
  console.error(
    `\n✗ destination-scoping lint: 저장 후 **raw res.value.data** 를 읽는 지점 ${rawReads.length}곳\n`,
  )
  for (const { file, line } of rawReads) console.error(`  • ${file}:${line}`)
  console.error(
    '\n서버가 돌려주는 res.value 는 raw 다 — 목적지별 키는 by_dest 에만 있고 top-level 은 지워진다.\n' +
      '  raw 로 읽으면 폼이 빈 값이 되고, 그 순간 form ≠ saved 라 dirty 가 켜져 동기화\n' +
      '  useEffect 마저 되돌려주지 못한다(입력값이 사라진 것처럼 보임).\n' +
      '  → activeDestinationView(res.value, activeDest).data 로 평탄화해서 읽을 것.\n' +
      '  전역 필드면 flatten 이 no-op 이라 무해하다 — 필드별 예외를 두지 않는다.',
  )
}

if (failed) process.exit(1)
console.log(
  '✓ destination-scoping lint: 미분류 키 없음 + SCOPED top-level 직접 쓰기 없음 + 저장 후 flatten 준수',
)
process.exit(0)
