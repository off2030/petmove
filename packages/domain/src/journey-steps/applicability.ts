import type { CaseRow } from '../types'
import {
  destinationKeysWhere,
  getDestinationOverride,
  getTripType,
  parseDestinations,
  resolveActiveDestination,
  DESTINATION_OVERRIDES,
} from '../destination-config'
import { addDays, addYears, readRabiesEntries, readTiterEntries, resolveValidUntil, todayKst } from '../procedure-checks/utils'
import { resolveStepForDestination } from './destination-overrides'
import { titerEntryValidUntil } from './titer-validity'
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

/**
 * 광견병 1회 접종(+ 필요 시 유효기간 유지용 부스터) 모델인 목적지 — destination-config 키.
 * 단일 출처: catalog 의 rabies-vaccine-2 excludeDestinations 와 추가 백신(rabies-vaccine-extra)
 * 노출·완료 판정(2개=부스터 vs 일본 3개=3차+)이 모두 이 목록을 본다.
 * 프로파일 파생 — 목적지의 `rabies.doses` 선언(destination-config)이 진실 출처.
 */
export const SINGLE_DOSE_RABIES_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => o.rabies?.doses === 1,
)

/**
 * 광견병 백신 면역 유효기간을 **1년(연 1회 접종)만** 인정하는 목적지 — destination-config 키.
 * 2년·3년 라이선스 백신 선택을 입력 차단(펫무브앱 YearSelect 비활성 + getSaveBlockError 저장 거부).
 * 프로파일 파생 — `rabies.oneYearVaccineOnly` (근거 주석은 각 목적지 선언부에).
 * ⚠️ 다년(3년) 백신을 '부스터'로 인정하는 예외는 이 정책상 다루지 않음(운영자 결정, 2026-07-17).
 */
export const RABIES_ONE_YEAR_VALIDITY_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !!o.rabies?.oneYearVaccineOnly,
)

/**
 * 종합백신 면역 유효기간을 **1년만** 인정하는 목적지 — 위 광견병판의 종합백신 버전.
 * 프로파일 파생 — `generalVaccineOneYearOnly` (근거 주석은 각 목적지 선언부에).
 * 홍콩: VC-DC2 (f) "not less than 14 days and not more than 1 year before coming into Hong Kong".
 */
export const GENERAL_VACCINE_ONE_YEAR_VALIDITY_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !!o.generalVaccineOneYearOnly,
)

/**
 * 종합백신(DHPP·FVRCP) 카드가 뜨는 목적지 — catalog `general-vaccine` step 과
 * common.general-vaccine-validity-expired(이미 만료 '주의') 룰이 공유하는 단일 출처.
 *
 * NOTE: vaccines('general') 파생 불가 — admin 상세페이지 vaccines 와 이 카드 명단이
 * 의도적으로 다를 수 있어 개별 판단 명단으로 유지.
 * 대만은 APHIA 공식 요건·펫무브 가이드에 종합백신이 없어 제외(2026-07-18 사용자 결정).
 */
export const GENERAL_VACCINE_CARD_DESTINATIONS: string[] = [
  'australia',
  'new_zealand',
  'thailand',
  'malaysia',
  // ⚠️ 인도네시아는 **넣지 않는다**(2026-07-23 사용자 결정). 펫무브 가이드가 종합백신을
  //   '입국 필수 아님 — 격리 대비 권장'으로만 다뤄, 태국·말레이시아(필수)와 갈린다.
  //   되살리려면 근거부터 확보할 것(튀르키예와 같은 처리).
  'singapore',
  'russia',
  'india',
  'uae',
  'hongkong',
  'guam',
  'philippines',
  // 카자흐스탄 — EAEU 제15장이 광견병과 같은 문장에서 종합백신을 규율한다(출국 20일 전·12개월 면제).
  'kazakhstan',
  // ⚠️ 튀르키예는 **넣지 않는다**(2026-07-22 확정). 카자흐스탄 복제로 잠깐 들어갔다가
  // 뺐다 — 펫무브 튀르키예 가이드에 종합백신 항목 자체가 없고, 구세대 조사도 '권고
  // (의무 명문 부재)'였다. 되살리려면 근거부터 확보할 것.
]

/**
 * 광견병 항체 검사가 **입국 요건**인 목적지 — `rabiesTiterForReturnOnly` 가 아닌 곳.
 *
 * 태국·필리핀 등은 입국에 항체 검사가 필요 없고 카드가 뜨는 건 **한국 귀국용**이다.
 * 한국 귀국용 검사는 광견병 접종 여부·순서와 무관하게 **결과만 있으면 되므로**
 * '접종 후 채혈' 순서 검증을 붙이면 안 된다(2026-07-18 사용자 확인).
 *
 * 입국 요건인 곳(일본·중국·대만·EU 패밀리)만 순서를 입력 차단한다.
 */
