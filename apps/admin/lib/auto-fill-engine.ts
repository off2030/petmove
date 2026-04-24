import type { SupabaseClient } from '@supabase/supabase-js'
import { DESTINATION_OVERRIDES, matchesDestinationKey } from '@petmove/domain'

/**
 * 자동 채움 엔진.
 *
 * 사용자가 어떤 필드를 업데이트하면, 매칭되는 org_auto_fill_rules 를 실행해
 * 타겟 필드를 자동으로 채운다. 체이닝 지원 — 자동 채워진 필드가 다른 규칙의
 * 트리거가 되면 cascading 으로 이어서 실행. 무한 루프 방지를 위해 visited
 * 추적 + 최대 iteration.
 */

// departure_date 만 column, 나머지는 전부 data 안.
const COLUMN_KEYS = new Set(['departure_date'])

const COLUMN_DATE_KEYS = ['departure_date'] as const
// 배열 필드 — 각 entry 는 {date, ...}
const ARRAY_DATE_FIELDS = new Set([
  'rabies_dates',
  'general_vaccine_dates',
  'civ_dates',
  'kennel_cough_dates',
  'internal_parasite_dates',
  'external_parasite_dates',
  'heartworm_dates',
])

interface RuleRow {
  id: string
  destination_key: string
  species_filter: string
  trigger_field: string
  target_field: string
  offsets_days: number[]
  overwrite_existing: boolean
  enabled: boolean
}

interface CaseSnapshot {
  destination: string | null
  data: Record<string, unknown>
}

interface FieldPath {
  arrayName: string | null
  index: number | null
}

function parsePath(field: string): FieldPath {
  const m = field.match(/^([a-z_]+)\[(\d+)\]$/)
  if (m) return { arrayName: m[1], index: Number(m[2]) }
  return { arrayName: null, index: null }
}

function readScalarDate(c: CaseSnapshot, key: string): string | null {
  if (key === 'departure_date') {
    // departure_date 는 column. 호출부에서 data 에 섞어 전달할 수도 있으므로 검사.
    const v = c.data['departure_date'] ?? (c as unknown as Record<string, unknown>)['departure_date']
    return typeof v === 'string' && v ? v : null
  }
  const v = c.data[key]
  return typeof v === 'string' && v ? v : null
}

function readArrayEntryDate(c: CaseSnapshot, arrayName: string, index: number): string | null {
  const arr = c.data[arrayName]
  if (!Array.isArray(arr)) return null
  const entry = arr[index] as { date?: string } | undefined
  return entry?.date ?? null
}

function readTriggerDate(c: CaseSnapshot, triggerField: string): string | null {
  const { arrayName, index } = parsePath(triggerField)
  if (arrayName && index !== null) return readArrayEntryDate(c, arrayName, index)
  return readScalarDate(c, triggerField)
}

function addDays(dateStr: string, offsetDays: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(d.getTime())) return dateStr
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function destinationMatches(ruleKey: string, caseDestination: string | null): boolean {
  if (!caseDestination) return false
  // config group key?
  if (ruleKey in DESTINATION_OVERRIDES) {
    return matchesDestinationKey(caseDestination, ruleKey as keyof typeof DESTINATION_OVERRIDES)
  }
  // 자유 문자열: case.destination 에 substring 이 있으면 match
  return caseDestination.toLowerCase().includes(ruleKey.toLowerCase())
}

function speciesMatches(ruleSpecies: string, caseSpecies: string): boolean {
  if (ruleSpecies === 'all') return true
  return ruleSpecies === caseSpecies
}

/**
 * 트리거 필드와 사용자가 변경한 필드가 같은 "패밀리" 인지 판정.
 * - 스칼라 (departure_date): exact match
 * - 배열 인덱스 (rabies_dates[0]): changedField == 'rabies_dates' 이면 match
 * - 배열 전체 (internal_parasite_dates — trigger 으로 사용되지 않음)
 */
function triggerMatchesChange(triggerField: string, changedField: string): boolean {
  const { arrayName } = parsePath(triggerField)
  if (arrayName) return arrayName === changedField
  return triggerField === changedField
}

/**
 * 타겟 필드에 새 값을 써넣은 data 객체를 반환. 기존 값이 있고 overwrite=false 면
 * 그대로 유지. 쓴 필드는 writtenTargets 에 기록해서 chain 을 위한 "바뀐 필드"
 * 로 추적.
 */
