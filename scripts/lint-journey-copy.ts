#!/usr/bin/env tsx
/**
 * 여정 카드 문구(copy) 목적지별 스냅샷 가드 — "한 목적지를 고치려다 다른 목적지까지 조용히
 * 바뀌는" 사고를 빌드에서 잡는다.
 *
 * 배경: vet-visit 같은 공용 카드(destinations:'all')의 description 은 한 군데에만 있어서,
 * base 문구를 고치면 그 카드를 쓰는 모든 목적지가 함께 바뀐다. 어디까지 바뀌는지 알려주는
 * 신호가 없어 의도 밖 목적지가 딸려 변하는 일이 반복됐다(예: 태국·필리핀 작업 중 base 를
 * 고쳐 일본 FormAC 안내가 사라진 회귀, 커밋 cb81b59b).
 *
 * 동작: 모든 (목적지 × 카드)의 '최종 해석된 문구'(base + destination-override 머지 결과)를
 * 골든 스냅샷 파일 하나로 떠놓는다. 문구를 바꾸면 이 파일의 git diff 가 곧 "어떤 목적지의
 * 어떤 카드가 바뀌었는지" 보고서가 된다. 일본만 바꿨는데 태국·필리핀 블록도 함께 떠 있으면
 * base 를 잘못 건드린 것 — 커밋 전에 바로 눈에 띈다.
 *
 * 골든 파일과 실제 코드가 어긋나면 (이 가드가) exit 1 → CI 가 빌드를 막는다.
 *
 * Usage:
 *   tsx scripts/lint-journey-copy.ts          # 검사 (CI). 골든과 다르면 exit 1.
 *   tsx scripts/lint-journey-copy.ts --write   # 문구를 의도적으로 바꾼 뒤 골든 재생성.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'
import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import {
  STEP_DESTINATION_OVERRIDES,
  resolveStepForDestination,
} from '../packages/domain/src/journey-steps/destination-overrides'
import { resolveRequiredDocs } from '../packages/domain/src/required-docs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN = path.join(__dirname, 'journey-copy.snapshot.txt')

// 스냅샷 대상 목적지 키 = '기본(override 없음)' + override 가 정의된 모든 목적지.
// override 없는 목적지(싱가포르·호주·말레이시아 등)는 전부 base 와 동일하므로 '기본' 블록이
// 대표한다. 새 override 목적지를 추가하면 여기 자동 포함된다(별도 명단 관리 불필요).
const BASE = '__base__'
/** 필수 서류 섹션 블록 키 — 변경 요약에서 목적지 블록과 함께 비교한다. */
const DOCS_SECTION = '필수 서류'
const DEST_KEYS = [BASE, ...Object.keys(STEP_DESTINATION_OVERRIDES)]

// 사람이 읽고 git diff 로 추적할 카피 필드만 스냅샷한다.
// links 포함 — 링크 버튼 라벨도 고객이 읽는 문구다. 빠져 있어서 15개 라벨을 한 번에
// 바꿨는데도 린트가 조용히 통과했다(2026-07-19 발견). URL 도 함께 떠서 링크가 바뀌면 diff 에 남는다.
// attachmentHint(첨부 안내)·attachmentLabel(저장 파일명) 포함 — 둘 다 고객이 읽거나
// 파일명으로 보게 되는 문구인데 어떤 스냅샷에도 없었다. 실제로 세 나라 첨부 안내를 바꾸고
// base 의 영문 저장 이름을 갈아끼웠는데 린트 5종이 모두 조용히 통과했다(2026-07-20 발견).
const COPY_FIELDS = [
  'title',
  'shortLabel',
  'cardLine',
  'doneSummary',
  'descriptionBySpecies',
  'description',
  'attachmentHint',
  'attachmentLabel',
  'links',
] as const

/**
 * 그 목적지에 이 카드가 뜨는가 — destinations + excludeDestinations 만 본다.
 * (종·트립 조합은 lint:dest 스냅샷 담당. 여기선 문구가 목적지별로 어떻게 해석되는지만 본다.)
 * '기본'(override 없는 목적지 대표) 블록은 destinations:'all' 카드만 싣는다.
 */
