import type { CaseRow } from '../types'
import {
  getDestinationOverride,
  getTripType,
  parseDestinations,
  resolveActiveDestination,
  DESTINATION_OVERRIDES,
} from '../destination-config'
import { addDays, addYears, readRabiesEntries, readTiterEntries, resolveValidUntil, todayKst } from '../procedure-checks/utils'
import { resolveStepForDestination } from './destination-overrides'
import type { CaseJourneyContext, StepApplicability, StepAppliesWhenSignal, StepDefinition } from './types'

/**
 * 케이스에서 step 적용 조건 필터에 필요한 컨텍스트(목적지·종·trip)를 뽑아낸다.
 *
 * 다중 목적지 케이스는 첫 토큰만 사용 (설계 §8). destination-config 키와 매칭되지 않으면
 * destinationKey=null — 'all' 매칭만 통과한다.
 */
export function buildCaseJourneyContext(
  caseRow: CaseRow,
  activeDestination?: string | null,
): CaseJourneyContext {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const rawTokens = parseDestinations(caseRow.destination)
  // activeDestination 이 명시되고 목적지 목록에 포함돼 있으면 그걸 사용, 아니면 첫 토큰
  const explicit =
    activeDestination && rawTokens.includes(activeDestination) ? activeDestination : null
  const activeToken = explicit ?? resolveActiveDestination(caseRow.destination, null)
  const destinationKey = activeToken ? findDestinationKey(activeToken) : null

  const speciesRaw = typeof data.species === 'string' ? data.species.toLowerCase() : ''
  const species: 'dog' | 'cat' | null =
    speciesRaw === 'dog' || speciesRaw === '강아지' || speciesRaw === '개'
      ? 'dog'
      : speciesRaw === 'cat' || speciesRaw === '고양이'
        ? 'cat'
        : null

  const tripType = getTripType(data, activeToken ?? rawTokens[0] ?? null)

  return {
    destinationKey,
    destinationToken: activeToken,
    species,
    tripType,
  }
}

/** destination 토큰(예: '일본', 'france')을 DESTINATION_OVERRIDES 키('japan', 'eu')로 정규화. */
function findDestinationKey(destinationToken: string): string | null {
  const override = getDestinationOverride(destinationToken)
  if (!override) return null
  for (const [key, value] of Object.entries(DESTINATION_OVERRIDES)) {
    if (value === override) return key
  }
  return null
}

/** 한 step 의 적용 조건이 케이스 컨텍스트에 맞는지. */
export function isStepApplicable(applicability: StepApplicability, ctx: CaseJourneyContext): boolean {
  // 목적지 — 'all' 또는 destinationKey 가 배열에 포함되어야 함
  if (applicability.destinations !== 'all') {
    if (!ctx.destinationKey) return false
    if (!applicability.destinations.includes(ctx.destinationKey)) return false
  }
  // 종 — 'all' 또는 매칭. species 미상은 모든 종 통과(보수적으로 보여줌)
  if (applicability.species !== 'all' && ctx.species && applicability.species !== ctx.species) {
    return false
  }
  // 왕복/편도 — 'all' 또는 매칭
  if (applicability.tripType !== 'all' && applicability.tripType !== ctx.tripType) {
    return false
  }
  return true
}

/**
 * 데이터 조건부 노출 — step 의 appliesWhen 시그널이 케이스 데이터와 맞는지.
 * 정의 안 된 시그널은 항상 통과 (보수적). done-resolver 와 별도로 정의해 모듈 간
 * 순환 의존을 피한다. 새 시그널 추가 시 types.ts 의 union 도 함께 확장.
 */