export const TITER_REQUIRED_FOR_ENTRY_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => !o.rabiesTiterForReturnOnly,
)

/**
 * 광견병 2회 프라임 모델 목적지(일본·중국) — `rabies.doses` 파생.
 * 추가 백신 카드(rabies-vaccine-extra, 3차+ 전용)가 이 목록을 본다.
 */
export const TWO_DOSE_RABIES_DESTINATIONS: string[] = destinationKeysWhere(
  (o) => o.rabies?.doses === 2,
)

/**
 * 항공권 날짜를 수입검역의 '예정 [날짜]' 배지로 띄워도 되는 목적지 — destination-config 키.
 * entry_date 는 한국 '출발일'(=departure_date 동기화)이라, 출발=도착이 같은 날인 단거리 노선에서만
 * 실제 도착·공항검역일과 일치한다. 시차로 익일 도착하는 장거리(EU 등)는 어긋나므로 제외.
 * 명단 밖 목적지는 항공권 예정 배지를 안 띄우고, 고객이 실제 검역일을 입력해야 표시·완료된다.
 * (배지는 항공권 날짜가 '미래'일 때만 — 지나면 내려가고 평범한 상태로. 다른 백신·검사 카드와 동일.)
 *
 *  - 도착(수입검역, entry_date 기반): 일본·필리핀 (당일 도착 확실).
 *  - 귀국(한국 수입검역, return_date 기반): 일본·필리핀·태국 (귀국 노선은 조금 더 관대).
 *
 * 새 목적지는 노선 특성(출발=도착 동일일 여부)을 개별 판단해 추가한다.
 */
// 하와이 — 한국→호놀룰루는 날짜변경선을 건너 같은 날(또는 이른 시각) 도착이라 항공권 날짜를
//   도착검역 '예정' 배지로 쓸 수 있다(일본과 동일). 귀국(HNL→ICN)은 +1일이라 RETURN 배열엔 제외.
// 싱가포르 — 주간 ICN→SIN 은 당일 도착(사용자 확정 2026-07-25). 심야 출발편은 익일 새벽
//   도착이라 하루 어긋날 수 있으나 배지는 '예정' 안내용(날짜가 지나면 내려감)이라 허용.
//   귀국(SIN→ICN)은 심야 출발 익일 도착이 잦아 RETURN 배열엔 넣지 않는다.
export const FLIGHT_DATE_IMPORT_QUARANTINE_DESTINATIONS: string[] = [
  'japan',
  'philippines',
  'hawaii',
  'singapore',
]
export const FLIGHT_DATE_RETURN_QUARANTINE_DESTINATIONS: string[] = [
  'japan',
  'philippines',
  'thailand',
]

/** 케이스가 광견병 1회 접종 모델 목적지인지. */
export function isSingleDoseRabiesCase(caseRow: CaseRow): boolean {
  const key = buildCaseJourneyContext(caseRow).destinationKey
  return !!key && SINGLE_DOSE_RABIES_DESTINATIONS.includes(key)
}

/** destination 토큰(예: '일본', 'france')을 DESTINATION_OVERRIDES 키('japan', 'eu')로 정규화. */
export function findDestinationKey(destinationToken: string): string | null {
  const override = getDestinationOverride(destinationToken)
  if (!override) return null
  for (const [key, value] of Object.entries(DESTINATION_OVERRIDES)) {
    if (value === override) return key
  }
  return null
}

