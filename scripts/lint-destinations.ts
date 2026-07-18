#!/usr/bin/env tsx
/**
 * 목적지 **동작(구조) 스냅샷 가드** — 목적지 아키텍처 리팩터가 기존 동작을 바꾸지 않았음을
 * 증명하는 안전망.
 *
 * 배경: 새 목적지를 추가하려면 87곳에 opt-in 등록이 필요하고, 그 목록들을 "프로파일에서
 * 파생"하도록 바꾸는 리팩터를 진행 중이다(docs/destination-architecture-design.md).
 * 이 repo 에는 테스트 프레임워크가 없으므로, 검증된 기존 관용구(lint:copy 골든 스냅샷)를
 * 그대로 차용해 무동작(behaviour-preserving)을 증명한다.
 *
 * 동작: 전 목적지 × (개/고양이) × (편도/왕복)에 대해 **구조**를 골든 파일로 떠놓는다.
 *   - 카드 목록(order:id:done)        ← applicability·override 파생 결과
 *   - 필수 서류 목록(id)              ← SPECS / SPECS_BY_KEY 파생 결과
 *   - 적용 check id 목록              ← procedure-checks registry 파생 결과
 *   - 주요 상수(1회접종·1년백신·항체유효·내원윈도우·검역배지)
 *
 * 문구(text)는 lint:copy 가 이미 담당하므로 여기선 **구조만** 본다(중복 회피).
 *
 * 리팩터 절차:
 *   1) 리팩터 전에 `--write` 로 골든 생성
 *   2) 목록 하나를 파생으로 교체
 *   3) 이 가드가 "변경 없음"이면 무동작 — 다르면 그 목적지가 회귀한 것
 *
 * Usage:
 *   tsx scripts/lint-destinations.ts           # 검사 (CI). 골든과 다르면 exit 1.
 *   tsx scripts/lint-destinations.ts --write    # 의도적 변경 후 골든 재생성.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import {
  getStepsForCase,
  SINGLE_DOSE_RABIES_DESTINATIONS,
  RABIES_ONE_YEAR_VALIDITY_DESTINATIONS,
  FLIGHT_DATE_IMPORT_QUARANTINE_DESTINATIONS,
  FLIGHT_DATE_RETURN_QUARANTINE_DESTINATIONS,
} from '../packages/domain/src/journey-steps/applicability'
import { TITER_ENTRY_VALIDITY_MONTHS } from '../packages/domain/src/journey-steps/titer-validity'
import {
  DESTINATION_OVERRIDES,
  getVetVisitWindowDays,
} from '../packages/domain/src/destination-config'
import { resolveRequiredDocs } from '../packages/domain/src/required-docs'
import { getChecksForCountry } from '../packages/domain/src/procedure-checks/registry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN = path.join(__dirname, 'destinations.snapshot.txt')

/** 목적지 키 → 대표 한글 토큰(첫 keyword). 카드·서류는 토큰 기준으로 해석된다. */
function tokenFor(key: string): string {
  const kw = DESTINATION_OVERRIDES[key]?.keywords ?? []
  const ko = kw.find((k) => /[가-힣]/.test(k))
  return ko ?? kw[0] ?? key
}

/** 스냅샷용 케이스 — 날짜는 고정값(오늘 의존 금지: 스냅샷이 매일 바뀌면 못 쓴다). */
function makeCase(token: string, species: 'dog' | 'cat', trip: 'round' | 'one_way') {
  return {
    id: 'snapshot',
    destination: token,
    species,
    pet_name: null,
    departure_date: '2026-06-01',
    data: {
      species,
      birth_date: '2024-01-01',
      trip_type: { [token]: trip },
      entry_date: '2026-06-01',
      ...(trip === 'round' ? { return_date: '2026-07-01' } : {}),
    },
  } as never
}