function applyRuleToData(
  data: Record<string, unknown>,
  rule: RuleRow,
  triggerDate: string,
  writtenTargets: Set<string>,
): Record<string, unknown> {
  const { arrayName, index } = parsePath(rule.target_field)
  const offsets = rule.offsets_days

  // 타겟이 배열 전체 (인덱스 없음) — offsets 만큼 새 entry 생성
  if (arrayName && index === null) {
    // wait — 실제로 이 경로는 arrayName !== null && index === null 만 매치함.
    // 하지만 parsePath 는 '[n]' 있을 때만 arrayName 반환. 없으면 arrayName=null.
    // => 도달 안 함. 대신 아래 'else' 에서 처리.
  }

  // 타겟이 배열 전체 (raw): trigger_field 가 'internal_parasite_dates' 같은 이름
  if (!arrayName && ARRAY_DATE_FIELDS.has(rule.target_field)) {
    const existing = (data[rule.target_field] as Array<{ date?: string }> | undefined) ?? []
    const hasAnyDate = existing.some((e) => e?.date)
    if (hasAnyDate && !rule.overwrite_existing) return data
    const newEntries = offsets.map((off) => ({ date: addDays(triggerDate, off) }))
    writtenTargets.add(rule.target_field)
    return { ...data, [rule.target_field]: newEntries }
  }

  // 타겟이 배열 인덱스 — 특정 slot 에 값
  if (arrayName && index !== null) {
    const offset = offsets[0] ?? 0
    const targetDate = addDays(triggerDate, offset)
    const existing = (data[arrayName] as Array<{ date?: string }> | undefined) ?? []
    const cur = existing[index]?.date
    if (cur && !rule.overwrite_existing) return data
    const next = [...existing]
    while (next.length < index + 1) next.push({ date: '' } as { date?: string })
    next[index] = { ...(existing[index] ?? {}), date: targetDate }
    writtenTargets.add(arrayName)
    return { ...data, [arrayName]: next }
  }

  // 스칼라
  const cur = data[rule.target_field]
  if (cur && !rule.overwrite_existing) return data
  const offset = offsets[0] ?? 0
  writtenTargets.add(rule.target_field)
  return { ...data, [rule.target_field]: addDays(triggerDate, offset) }
}

/**
 * Entry point — 필드 변경 후 호출. 매칭되는 규칙 실행 + chaining.
 */
export async function applyAutoFillRules(
  supabase: SupabaseClient,
  caseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data: row, error: fetchErr } = await supabase
      .from('cases')
      .select('org_id, destination, departure_date, data')
      .eq('id', caseId)
      .single()
    if (fetchErr || !row) return { ok: false, error: fetchErr?.message ?? 'case not found' }

    const orgId = (row as { org_id: string }).org_id
    const destination = (row as { destination: string | null }).destination
    const baseData = ((row as { data: Record<string, unknown> | null }).data ?? {}) as Record<string, unknown>
    // departure_date 를 data 에도 포함시켜 readTriggerDate 에서 쉽게 읽도록
    const snapshot: CaseSnapshot = {
      destination,
      data: { ...baseData, departure_date: (row as { departure_date: string | null }).departure_date ?? undefined },
    }
    const species = typeof snapshot.data.species === 'string' ? (snapshot.data.species as string) : ''

    // 모든 enabled 규칙
    const { data: rulesRaw, error: rulesErr } = await supabase
      .from('org_auto_fill_rules')
      .select('*')
      .eq('org_id', orgId)
      .eq('enabled', true)
    if (rulesErr) return { ok: false, error: rulesErr.message }
    const rules = (rulesRaw ?? []) as RuleRow[]

    // 매칭 필터: 목적지 + 종
    const matchedRules = rules.filter(
      (r) => destinationMatches(r.destination_key, destination) && speciesMatches(r.species_filter, species),
    )
    if (matchedRules.length === 0) return { ok: true }

    // 반복적으로 적용 — 새로 쓴 필드가 다른 규칙의 trigger 에 해당하면 한 번 더.
    const MAX_ITER = 5
    let dataMut = { ...snapshot.data }
    const processedTriggers = new Set<string>()
    const writtenTargetsAll = new Set<string>()

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const written = new Set<string>()
      for (const rule of matchedRules) {
        const triggerKey = rule.trigger_field
        if (processedTriggers.has(triggerKey)) continue
        const triggerDate = readTriggerDate({ destination, data: dataMut }, triggerKey)
        if (!triggerDate) continue
        dataMut = applyRuleToData(dataMut, rule, triggerDate, written)
      }
      if (written.size === 0) break
      for (const t of written) {
        writtenTargetsAll.add(t)
        processedTriggers.add(t)
      }
      // 이번 iteration 에 써진 triggers 를 다음 loop 에서 처리되도록 reset
      // matchedRules 의 trigger_field 가 처음 iteration 에서는 false 인 경우(데이터 아직 없음) 도
      // 다음 iter 에서 true 가 됨.
      for (const rule of matchedRules) processedTriggers.delete(rule.trigger_field)
      // chain 이 감지된 필드만 이후 iter 에서 처리됨 — 위 loop 가 triggerDate 로 자연스럽게 걸러냄
    }

    if (writtenTargetsAll.size === 0) return { ok: true }

    // departure_date 가 data 에 섞여있을 수 있으니 제거 (DB column 과 중복 방지)
    delete (dataMut as { departure_date?: unknown }).departure_date

    const { error: updErr } = await supabase
      .from('cases')
      .update({ data: dataMut })
      .eq('id', caseId)
    if (updErr) return { ok: false, error: updErr.message }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export { COLUMN_KEYS, COLUMN_DATE_KEYS, ARRAY_DATE_FIELDS }
