import type { CaseRow } from '../types'
import {
  getDestinationOverride,
  getTripType,
  parseDestinations,
  resolveActiveDestination,
  DESTINATION_OVERRIDES,
} from '../destination-config'
import type { CaseJourneyContext, StepApplicability, StepAppliesWhenSignal, StepDefinition } from './types'

/**
 * 케이스에서 step 적용 조건 필터에 필요한 컨텍스트(목적지·종·trip)를 뽑아낸다.
 *
 * 다중 목적지 케이스는 첫 토큰만 사용 (설계 §8). destination-config 키와 매칭되지 않으면
 * destinationKey=null — 'all' 매칭만 통과한다.
 */
export function buildCaseJourneyContext(caseRow: CaseRow): CaseJourneyContext {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const rawTokens = parseDestinations(caseRow.destination)
  const activeToken = resolveActiveDestination(caseRow.destination, null)
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
  }
}

/** 케이스에 적용되는 step 들을 order 순으로 반환. */
export function getStepsForCase(
  catalog: readonly StepDefinition[],
  caseRow: CaseRow,
): StepDefinition[] {
  const ctx = buildCaseJourneyContext(caseRow)
  return catalog
    .filter((s) => isStepApplicable(s.applicability, ctx))
    .filter((s) => appliesWhenMatches(s.appliesWhen, caseRow))
    .sort((a, b) => a.order - b.order)
}