function appliesWhenMatches(signal: StepAppliesWhenSignal | undefined, caseRow: CaseRow): boolean {
  if (!signal) return true
  switch (signal) {
    case 'has-extra-rabies': {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const arr = data.rabies_dates
      if (!Array.isArray(arr)) return false
      let count = 0
      for (const rec of arr) {
        const date =
          typeof rec === 'string'
            ? rec
            : rec && typeof rec === 'object'
              ? (rec as { date?: unknown }).date
              : null
        if (typeof date === 'string' && date.length >= 10) count++
      }
      return count >= 3
    }
    case 'has-extra-titer': {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const arr = data.rabies_titer_records
      if (!Array.isArray(arr)) return false
      let count = 0
      for (const rec of arr) {
        const date =
          rec && typeof rec === 'object'
            ? (rec as { date?: unknown }).date
            : null
        if (typeof date === 'string' && date.length >= 10) count++
      }
      return count >= 2
    }
    case 'rabies-extra-applicable': {
      // (1) 이미 3차+ 입력 — 기존 has-extra-rabies 와 동일 의미. 입력된 기록을 계속
      //     표시할 수 있어야 하므로 OR 의 한 쪽.
      // (2) 직전 광견병 접종의 면역 유효기간 만료 30일 전 — 오늘 기준 사전 안내.
      //     일본 입국일과 무관하게 '곧 만료되니 재접종 준비' 를 알린다.
      // (3) 면역 유효기간이 일본 입국일 전에 만료 — 입국 전 재접종 필수.
      //     입국일은 보호자가 입력한 entry_date 만 본다 — departure_date 폴백 안 씀.
      //     항공권 step 미완료 등으로 보호자가 입력하지 않은 departure_date 잔여값이
      //     남아 있어도 그걸로 step 을 띄우지 않는다. entry_date 미입력이면 (2) 만 적용.
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length >= 3) return true
      // (2)(3) 은 1·2차 프라임 시리즈가 끝난 뒤에만 의미 — 1차만 입력된 상태면
      // 다음 단계는 2차 백신이지 추가 백신이 아니다 (1차 유효기간 만료/임박
      // 안내는 2차 백신 step 담당). rabies 2개 미만이면 미노출.
      if (rabies.length < 2) return false

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return false

      // 이미 만료된 면역은 '추가 백신(부스터)' 대상이 아니다 — 유효기간 경과 후
      // 접종은 부스터가 아닌 새 기초접종이라, 1·2차부터 다시 하는 재시작 상황이다.
      if (validUntil < todayKst()) return false

      // (2) 아직 유효하지만 만료 30일 전 (오늘 기준).
      if (validUntil < addDays(todayKst(), 30)) return true

      // (3) 입국일 전 만료.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date : ''
      return !!entry && validUntil < entry
    }
    case 'titer-extra-applicable': {
      // 동일 패턴 (rabies-extra-applicable):
      // (1) 이미 2회+ 항체 검사 입력됨
      // (2) 항체 검사 유효기간(채혈일 + 2년) 만료 30일 전 — 오늘 기준 사전 안내.
      // (3) 항체 검사 유효기간이 일본 입국일 전에 만료 — 재검사 필요.
      //     입국일은 entry_date 만 본다 (departure_date 폴백 안 씀) — rabies 와 동일.
      const titers = readTiterEntries(caseRow)
      if (titers.length >= 2) return true
      if (titers.length === 0) return false

      // 가장 최근(=date 기준 최신) 항체 검사의 유효기간(채혈일 + 2년).
      const latest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const validUntil = addYears(latest.date, 2)
      if (!validUntil) return false

      // (2) 만료 30일 전 (오늘 기준).
      if (validUntil < addDays(todayKst(), 30)) return true

      // (3) 입국일 전 만료.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date : ''
      return !!entry && validUntil < entry
    }
  }
}

/**
 * 케이스에 적용되는 step 들을 order 순으로 반환. destination override 가 머지된 step 을 돌려준다 —
 * 호출자는 done/title/inputs 등 모든 필드가 일본·EU 등 destinationKey 별로 정확한 값으로 채워진 상태로 받는다.
 *
 * 머지를 여기서 한 번에 하는 이유: applicable 배열을 받는 모든 호출자(scenario·page·docs·checklist)에서
 * base 의 done 시그널(예: 'departure' = 'departure-past')이 평가되어 일본 'departure'(= '일본 수입 동물검역')의
 * 검역일+확인 룰(has-jp-import-quarantine)을 우회하던 버그가 있었다. 단일 출처로 정돈.
 *
 * destinationKey 가 null 이면 머지는 no-op (resolveStepForDestination 이 base 그대로 반환).
 */
export function getStepsForCase(
  catalog: readonly StepDefinition[],
  caseRow: CaseRow,
): StepDefinition[] {
  const ctx = buildCaseJourneyContext(caseRow)
  return catalog
    .filter((s) => isStepApplicable(s.applicability, ctx))
    .filter((s) => appliesWhenMatches(s.appliesWhen, caseRow))
    .map((s) => resolveStepForDestination(s, ctx.destinationKey))
    .sort((a, b) => a.order - b.order)
}