function appliesToDest(
  step: {
    applicability: {
      destinations: 'all' | string[]
      excludeDestinations?: string[]
      roundOnlyDestinations?: string[]
    }
  },
  destKey: string | null,
): boolean {
  const { destinations, excludeDestinations, roundOnlyDestinations } = step.applicability
  if (destKey && excludeDestinations?.includes(destKey)) return false
  // 왕복에만 뜨는 카드(태국·필리핀·베트남 등의 귀국용 항체검사)도 그 목적지 문구다.
  // 이 줄이 없어서 베트남 rabies-titer 문구를 바꿔도 린트가 조용히 통과했다(2026-07-19).
  if (destKey && roundOnlyDestinations?.includes(destKey)) return true
  if (destinations === 'all') return true
  if (destKey === null) return false // 기본 블록 = 전 목적지 공용 카드만
  return destinations.includes(destKey)
}

function destLabel(key: string): string {
  if (key === BASE) return '기본 — override 없는 모든 목적지(싱가포르·호주·말레이시아 등) 공용'
  if (key === DOCS_SECTION) return '필수 서류 — 서류탭 이름·발급처·설명문'
  return key
}

function renderField(name: string, value: unknown): string[] {
  if (value == null) return []
  if (name === 'descriptionBySpecies' && typeof value === 'object') {
    const out: string[] = []
    for (const [sp, text] of Object.entries(value as Record<string, string>)) {
      out.push(`  desc[${sp}]:`)
      for (const line of String(text).split('\n')) out.push(`      ${line}`)
    }
    return out
  }
  if (name === 'description') {
    const out: string[] = ['  desc:']
    for (const line of String(value).split('\n')) out.push(`      ${line}`)
    return out
  }
  if (name === 'links' && Array.isArray(value)) {
    const out: string[] = ['  links:']
    for (const l of value as Array<{ url?: string; label?: string }>) {
      out.push(`      ${l.label ?? ''}  →  ${l.url ?? ''}`)
    }
    return out
  }
  const short: Record<string, string> = {
    title: 'title',
    shortLabel: 'short',
    cardLine: 'card',
    doneSummary: 'done',
    attachmentHint: '첨부안내',
    attachmentLabel: '저장이름',
  }
  return [`  ${short[name]}: ${String(value)}`]
}

function buildSnapshot(): string {
  const lines: string[] = []
  lines.push('# 여정 카드 문구 — 목적지별 최종본 (자동 생성: scripts/lint-journey-copy.ts)')
  lines.push('#')
  lines.push('# ⚠️ 이 파일을 손으로 고치지 마세요. 카드 문구를 바꾼 뒤 아래로 재생성합니다:')
  lines.push('#     pnpm lint:copy:write')
  lines.push('#')
  lines.push('# 이 파일의 git diff 가 곧 "어떤 목적지의 어떤 카드 문구가 바뀌었는지" 보고서입니다.')
  lines.push('# 한 목적지만 바꿨는데 다른 목적지 블록도 함께 바뀌어 있으면, 공용(base) 문구를')
  lines.push('# 잘못 건드린 것입니다 — destination-overrides.ts 의 해당 목적지 override 에서만 고치세요.')
  lines.push('')

  for (const key of DEST_KEYS) {
    lines.push('═'.repeat(72))
    lines.push(`[${key}]  ${destLabel(key)}`)
    lines.push('═'.repeat(72))
    const destKey = key === BASE ? null : key
    for (const step of JOURNEY_STEP_CATALOG) {
      // 그 목적지에 실제로 뜨는 카드만 — applicability.destinations 를 존중한다.
      //
      // 예전엔 전 카드를 모든 목적지 블록에 실었다. 그래서 한 나라 전용 카드
      // (tw-export-quarantine 등)를 고치면 "바뀐 목적지 블록 14개"가 떠서, 정작 이 가드가
      // 잡아야 할 '의도 밖 목적지 누수'와 구분이 안 됐다(2026-07-19 발견).
      // 종·트립 조합은 여기서 구분하지 않으므로 어느 조합에든 해당하면 포함한다
      // (조합별 노출은 lint:dest 스냅샷이 담당).
      if (!appliesToDest(step, destKey)) continue
      const resolved = resolveStepForDestination(step, destKey) as Record<string, unknown>
      lines.push('')
      lines.push(`▸ ${step.id}`)
      for (const f of COPY_FIELDS) {
        for (const l of renderField(f, resolved[f])) lines.push(l)
      }
    }
    lines.push('')
  }

  // ── 필수 서류 이름·설명문 ───────────────────────────────────────────────
  // 서류탭에서 고객이 읽는 문구인데 어떤 스냅샷에도 없었다. lint:dest 는 서류 **id** 만
  // 기록해서, 이름을 바꿔도(예: '중국 동물위생증명서(动物卫生证书)' → '동물위생증명서')
  // 린트 4종이 모두 조용히 통과했다(2026-07-20 발견).
  lines.push('═'.repeat(72))
  lines.push(`[${DOCS_SECTION}]  목적지별 서류 이름·발급처·설명문`)
  lines.push('═'.repeat(72))
  const docCase = (token: string) =>
    ({
      id: 'lint',
      customer_name: 'lint',
      destination: token,
      // 왕복 기준 — roundTripOnly 서류(귀국용 항체·한국 수입검역증 등)까지 담는다.
      data: { species: 'dog', birth_date: '2000-01-01', trip_type: { [token]: 'round' } },
    }) as never
  for (const [key, override] of Object.entries(DESTINATION_OVERRIDES)) {
    const token = override.keywords?.[0]
    if (!token) continue
    const docs = resolveRequiredDocs(token, docCase(token)) ?? []
    lines.push('')
    lines.push(`▸ ${key} (${token})`)
    for (const d of docs) {
      lines.push(`   · ${d.name}   ← ${d.source ?? ''}`)
      for (const line of String(d.description ?? '').split('\n')) {
        if (line.trim()) lines.push(`       ${line}`)
      }
    }
  }
  lines.push('')

  return lines.join('\n').replace(/\s+$/, '') + '\n'
}