function renderDestination(key: string): string {
  const token = tokenFor(key)
  const lines: string[] = []
  lines.push(`=== ${key}  (token: ${token}) ===`)

  // 상수 — 파생 리팩터가 가장 먼저 건드릴 대상들.
  const titer = TITER_ENTRY_VALIDITY_MONTHS[key]
  lines.push(
    '  [consts] ' +
      [
        `singleDose=${SINGLE_DOSE_RABIES_DESTINATIONS.includes(key)}`,
        `oneYearVaccine=${RABIES_ONE_YEAR_VALIDITY_DESTINATIONS.includes(key)}`,
        `titerEntryMonths=${titer === undefined ? '-' : String(titer)}`,
        `vetWindowDog=${getVetVisitWindowDays(token, 'dog')}`,
        `vetWindowCat=${getVetVisitWindowDays(token, 'cat')}`,
        `flightImportBadge=${FLIGHT_DATE_IMPORT_QUARANTINE_DESTINATIONS.includes(key)}`,
        `flightReturnBadge=${FLIGHT_DATE_RETURN_QUARANTINE_DESTINATIONS.includes(key)}`,
      ].join(' '),
  )

  // 적용 check — registry 파생 결과(등록 누락이 여기서 드러난다).
  const checks = getChecksForCountry(key)
    .map((c) => c.id)
    .sort()
  lines.push(`  [checks:${checks.length}] ${checks.join(', ') || '(없음)'}`)

  // 카드·서류 — 종 × 트립 조합별 구조.
  for (const species of ['dog', 'cat'] as const) {
    for (const trip of ['round', 'one_way'] as const) {
      const c = makeCase(token, species, trip)
      const steps = getStepsForCase(JOURNEY_STEP_CATALOG, c)
      const cards = steps
        .map((s) => `${s.order}:${s.id}:${typeof s.done === 'string' ? s.done : 'fn'}`)
        .join('  ')
      lines.push(`  [cards ${species}/${trip}] ${cards}`)

      const docs = (resolveRequiredDocs(token, c) ?? []).map((d) => d.id).join(', ')
      lines.push(`  [docs  ${species}/${trip}] ${docs || '(없음)'}`)
    }
  }
  return lines.join('\n')
}

function build(): string {
  const keys = Object.keys(DESTINATION_OVERRIDES).sort()
  const header = [
    '# 목적지 동작(구조) 스냅샷 — scripts/lint-destinations.ts 로 자동 생성.',
    '# 문구(text)는 journey-copy.snapshot.txt 가 담당. 여기는 구조만.',
    `# 목적지 ${keys.length}개.`,
    '',
  ].join('\n')
  return header + keys.map(renderDestination).join('\n\n') + '\n'
}

const next = build()
const write = process.argv.includes('--write')

if (write) {
  writeFileSync(GOLDEN, next, 'utf8')
  console.log(`✓ destinations 스냅샷 재생성: ${path.relative(process.cwd(), GOLDEN)}`)
  console.log('  git diff 로 어떤 목적지의 무엇이 바뀌었는지 확인한 뒤 함께 커밋하세요.')
  process.exit(0)
}

let golden = ''
try {
  // CRLF 정규화 — .gitattributes(eol=lf)가 1차 방어지만, 이미 CRLF 로 체크아웃된
  // 워킹트리(lint-journey-copy.ts 와 같은 이중 방어)를 위해 읽을 때도 정규화한다.
  golden = readFileSync(GOLDEN, 'utf8').replace(/\r\n/g, '\n')
} catch {
  console.error('✗ 골든 스냅샷이 없습니다. `pnpm lint:dest:write` 로 먼저 생성하세요.')
  process.exit(1)
}

if (golden === next) {
  console.log('✓ destinations lint: 목적지 동작이 골든 스냅샷과 일치')
  process.exit(0)
}

// 어떤 목적지 블록이 바뀌었는지 알려준다(문구 가드와 동일한 UX).
const blockNames = (s: string) =>
  new Map(
    s
      .split(/\n(?==== )/)
      .filter((b) => b.startsWith('=== '))
      .map((b) => [b.slice(4, b.indexOf('  (token')), b] as const),
  )
const g = blockNames(golden)
const n = blockNames(next)
const changed = [...new Set([...g.keys(), ...n.keys()])].filter((k) => g.get(k) !== n.get(k))

console.error('✗ destinations lint: 목적지 동작이 골든 스냅샷과 다릅니다.')
console.error(`\n  바뀐 목적지 (${changed.length}개):`)
for (const k of changed) console.error(`    • ${k}${!g.has(k) ? ' (신규)' : !n.has(k) ? ' (사라짐)' : ''}`)
console.error('\n  리팩터 중이라면 이 목록이 비어 있어야 합니다(무동작).')
console.error('  의도한 변경이면 `pnpm lint:dest:write` 로 골든을 재생성해 함께 커밋하세요.')
process.exit(1)
