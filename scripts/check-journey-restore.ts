/**
 * 지난 여정 '되돌리기' 계약 검사 — 순수 도메인(DB 접근 없음).
 *
 * 지키는 계약:
 *   ① 보관 직전에 담은 스냅샷으로 되돌리면 **원래 데이터가 그대로 돌아온다**
 *      (특히 단일 여행지 케이스 — 실데이터가 top-level 에 살아서 가장 위험하다).
 *   ② 되돌리기는 **덮어쓰지 않는다** — 보관 뒤 그 자리에 들어온 새 데이터를 밀지 않는다.
 *   ③ 되돌릴 수 없는 경우(스냅샷 없음·이미 진행 중·상한 초과)는 이유를 정확히 돌려준다.
 *
 * 왜 필요한가: 여행지 칩의 작은 보관 버튼은 오조작이 쉬운데, 보관은 그 여행지의 by_dest·
 * top-level 스코프 필드·출국일 컬럼을 전부 지운다. 되돌리기가 유일한 안전망이라 조용히
 * 깨지면 안 된다(2026-08-21 신설).
 */
import { DESTINATION_SCOPED_FIELD_KEYS } from '../packages/domain/src/destination-scoped-fields'
import {
  captureJourneySnapshot,
  planJourneyRestore,
  summarizeJourney,
  type PastJourneySummary,
} from '../packages/domain/src/journey-steps/lifecycle'

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    실제: ${JSON.stringify(actual)}\n    기대: ${JSON.stringify(expected)}`}`,
  )
}

type Row = {
  destination: string | null
  departure_date: string | null
  data: Record<string, unknown>
}

/**
 * 보관(demote) 시뮬레이션 — markJourneyCompleteAdmin / finishJourney 가 하는 정리와 같다.
 * 스냅샷 채집은 **실제 도메인 함수**를 쓴다(테스트가 검증하려는 대상이므로).
 */
function demote(row: Row, dest: string): Row {
  const data = row.data
  const snapshot = captureJourneySnapshot({
    destination: dest,
    data,
    destinationColumn: row.destination,
    departureColumn: row.departure_date,
  })
  const byDest = { ...((data.by_dest as Record<string, unknown>) ?? {}) }
  delete byDest[dest]
  const tripType = { ...((data.trip_type as Record<string, unknown>) ?? {}) }
  delete tripType[dest]
  const next: Record<string, unknown> = { ...data, by_dest: byDest, trip_type: tripType }
  for (const k of DESTINATION_SCOPED_FIELD_KEYS) delete next[k]
  const entry: PastJourneySummary = {
    ...summarizeJourney(
      { destination: dest, tripType: 'round', departureDate: row.departure_date, returnDate: null },
      'done',
      '2026-08-21',
    ),
    snapshot,
  }
  next.past_journeys = [...((data.past_journeys as PastJourneySummary[]) ?? []), entry]
  return {
    destination: (row.destination ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && t !== dest)
      .join(', '),
    departure_date: null,
    data: next,
  }
}

console.log('── 단일 여행지: top-level 실데이터 왕복 ─────────────')
{
  const before: Row = {
    destination: '일본',
    departure_date: '2026-12-06',
    data: {
      vet_visit_date: '2026-11-28',
      entry_flight_number: 'YP151',
      advance_notification_date: '2026-10-20',
      weight: '4.2', // 동물 단위(전역) — 보관해도 안 지워지고 복원 대상도 아니다.
    },
  }
  const after = demote(before, '일본')
  check('보관하면 top-level 스코프 필드가 사라진다', after.data.vet_visit_date, undefined)
  check('  동물 단위 필드는 그대로', after.data.weight, '4.2')
  check('  출국일 컬럼도 비워진다', after.departure_date, null)

  const plan = planJourneyRestore(after, 0)
  if ('reason' in plan) {
    failures++
    console.log(`✗ 복원 계획이 나오지 않음: ${plan.reason}`)
  } else {
    check('되돌리면 여행지가 돌아온다', plan.destination, '일본')
    check('  내원일 복원', plan.data.vet_visit_date, '2026-11-28')
    check('  항공편 복원', plan.data.entry_flight_number, 'YP151')
    check('  사전신고일 복원', plan.data.advance_notification_date, '2026-10-20')
    check('  출국일 컬럼 복원', plan.departure_date, '2026-12-06')
    check('  지난 여정 목록에서 제거', (plan.data.past_journeys as unknown[]).length, 0)
  }
}