const snapshot = buildSnapshot()
const write = process.argv.includes('--write')

if (write) {
  writeFileSync(GOLDEN, snapshot, 'utf-8')
  console.log(`✓ journey-copy 스냅샷 재생성: ${path.relative(path.join(__dirname, '..'), GOLDEN)}`)
  console.log('  git diff 로 어떤 목적지가 바뀌었는지 확인한 뒤 함께 커밋하세요.')
  process.exit(0)
}

let golden = ''
try {
  // Windows(CRLF)/CI(LF) 차이로 헛failure 나지 않게 줄바꿈 정규화 후 비교.
  golden = readFileSync(GOLDEN, 'utf-8').replace(/\r\n/g, '\n')
} catch {
  console.error('✗ journey-copy 골든 스냅샷이 없습니다.')
  console.error('  처음이라면 `pnpm lint:copy:write` 로 생성하세요.')
  process.exit(1)
}

if (golden === snapshot) {
  console.log('✓ journey-copy lint: 목적지별 문구가 골든 스냅샷과 일치')
  process.exit(0)
}

// 어떤 목적지 블록이 바뀌었는지 요약(라인 비교).
const goldenBlocks = splitBlocks(golden)
const liveBlocks = splitBlocks(snapshot)
const changed: string[] = []
// DEST_KEYS + 서류 섹션. 서류 섹션을 빼먹으면 서류 이름을 바꿔도 "바뀐 블록 0개"로 떠서
// 실패는 하는데 어디가 바뀌었는지 안 보인다(2026-07-20 실제로 겪음).
for (const key of [...DEST_KEYS, DOCS_SECTION]) {
  if ((goldenBlocks[key] ?? '') !== (liveBlocks[key] ?? '')) changed.push(key)
}

console.error('✗ journey-copy lint: 목적지별 문구가 골든 스냅샷과 다릅니다.')
if (changed.length > 0) {
  console.error(`\n  바뀐 목적지 블록 (${changed.length}개):`)
  for (const k of changed) console.error(`    • ${destLabel(k)}`)
  console.error('\n  의도한 목적지만 바뀌었나요?')
  console.error('    - 한 목적지만 바꾸려 했는데 여러 목적지(특히 "기본")가 떴다면, 공용 base 문구를')
  console.error('      잘못 고친 것입니다. destination-overrides.ts 의 해당 목적지 override 에서만 고치세요.')
  console.error('    - 의도한 변경이 맞다면 `pnpm lint:copy:write` 로 골든을 재생성해 함께 커밋하세요.')
}
process.exit(1)

/** 골든/라이브 텍스트를 목적지 키별 블록 문자열로 쪼갠다(변경 목적지 요약용). */
function splitBlocks(text: string): Record<string, string> {
  const blocks: Record<string, string> = {}
  let current: string | null = null
  let buf: string[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\[([^\]]+)\]/)
    if (m) {
      if (current) blocks[current] = buf.join('\n')
      current = m[1]
      buf = []
    } else if (current) {
      buf.push(line)
    }
  }
  if (current) blocks[current] = buf.join('\n')
  return blocks
}
