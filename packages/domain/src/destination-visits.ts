import type { CaseRow } from './types'
import { MAX_DESTINATIONS_PER_CASE, matchesDestinationKey, parseDestinations } from './destination-config'
import { DESTINATION_NAMES, destinationCountry, isRepeatDestination, nextDestinationVisit } from './destination-names'
import { DESTINATION_SCOPED_FIELD_KEYS, LEGACY_JAPAN_REPORT_KEYS } from './destination-scoped-fields'

/** 여정 추가의 순수 저장 계획. 국가명은 규칙 조회용, 회차 토큰은 일정·신고의 저장 키다. */
export function planCaseDestinationAddition(
  row: Pick<CaseRow, 'destination' | 'departure_date' | 'data'>,
  country: string,
  startedAt: string,
): { ok: true; token: string; destination: string; data: Record<string, unknown> } |
   { ok: false; error: string } {
  const base = destinationCountry(country)
  if (!DESTINATION_NAMES.includes(base)) return { ok: false, error: '등록된 국가를 선택해 주세요.' }
  const tokens = parseDestinations(row.destination)
  if (tokens.length >= MAX_DESTINATIONS_PER_CASE) {
    return { ok: false, error: `진행 중 여정은 최대 ${MAX_DESTINATIONS_PER_CASE}개까지 추가할 수 있습니다.` }
  }
  const data = { ...(row.data ?? {}) }
  const byDest = { ...((data.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}) }
  // 단일 → 다중 전환 전에 기존 여행의 legacy 값을 그 여행 슬롯으로 보존한다.
  if (tokens.length === 1) {
    const first = tokens[0]
    const entry = { ...(byDest[first] ?? {}) }
    for (const key of DESTINATION_SCOPED_FIELD_KEYS) {
      if (!(key in entry) && key in data) entry[key] = data[key]
      delete data[key]
    }
    if (!('departure_date' in entry)) entry.departure_date = row.departure_date
    byDest[first] = entry
  } else {
    // 기존 다중 국가에서도 일본 신고 신호는 전역이었다. 원래 일본 여행에만 귀속한다.
    const japan = tokens.find(t => !isRepeatDestination(t) && matchesDestinationKey(t, 'japan'))
    if (japan) {
      const entry = { ...(byDest[japan] ?? {}) }
      for (const key of LEGACY_JAPAN_REPORT_KEYS) {
        if (!(key in entry) && key in data) entry[key] = data[key]
        delete data[key]
      }
      byDest[japan] = entry
    }
  }
  const past = Array.isArray(data.past_journeys) ? data.past_journeys : []
  const docs = Array.isArray(data.documents) ? data.documents : []
  const used = [...tokens, ...Object.keys(byDest),
    ...Object.keys((data.dest_started_at as Record<string, unknown> | undefined) ?? {}),
    ...[...past, ...docs].flatMap(item =>
      item && typeof item === 'object' && typeof item.destination === 'string' ? [item.destination] : []),
  ]
  const token = nextDestinationVisit(base, used)
  byDest[token] = {}
  data.by_dest = byDest
  data.dest_started_at = {
    ...((data.dest_started_at as Record<string, unknown> | undefined) ?? {}),
    [token]: startedAt,
  }
  data.import_report_dismissed = false
  return { ok: true, token, destination: [...tokens, token].join(', '), data }
}