console.log('\n── 다중 여행지: by_dest 왕복 + 토큰 순서 ────────────')
{
  const before: Row = {
    destination: '하와이, 일본',
    departure_date: null,
    data: {
      by_dest: {
        하와이: { departure_date: '2026-12-06', entry_airport: 'HNL' },
        일본: { departure_date: '2026-09-01', entry_airport: 'NRT' },
      },
      trip_type: { 하와이: 'round', 일본: 'one_way' },
    },
  }
  const after = demote(before, '일본')
  check('보관 후 남은 여행지', after.destination, '하와이')
  check('  일본 by_dest 삭제', (after.data.by_dest as Record<string, unknown>).일본, undefined)
  check('  하와이 by_dest 는 그대로', (after.data.by_dest as Record<string, Record<string, unknown>>).하와이.entry_airport, 'HNL')

  const plan = planJourneyRestore(after, 0)
  if ('reason' in plan) {
    failures++
    console.log(`✗ 복원 계획이 나오지 않음: ${plan.reason}`)
  } else {
    check('원래 순서 자리로 복귀', plan.destination, '하와이, 일본')
    check(
      '  일본 by_dest 복원',
      (plan.data.by_dest as Record<string, Record<string, unknown>>).일본,
      { departure_date: '2026-09-01', entry_airport: 'NRT' },
    )
    check('  왕복/편도 구분 복원', (plan.data.trip_type as Record<string, unknown>).일본, 'one_way')
    check(
      '  하와이는 건드리지 않음',
      (plan.data.by_dest as Record<string, Record<string, unknown>>).하와이.entry_airport,
      'HNL',
    )
  }
}

console.log('\n── 덮어쓰기 금지 ───────────────────────────────────')
{
  const before: Row = {
    destination: '일본',
    departure_date: '2026-12-06',
    data: { vet_visit_date: '2026-11-28' },
  }
  const after = demote(before, '일본')
  // 보관 뒤 그 자리에 새 여정이 들어와 top-level 을 채운 상황.
  const withNew: Row = {
    destination: '태국',
    departure_date: '2027-03-01',
    data: { ...after.data, vet_visit_date: '2027-02-25' },
  }
  const plan = planJourneyRestore(withNew, 0)
  if ('reason' in plan) {
    failures++
    console.log(`✗ 복원 계획이 나오지 않음: ${plan.reason}`)
  } else {
    check('새 여정의 내원일을 덮지 않는다', plan.data.vet_visit_date, '2027-02-25')
    check('  새 여정의 출국일도 덮지 않는다', plan.departure_date, '2027-03-01')
    check('  여행지에는 추가된다', plan.destination, '태국, 일본')
  }
}

console.log('\n── 되돌릴 수 없는 경우 ─────────────────────────────')
{
  const noSnap: Row = {
    destination: '태국',
    departure_date: null,
    data: {
      past_journeys: [
        { destination: '일본', departureDate: null, tripType: 'round', outcome: 'done', completedDate: '2026-05-01' },
      ],
    },
  }
  const r1 = planJourneyRestore(noSnap, 0)
  check('스냅샷 없는 옛 기록', 'reason' in r1 ? r1.reason : null, 'no-snapshot')

  const r2 = planJourneyRestore(noSnap, 5)
  check('없는 인덱스', 'reason' in r2 ? r2.reason : null, 'not-found')

  const base: Row = { destination: '일본', departure_date: null, data: { vet_visit_date: '2026-01-01' } }
  const demoted = demote(base, '일본')
  const readded: Row = { ...demoted, destination: '일본' }
  const r3 = planJourneyRestore(readded, 0)
  check('이미 진행 중인 여행지', 'reason' in r3 ? r3.reason : null, 'already-active')

  const full: Row = { ...demoted, destination: '태국, 미국, 호주' }
  const r4 = planJourneyRestore(full, 0)
  check('진행 중 여행지 상한 초과', 'reason' in r4 ? r4.reason : null, 'at-limit')
}

console.log(`\n${failures === 0 ? '✓ 전부 통과' : `✗ ${failures}건 실패`}`)
process.exit(failures === 0 ? 0 : 1)