/** 한 step 의 적용 조건이 케이스 컨텍스트에 맞는지. */
export function isStepApplicable(applicability: StepApplicability, ctx: CaseJourneyContext): boolean {
  const dk = ctx.destinationKey
  // 제외 목적지 — destinations 매칭과 무관하게 우선 제외 (예: 1회면 충분한 나라의 광견병 2차).
  if (dk && applicability.excludeDestinations?.includes(dk)) return false
  // 목적지 매칭 — 본 목적지(destinations) 또는 왕복전용 목적지(roundOnlyDestinations) 둘 중 하나.
  const inMain = applicability.destinations === 'all' || (!!dk && applicability.destinations.includes(dk))
  const inRoundOnly = !!dk && (applicability.roundOnlyDestinations?.includes(dk) ?? false)
  if (!inMain && !inRoundOnly) return false
  // 왕복전용 목적지는 왕복 케이스에만 적용(엔트리 요건 없이 귀국 요건만 있는 경우).
  if (!inMain && inRoundOnly && ctx.tripType !== 'round') return false
  // 종 — 'all' 또는 매칭. species 미상은 모든 종 통과(보수적으로 보여줌).
  // 목적지별 덮어쓰기가 있으면 그 값이 우선(호주 종합백신·전염병 검사 = 강아지 전용).
  const speciesFilter = (dk && applicability.speciesByDestination?.[dk]) ?? applicability.species
  if (speciesFilter !== 'all' && ctx.species && speciesFilter !== ctx.species) {
    return false
  }
  // 왕복/편도 — 본 목적지에만 적용(왕복전용은 위에서 처리). 'all' 또는 매칭.
  if (inMain && applicability.tripType !== 'all' && applicability.tripType !== ctx.tripType) {
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
      // (1) 이미 추가 접종 입력 — 기존 has-extra-rabies 와 동일 의미. 입력된 기록을 계속
      //     표시할 수 있어야 하므로 OR 의 한 쪽. 추가 접종 = 일본(2회 프라임)은 3차+,
      //     1회 접종국(태국·필리핀·EU — SINGLE_DOSE_RABIES_DESTINATIONS)은 2차+.
      // (2) 직전 광견병 접종의 면역 유효기간 만료 30일 전 — 오늘 기준 사전 안내.
      //     입국일과 무관하게 '곧 만료되니 재접종 준비' 를 알린다.
      // (3) 면역 유효기간이 입국일 전에 만료 — 입국 전 재접종 필수.
      //     입국일은 보호자가 입력한 entry_date 만 본다 — departure_date 폴백 안 씀.
      //     항공권 step 미완료 등으로 보호자가 입력하지 않은 departure_date 잔여값이
      //     남아 있어도 그걸로 step 을 띄우지 않는다. entry_date 미입력이면 (2) 만 적용.
      const singleDose = isSingleDoseRabiesCase(caseRow)
      const primeCount = singleDose ? 1 : 2
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length >= primeCount + 1) return true
      // (2)(3) 은 프라임 시리즈(일본 1·2차 / 1회 접종국 1차)가 끝난 뒤에만 의미 — 일본에서
      // 1차만 입력된 상태면 다음 단계는 2차 백신이지 추가 백신이 아니다 (1차 유효기간
      // 만료/임박 안내는 2차 백신 step 담당).
      if (rabies.length < primeCount) return false

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return false

      // (2) 만료됐거나(이미 과거) 만료 30일 전 (오늘 기준).
      //   todayKst() 는 보호자가 앱을 보는 시점일 뿐 — 유효기간이 이미 지났어도 카드를
      //   숨기지 않는다. (a) 유효기간 내에 받은 추가 접종을 늦게 입력하는 보호자가 입력할
      //   곳을 잃지 않도록, (b) 이미 만료된 케이스는 재접종(재시작) 안내를 받아야 하므로.
      //   만료 후 날짜로의 부스터 입력 자체는 chain 검증(findRabiesChainBreak, client+server)
      //   이 거부하므로 카드를 미리 숨길 이유가 없다. (titer-extra-applicable 과 동일 동작.)
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

      // 가장 최근(=date 기준 최신) 항체 검사의 유효기간 — 목적지별(일본 24개월·대만 12개월).
      // 예전엔 2년을 하드코딩해 대만에서 만료를 1년 늦게 잡았다(카드가 안 뜸).
      const latest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const validUntil = titerEntryValidUntil(caseRow.destination ?? '', latest.date)
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
    .map((s) => resolveStepForDestination(s, ctx.destinationKey, ctx.destinationToken))
    .map((s) => resolveStepForSpecies(s, ctx.species))
    .sort((a, b) => a.order - b.order)
}

/**
 * 종(개/고양이)별 본문 교체 — descriptionBySpecies 가 있고 케이스의 종이 확정돼 있으면
 * description 을 그 종의 텍스트로 바꾼다. 종 미상이면 description(통합문) 그대로 — 모든
 * 소비자(scenario 보조줄·상세 페이지·docs)가 description 만 읽으므로 여기 한 곳에서 처리.
 *
 * getStepsForCase 는 자동 적용하지만, step 상세 페이지처럼 catalog 에서 직접 step 을 꺼내
 * resolveStepForDestination 만 거치는 경로는 이 함수도 명시 호출해야 한다(export 이유).
 */
export function resolveStepForSpecies(
  step: StepDefinition,
  species: 'dog' | 'cat' | null,
): StepDefinition {
  if (!step.descriptionBySpecies || !species) return step
  const text = step.descriptionBySpecies[species]
  if (!text) return step
  return { ...step, description: text }
}
