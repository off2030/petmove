import type { CaseRow } from '../types'
import {
  DESTINATION_OVERRIDES,
  destinationKeysWhere,
  destinationKoLabel,
  getVetVisitWindowDays,
  matchesDestinationKey,
  parseDestinations,
} from '../destination-config'
import { getDepartureDate, getVetVisitDate, readByDestValue } from '../destination-scoped-fields'
import { addDays, addMonths, addYears, resolveValidUntil, todayKst } from '../procedure-checks/utils'
import { msgTiterBeforeVaccine } from '../procedure-checks/messages'
import type { StepDefinition } from './types'

/**
 * 검역·검사 날짜의 순방향 검증 — 단일 출처.
 *
 * WHY: 각 날짜는 자기 기준(항공편·앞 단계)에 대해 "유효한가"라는 규칙을 갖는다. 이 규칙을
 * 저장 액션 안에만 박아두면 (1) 저장 시 정방향 차단으로만 쓰이고, (2) 나중에 앞 단계를
 * 수정해 이 날짜가 어긋나는 경로는 못 잡는다. 그래서 규칙을 순수 함수로 한 곳에 모아:
 *   - 저장 시 → 후보값 검증(정방향 차단, 기존과 동일)
 *   - 앞 단계 수정 후 → 이미 입력된 이후 날짜를 같은 함수로 재검증(정합성 '주의')
 * 양쪽이 같은 정의를 쓴다 — 쌍마다 규칙을 적는(N² 폭증) 대신 날짜마다 검증 하나만 둔다.
 *
 * 각 validate 는 위반 시 사람이 읽는 메시지, 정상이면 null 을 반환. anchor(비교 대상)가
 * 입력돼 있지 않으면 비교 불가라 해당 검증만 SKIP(null).
 */

export interface DateRuleContext {
  /** case.data — 검역·항공편 날짜의 출처. */
  data: Record<string, unknown>
  /** 케이스 목적지 — 내원·수출검역 윈도우 일수 산정용. */
  destination: string | null
  /** departure_date 컬럼 — 내원일 윈도우의 기준 출국일(entry_date 와 동기화되나 컬럼이 진실). */
  departureDate: string | null
}

function fmt(iso: string): string {
  const parts = iso.slice(0, 10).split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** case.data.species — 'dog' | 'cat' | undefined. 종별 내원 윈도우(촌충 구충) 산정용. */
function readSpecies(data: Record<string, unknown>): string | undefined {
  return typeof data.species === 'string' ? data.species : undefined
}

/** data[key] 를 'YYYY-MM-DD' 로 읽음 — 없거나 형식이 아니면 ''. */
function readDate(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  if (typeof v !== 'string' || v.length < 10) return ''
  const s = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000,
  )
}

/** 출국일 앵커 — data.entry_date 우선, 없으면 departure_flight_date. */
function departFromData(data: Record<string, unknown>): string {
  return readDate(data, 'entry_date') || readDate(data, 'departure_flight_date')
}

// ── 날짜별 순방향 검증 — 위반 시 메시지, 정상이면 null ──────────────────

/**
 * 미국 저위험국 경로의 개는 미국 도착일에 생후 6개월 이상이어야 한다.
 * 고양이는 CDC 개 수입 규칙의 적용 대상이 아니므로 검사하지 않는다.
 *
 * ⚠️ 규정은 '도착일' 기준이지만 **판정은 출국일로 한다**(2026-07-26 사용자 결정) — 항공권
 *   카드에서 도착일 입력칸을 없애 다른 목적지와 같은 단순형(출발일·귀국일)이 됐기 때문이다.
 *   한국→미국은 날짜변경선을 동쪽으로 넘어 출발일 = 도착일(같은 날)이 대부분이고, 경유로
 *   도착이 하루 밀리는 경우엔 출국일 기준이 더 엄격해 안전한 쪽으로 틀린다.
 *   호출부(validateEntryDateForDestination)가 출발일을 우선해 넘긴다.
 *
 * https://www.cdc.gov/importation/dogs/rabies-free-low-risk-countries.html
 */
export function validateUsDogEntryDate(v: string, ctx: DateRuleContext): string | null {
  // CDC 규칙이라 **미국령 전체**에 걸린다 — 괌도 같은 연방 규정을 받는다(DOAG 브로슈어
  //   INTERNATIONAL ARRIVALS: "Dogs must be at least 6 months of age", 2024-08-01 시행).
  //   ⚠️ 하와이는 아직 이 목록에 없다 — 미국의 주라 같은 규칙인데 저장 거부가 안 걸려 있다
  //   (기존 상태 유지, 별도 판단 필요).
  const key = matchesDestinationKey(ctx.destination, 'usa')
    ? '미국'
    : matchesDestinationKey(ctx.destination, 'guam')
      ? '괌'
      : ''
  if (!v || !key) return null
  if (readSpecies(ctx.data) !== 'dog') return null
  const birth = readDate(ctx.data, 'birth_date')
  if (!birth) return null
  const earliest = addMonths(birth, 6)
  if (earliest && v < earliest) {
    return `개는 생후 6개월이 되는 ${fmt(earliest)}부터 ${key}에 입국할 수 있어요.`
  }
  return null
}

/**
 * 일본 입국일(= 출국 항공편 날짜) — 광견병 항체 검사일 + 180일 미만 입국만 hard 차단.
 *
 * 회복 경로가 **없는** 위반만 저장 거부 = "검역 통과를 위해 출국일 자체를 바꾸는 것 외에
 * 길이 없는" 입력. 180일 대기는 절대값이고, 재검사해도 새 검사일 + 180일을 다시 기다려야 함.
 *
 * 회복 가능한 인접 위반들은 hard 차단 X — procedure-check '주의' 배지가 안내:
 *  - 검사 유효기간(2년) 만료 → 재검사로 회복 (jp.entry-within-2years-of-titer)
 *  - 백신 면역 유효기간 만료 → 재접종으로 회복 (jp.rabies-valid-until-on-departure)
 *  - 사전 신고 40일·검역 윈도우 등 후행 일정 — 항공편 수정 시 갇힘 방지
 *
 * 일본 외 목적지·항체 검사 미입력 시 SKIP.
 */
export function validateJpEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  // destination 토큰 normalize — '일본'/'japan' 양쪽 모두 매칭. parseDestinations + includes('japan')
  // 만 쓰면 한글 토큰을 놓침.
  if (!matchesDestinationKey(ctx.destination, 'japan')) return null

  const titerDates: string[] = []
  const rawTiters = ctx.data.rabies_titer_records
  if (Array.isArray(rawTiters)) {
    for (const r of rawTiters) {
      if (r && typeof r === 'object') {
        const d = (r as Record<string, unknown>).date
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) titerDates.push(d)
      }
    }
  }
  if (titerDates.length === 0) return null

  // 가장 최근 채혈일이 가장 유리(180일 미래로 밂) — ISO 사전순 max.
  titerDates.sort()
  const latestTiter = titerDates[titerDates.length - 1]
  const earliest = addDays(latestTiter, 180)
  if (earliest && v < earliest) {
    return `검사일로부터 180일 후인 ${fmt(earliest)}에 일본에 입국할 수 있어요.`
  }
  return null
}

/**
 * 대만 — 채혈일이 **직전 합격 검사의 180일~1년 사이**면 180일 대기가 면제된다(체인 유지).
 *
 * APHIA 문답집(2024-02) 免隔離 情形 2:
 *   「輸入前180日至1年內之期間內抽血檢測合格；**或 輸入前180日內抽血檢測合格, 且該次抽血日為
 *     前次檢測合格報告之抽血日起180日至1年內**」
 *
 * 즉 이미 합격 검사가 있고 그로부터 180일~1년 사이에 재검사하면, 새 검사가 입국 180일 이내여도
 * 인정된다. 광견병 부스터 chain 과 같은 구조로, 대만 고유 조항(일본·EU 엔 없음).
 *
 * 이 함수가 true 면 `validateTwEntryDate` 의 180일 대기와
 * `tw.rnatt-180days-to-1year-before-arrival` 주의를 모두 건너뛴다 — 두 층이 같은 기준을 쓰도록
 * 도메인에 단일 출처로 둔다.
 */
export function isTwTiterChainMaintained(titerDates: string[]): boolean {
  const sorted = titerDates.filter((d) => d && d.length >= 10).sort()
  if (sorted.length < 2) return false
  const latest = sorted[sorted.length - 1]
  // 직전 합격 검사 하나라도 '최신 채혈일 - 180일 ~ -1년' 구간에 있으면 체인 유지.
  return sorted.slice(0, -1).some((prev) => {
    const gap = daysBetween(prev, latest)
    if (gap === null) return false
    const upper = addYears(prev, 1)
    return gap >= 180 && upper >= latest
  })
}

/**
 * 대만 — RNATT 채혈일 + **90일** 경과 후 도착. 90일 미만만 차단한다.
 *
 * ⚠️ 예전엔 180일 미만을 차단했다(2026-07-19 수정). 180일은 **격리 면제** 조건이지 입국
 * 조건이 아니다. APHIA 문답집 원문:
 *   「抽血檢測時間距離輸入較近(已滿 90 日但未滿 180 日)，輸入後仍然是需要隔離檢疫 7 日的」
 * 즉 90~180일은 **입국 가능 + 도착 후 7일 격리**다. 그걸 막고 있었으니 규정상 갈 수 있는
 * 사람의 항공권 저장을 거부한 오차단이었다. 90~180일 구간은 procedure-check
 * (tw.rnatt-180days-to-1year-before-arrival)가 '격리된다'는 주의로 안내한다.
 *
 * 90일 미만만 차단하는 이유는 일본 180일과 같다 — 채혈일은 과거 사실이라 위반 해소 경로가
 * "입국일을 미루는 것"뿐이다. 1년 초과(검사 만료)는 재검사로 회복 가능하므로 차단하지 않는다.
 *
 * 단 **체인 유지 시(isTwTiterChainMaintained) 대기 없음** — 규정상 갈 수 있는 사람을 막지 않는다.
 */
export function validateTwEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'taiwan')) return null

  const titerDates: string[] = []
  const rawTiters = ctx.data.rabies_titer_records
  if (Array.isArray(rawTiters)) {
    for (const r of rawTiters) {
      if (r && typeof r === 'object') {
        const d = (r as Record<string, unknown>).date
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) titerDates.push(d)
      }
    }
  }
  if (titerDates.length === 0) return null
  // 체인 유지(직전 합격 검사 + 180일~1년 내 재검사) — 180일 대기 면제.
  if (isTwTiterChainMaintained(titerDates)) return null

  titerDates.sort()
  const latestTiter = titerDates[titerDates.length - 1]
  const earliest = addDays(latestTiter, 90)
  if (earliest && v < earliest) {
    return `검사일로부터 90일 후인 ${fmt(earliest)}에 대만에 입국할 수 있어요.`
  }
  return null
}

/**
 * 대만 입국일 — **광견병 접종 후 선적 대기**(1차 90일 / 유효 부스터 30일) 미달 시 저장 거부.
 *
 * 항체 90일 대기(validateTwEntryDate)와 별개 요건이다. 평소엔 항체 대기가 이걸 덮지만,
 * 재검사 체인으로 항체 대기가 면제되는 경로에서는 이 요건만 남는다(tw.rabies-shipment-window
 * 주석과 같은 이유). 그 경로에 저장 거부가 없어 주의만 뜨고 있었다(2026-07-20 사용자 지정으로 추가).
 */
export function validateTwRabiesShipmentDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'taiwan')) return null
  const { violated, isBooster } = violatesTwRabiesShipmentWait(ctx.data, v)
  if (!violated) return null
  return isBooster
    ? '광견병 추가 접종 후 30일이 지나야 대만에 입국할 수 있어요. 날짜를 확인하세요.'
    : '광견병 1차 접종 후 90일이 지나야 대만에 입국할 수 있어요. 날짜를 확인하세요.'
}

/**
 * 백신 배열(key: 'rabies_dates' / 'general_vaccine_dates')의 최근 접종이 '유효 부스터'인지:
 * 직전 접종의 면역 유효기간 안에 재접종한 경우(chain 미단절). 유효 부스터는 21일 대기 면제.
 * (만료 후 재접종 = discontinuity = 새 1차 취급 → 면제 안 됨.)
 *
 * DLD: "primary or discontinuity vaccination must wait 21 days. Valid booster — waiting period
 * not required." BAI 도 동일(annual booster 즉시 출국). 태국·필리핀 광견병·종합백신 공용.
 *
 * 날짜순 정렬해 최근 접종이 직전 접종의 resolveValidUntil 이내면 true. 2회 미만이면 false.
 */
export function isValidBooster(data: Record<string, unknown>, key: string): boolean {
  const raw = data[key]
  if (!Array.isArray(raw)) return false
  const entries = raw
    .map((r) => {
      if (typeof r === 'string') return { date: r, valid_until: null as string | null }
      if (r && typeof r === 'object') {
        const rec = r as Record<string, unknown>
        return {
          date: typeof rec.date === 'string' ? rec.date : '',
          valid_until: typeof rec.valid_until === 'string' ? rec.valid_until : null,
        }
      }
      return { date: '', valid_until: null }
    })
    .filter((e) => e.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (entries.length < 2) return false
  const latest = entries[entries.length - 1]
  const prev = entries[entries.length - 2]
  const prevValid = resolveValidUntil(prev.date, prev.valid_until)
  return !!prevValid && latest.date <= prevValid
}

/**
 * 태국 입국일(= 출국 항공편 날짜) — 광견병·종합백신의 최근 접종일 + 21일 미만 입국만 hard 차단.
 *
 * 일본 180일 룰(validateJpEntryDate)과 같은 기준: 접종일은 과거 사실이라 21일 대기를 줄일
 * 방법이 없고, 위반 해소 경로가 "입국일 자체를 늦추는 것"뿐인 입력만 저장 거부.
 * 면역 유효기간 만료(재접종으로 회복 가능)는 차단 X — procedure-check '주의'가 안내.
 *
 * **광견병 유효 부스터(isThRabiesValidBooster)는 21일 면제** — DLD 원문(valid booster,
 * waiting period not required). 1차·단절 접종만 21일 적용. 종합백신은 부스터 면제 명시가
 * 없어 보수적으로 21일 유지.
 *
 * 태국 외 목적지·백신 미입력 시 SKIP.
 */
export function validateThEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'thailand')) return null

  const latestOf = (key: string): string => {
    const raw = ctx.data[key]
    if (!Array.isArray(raw)) return ''
    let max = ''
    for (const r of raw) {
      const d =
        typeof r === 'string'
          ? r
          : r && typeof r === 'object'
            ? (r as Record<string, unknown>).date
            : null
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10)) && d > max) {
        max = d.slice(0, 10)
      }
    }
    return max
  }

  const targets: Array<[string, string]> = [
    ['rabies_dates', '광견병 백신'],
    ['general_vaccine_dates', '종합백신'],
  ]
  for (const [key, label] of targets) {
    // 광견병 유효 부스터는 21일 대기 면제 — chain 유지된 재접종은 바로 입국 가능.
    if (key === 'rabies_dates' && isValidBooster(ctx.data, 'rabies_dates')) continue
    const latest = latestOf(key)
    if (!latest) continue
    const earliest = addDays(latest, 21)
    if (earliest && v < earliest) {
      return `${label} 접종 후 21일이 지나야 태국에 입국할 수 있어요.`
    }
  }
  return null
}

/**
 * 광견병 접종 후 입국까지의 대기일 — **프로파일 파생 단일 출처**.
 *
 * 값은 destination-config 의 `rabies.entryWaitDaysAfterVaccine`. 예전엔 베트남 30일이
 * 여기 상수(VN_RABIES_WAIT_DAYS)로 박혀 있었고 판정 함수도 베트남 전용이었다 — 같은 모델의
 * 나라(몽골·우즈베키스탄·캄보디아)를 올리려면 함수를 나라 수만큼 복제해야 했다.
 * 프로파일에 숫자 하나만 선언하면 저장 거부·주의 룰·카드 문구가 함께 움직인다(2026-07-20).
 */
export const RABIES_ENTRY_WAIT_DAYS: Record<string, number> = Object.fromEntries(
  destinationKeysWhere((o) => !!o.rabies?.entryWaitDaysAfterVaccine).map((k) => [
    k,
    DESTINATION_OVERRIDES[k]!.rabies!.entryWaitDaysAfterVaccine!,
  ]),
)

/** 목적지의 접종 후 입국 대기일. 선언 없으면 0(대기 요건 없음 — 캐나다). */
export function rabiesEntryWaitDays(destination: string | null | undefined): number {
  for (const [key, days] of Object.entries(RABIES_ENTRY_WAIT_DAYS)) {
    if (matchesDestinationKey(destination, key)) return days
  }
  return 0
}

/**
 * 광견병 접종 후 대기의 **단일 판정**. 저장 거부와 주의가 이 함수를 공유한다.
 *
 * 기준은 **최근 접종**이다. 예전엔 procedure-check 가 가장 이른 접종(1차)을 봐서, 만료 후
 * 재접종한 케이스를 통째로 놓쳤다 — 1차 2025-01-10(2026-01-10 만료) → 재접종 2026-06-01 →
 * 출국 2026-06-10 이면 실제로는 9일인데 1차부터 516일로 세어 '통과'가 나왔다(2026-07-20 발견).
 * 저장 거부를 붙이면서 이 기준을 태국·필리핀과 같은 모델로 맞춘다.
 *
 * **유효 부스터는 대기 면제** — 직전 접종의 면역 유효기간 안에 재접종해 면역이 끊기지 않았으면
 * 새로 기다릴 이유가 없다(태국 DLD·필리핀 BAI 와 같은 논리, isValidBooster 공용). 만료 후
 * 재접종은 단절이라 새 1차로 보고 다시 센다.
 *
 * 반환: 대기가 부족하면 true(위반). 날짜가 없거나 대기 요건이 없으면 false(판정 안 함).
 * 출처(베트남): 미 대사관 안내 — "at least 30 days ... before the intended date of entry".
 */
export function violatesRabiesEntryWait(
  data: Record<string, unknown>,
  entryOrDeparture: string,
  destination: string | null | undefined,
): boolean {
  const days = rabiesEntryWaitDays(destination)
  if (days <= 0) return false
  return violatesVaccineWaitDays(data, entryOrDeparture, 'rabies_dates', days)
}

/**
 * 접종 후 대기 판정 **공용** — 최근 접종 기준, 유효 부스터는 면제.
 * 태국 21일·필리핀 21일·베트남 30일이 같은 모델이라 한 함수로 묶는다(대만만 부스터도
 * 대기가 있어 별도 — violatesTwRabiesShipmentWait).
 */
export function violatesVaccineWaitDays(
  data: Record<string, unknown>,
  entryOrDeparture: string,
  key: 'rabies_dates' | 'general_vaccine_dates',
  waitDays: number,
): boolean {
  const target = (entryOrDeparture ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return false
  // 유효 부스터 = 면역 연속 → 대기 면제.
  if (isValidBooster(data, key)) return false
  const dates = readDateArray(data, key)
  if (dates.length === 0) return false
  const latest = dates.reduce((a, b) => (a > b ? a : b))
  const earliest = addDays(latest, waitDays)
  return !!earliest && target < earliest
}

/**
 * 종합백신 접종 후 출국까지 대기일 — **프로파일 파생 단일 출처**(generalVaccineWaitDays).
 * 광견병 RABIES_ENTRY_WAIT_DAYS 의 종합백신판. 저장 거부·주의가 같은 값을 공유한다.
 * 종합백신은 광견병과 달리 유효 부스터 면제가 없다(기존 주의 룰과 동일 — 최근 접종 기준).
 */
export const GENERAL_VACCINE_WAIT_DAYS: Record<string, number> = Object.fromEntries(
  destinationKeysWhere((o) => !!o.generalVaccineWaitDays).map((k) => [
    k,
    DESTINATION_OVERRIDES[k]!.generalVaccineWaitDays!,
  ]),
)

export function generalVaccineEntryWaitDays(destination: string | null | undefined): number {
  for (const [key, days] of Object.entries(GENERAL_VACCINE_WAIT_DAYS)) {
    if (matchesDestinationKey(destination, key)) return days
  }
  return 0
}

/**
 * 종합백신 접종 후 대기 저장 거부·주의 **단일 판정**. 최근 접종 + N일 미만 입국이면 위반.
 * client(입력 불가)·procedure-check(해당국 general-vaccine 주의) 공용. 미선언국·기록 없으면 통과.
 */
export function validateGeneralVaccineEntryWait(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  // 홍콩은 상한(1년)까지 있어 전용 판정으로 빠진다(violatesHkGeneralVaccineDoseWindow 주석).
  if (matchesDestinationKey(ctx.destination, 'hongkong')) {
    return violatesHkGeneralVaccineDoseWindow(ctx.data, v)
      ? '종합백신 접종 후 14일이 지나야 홍콩에 입국할 수 있어요. 날짜를 확인하세요.'
      : null
  }
  const days = generalVaccineEntryWaitDays(ctx.destination)
  if (days <= 0) return null
  const target = v.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null
  // 켄넬코프도 **같은 대기 요건**을 받는 목적지가 있다(괌 — 둘 다 출국 10일 전).
  //   백신마다 따로 보지 않으면 켄넬코프만 차단이 새서, 배열별로 각각 판정한다.
  for (const [key, label] of [
    ['general_vaccine_dates', '종합백신'],
    ['kennel_cough_dates', '켄넬코프'],
  ] as const) {
    const dates = readDateArray(ctx.data, key)
    if (dates.length === 0) continue
    const latest = dates.reduce((a, b) => (a > b ? a : b))
    const earliest = addDays(latest, days)
    if (earliest && target < earliest) {
      return `${label} 접종 후 ${days}일이 지나야 입국할 수 있어요. 날짜를 확인하세요.`
    }
  }
  return null
}


/**
 * 대만 선적 대기 — 1차·단절 90일 / **유효 부스터 30일**.
 *
 * 태국·필리핀·베트남과 달리 부스터가 '면제'가 아니라 '30일로 단축'이다.
 * APHIA: 「首次疫苗注射…間隔須滿 90 日；追加注射…間隔須滿 30 日」.
 * tw.rabies-shipment-window(주의)와 이 함수를 공유한다.
 */
export function violatesTwRabiesShipmentWait(
  data: Record<string, unknown>,
  entryOrDeparture: string,
): { violated: boolean; isBooster: boolean } {
  const target = (entryOrDeparture ?? '').slice(0, 10)
  const isBooster = isValidBooster(data, 'rabies_dates')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return { violated: false, isBooster }
  const dates = readDateArray(data, 'rabies_dates')
  if (dates.length === 0) return { violated: false, isBooster }
  const latest = dates.reduce((a, b) => (a > b ? a : b))
  const earliest = addDays(latest, isBooster ? 30 : 90)
  return { violated: !!earliest && target < earliest, isBooster }
}

/**
 * 입국일(= 출국 항공편 날짜) — 광견병 접종 후 대기일 미만 입국만 hard 차단.
 *
 * 일본 180일·태국 21일과 같은 기준(사용자 지정 2026-07-20): **출국일을 입력하는 시점**은
 * 날짜를 고칠 수 있는 시점이라 저장을 거부한다. 반대로 출국일이 이미 있는데 접종일을 넣는
 * 경로는 막지 않는다 — 고칠 수 있는 건 출국일뿐이라 procedure-check
 * (`<cc>.rabies-min-Ndays-before-departure`)가 '입국일을 미뤄야 해요'로 안내한다.
 * 그래서 이 함수는 항공권 카드 경로(validateEntryDateForDestination)에만 걸린다.
 *
 * 대상은 `rabies.entryWaitDaysAfterVaccine` 를 선언한 목적지 전부(베트남·몽골·우즈베키스탄·
 * 캄보디아 30일). 대기 0인 나라(캐나다)·접종 미입력 시 SKIP.
 */
export function validateRabiesEntryWait(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  // 홍콩은 판정 모양이 달라 전용 함수로 빠진다(violatesHkRabiesDoseWindow 주석 참고).
  if (matchesDestinationKey(ctx.destination, 'hongkong')) {
    return violatesHkRabiesDoseWindow(ctx.data, v)
      ? '광견병 접종 후 30일이 지나야 홍콩에 입국할 수 있어요. 날짜를 확인하세요.'
      : null
  }
  const days = rabiesEntryWaitDays(ctx.destination)
  if (days <= 0) return null
  if (violatesRabiesEntryWait(ctx.data, v, ctx.destination)) {
    const ko = destinationKoLabel(resolveWaitDestinationKey(ctx.destination))
    return `광견병 접종 후 ${days}일이 지나야 ${ko}에 입국할 수 있어요. 날짜를 확인하세요.`
  }
  return null
}

/**
 * 홍콩 — 증명서에 **적을 수 있는** 광견병 접종일이 하나도 없으면 위반.
 *
 * 다른 나라와 판정 모양이 다르다. AFCD VC-DC2 (c)항은 접종일을 **한 칸**에 적고 그 날짜가
 * "출국 30일 초과 ~ 1년 미만"임을 수의사가 서명하는 구조다(DC-02v05 11(c) "not less than
 * 30 days and not more than 1 year prior to export"). 그래서 '최근 접종 기준 + 유효 부스터
 * 면제'(violatesRabiesEntryWait)로는 홍콩을 판정할 수 없다 — 유효기간 끝자락에 부스터를
 * 맞으면 부스터는 30일 미달, 직전 접종은 1년 초과가 되어 **적을 수 있는 날짜가 하나도
 * 없는데** 부스터 면제로 통과해 버린다(1차 2026-01-01 → 부스터 2026-12-31 → 출국
 * 2027-01-25, 2026-07-26 발견·사용자 지정으로 예외 처리).
 *
 * 그래서 홍콩만 "조건을 만족하는 dose 가 존재하는가"로 본다. 흔한 경로(연 1회 부스터 뒤
 * 한참 있다 출국)는 직전 접종이나 부스터 중 하나가 조건을 만족해 그대로 통과하므로 기존
 * 동작과 달라지지 않는다.
 *
 * 1년은 valid_until(사용자가 고른 면역 유효기간)이 아니라 **접종일 + 12개월**로 센다 —
 * 규정의 1년은 면역 유효기간이 아니라 접종일 기준 절대 상한이기 때문이다(홍콩은
 * oneYearVaccineOnly 라 실무상 같은 값이지만 근거가 다르다).
 * 30일은 프로파일(rabies.entryWaitDaysAfterVaccine)에서 파생해 단일 출처를 유지한다.
 *
 * **모든 접종의 1년 창이 이미 지났으면 판정하지 않는다**(false). 그 상태는 날짜를 어떻게
 * 옮겨도 해결되지 않고 재접종만이 답이라, 저장을 막으면 항공권 날짜조차 못 넣는다.
 * 이미 만료 주의(common.rabies-validity-expired)가 재접종을 안내하고 있다 —
 * 조치 불가능한 차단·중복 주의를 만들지 않는다는 기존 원칙과 같다.
 */
export function violatesHkRabiesDoseWindow(
  data: Record<string, unknown>,
  entryOrDeparture: string,
): boolean {
  return violatesHkDoseWindow(
    data,
    entryOrDeparture,
    'rabies_dates',
    rabiesEntryWaitDays('hongkong'),
  )
}

/**
 * 홍콩 종합백신 — 광견병과 **같은 구조**의 요건이라 같은 판정을 쓴다.
 * VC-DC2 (f): "vaccinated against the following canine/feline diseases on ___ (date) that is
 * not less than 14 days and not more than 1 year before coming into Hong Kong."
 * 광견병(30일~1년)과 하한만 다르다(14일~1년).
 *
 * 공용 validateGeneralVaccineEntryWait 는 하한(14일)만 보고 상한을 안 봐서, 사용자가 3년
 * 종합백신을 골라 저장하면 접종 2년 뒤 출국도 통과했다(2026-07-26 사용자 지적).
 */
export function violatesHkGeneralVaccineDoseWindow(
  data: Record<string, unknown>,
  entryOrDeparture: string,
): boolean {
  return violatesHkDoseWindow(
    data,
    entryOrDeparture,
    'general_vaccine_dates',
    generalVaccineEntryWaitDays('hongkong'),
  )
}

/**
 * 홍콩 '적을 수 있는 접종일' 판정 본체 — 광견병·종합백신 공용(위 두 wrapper 주석 참고).
 *
 * **하한(N일 대기) 위반만 보고한다.** 상한(1년 초과)은 다른 목적지와 마찬가지로 유효기간
 * 룰(hk.rabies-valid-on-departure / hk.general-vaccine-valid-on-departure + common.*-expired)이
 * 담당한다 — 홍콩은 1년만 인정(oneYearVaccineOnly·generalVaccineOneYearOnly)이라 그 룰의
 * 유효기간이 곧 규정의 1년 상한이다. 두 조건을 한 문장에 합치면 "30일이 지나고 1년이 되기
 * 전에"처럼 상황과 안 맞는 안내가 나가고, 상한 쪽은 주의가 중복된다(2026-07-26 사용자 지적).
 *
 * 공용 판정(violatesVaccineWaitDays)과 다른 점은 **최근 접종 하나가 아니라 전체를 본다**는 것.
 * 증명서(VC-DC2)는 접종일을 한 칸에 적으므로, 조건을 만족하는 dose 가 하나라도 있으면 통과다.
 * 그래서 "부스터는 30일 미달이지만 직전 접종이 1년 이내"면 통과하고(직전 접종을 적으면 된다),
 * "부스터는 30일 미달 + 직전 접종은 1년 초과"면 적을 날짜가 없어 위반이 된다.
 *
 * 어느 접종도 조건을 못 채우는데 **기다려서 해결되지도 않는**(전부 1년 초과) 상태는 false —
 * 재접종만이 답이라 위 유효기간 룰이 안내한다.
 */
function violatesHkDoseWindow(
  data: Record<string, unknown>,
  entryOrDeparture: string,
  key: 'rabies_dates' | 'general_vaccine_dates',
  waitDays: number,
): boolean {
  const target = (entryOrDeparture ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return false
  const dates = readDateArray(data, key)
  if (dates.length === 0) return false
  const windows = dates
    .map((d) => ({ from: addDays(d, waitDays), until: addMonths(d, 12) }))
    .filter((w) => !!w.from && !!w.until)
  if (windows.some((w) => target >= w.from && target <= w.until)) return false
  // 적을 수 있는 접종이 없다 — 그중 '기다리면 쓸 수 있게 되는' 접종이 있을 때만 하한 위반.
  return windows.some((w) => target < w.from)
}

/** 대기 선언국 중 이 케이스가 매칭되는 키 — 메시지의 나라 이름 출처. */
function resolveWaitDestinationKey(destination: string | null | undefined): string {
  for (const key of Object.keys(RABIES_ENTRY_WAIT_DAYS)) {
    if (matchesDestinationKey(destination, key)) return key
  }
  return ''
}

/**
 * 수입 허가 신청일은 출국일 이전이어야 함 — 출국 당일·그 이후 신청은 불가능(논리적 불가능).
 * (당일도 차단: 출국 당일 신청은 허가 발급 자체가 불가능.)
 * client(입력 불가)·procedure-check(출국일을 나중에 당겨 어긋난 경우를 주의로) 공용. 한쪽 비면 통과.
 * (9일·14일 마감과 달리 '신청 자체가 불가능한' 입력이라 차단 대상.)
 */
export function validateImportPermitNotAfterDeparture(
  filedDate: string,
  departureDate: string,
): string | null {
  if (!filedDate || !departureDate) return null
  if (filedDate.slice(0, 10) >= departureDate.slice(0, 10)) {
    return '수입 허가 신청일은 출국일보다 빨라야 해요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 필리핀 입국일(= 출국 항공편 날짜) — 생후 120일(4개월) 미만 입국만 hard 차단.
 *
 * 일본 180일·태국 21일과 같은 기준: 출생일은 바꿀 수 없는 사실이라 위반 해소 경로가
 * "입국일을 늦추는 것"뿐인 입력만 저장 거부. 백신 21일 대기(부스터로 회복 가능)는 차단 X —
 * procedure-check '주의'(ph.rabies-prime-21days-before-arrival)가 안내.
 *
 * 필리핀 외 목적지·출생일 미입력 시 SKIP. (출처: BAI MC 49 — 120 days and above.)
 */
export function validatePhEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'philippines')) return null
  const birth = readDate(ctx.data, 'birth_date')
  if (!birth) return null
  const earliest = addDays(birth, 120)
  if (earliest && v < earliest) {
    return '생후 120일(4개월)이 지나야 필리핀에 입국할 수 있어요.'
  }
  // 접종 후 21일 대기(광견병·종합백신) — 태국과 같은 모델(최근 접종 기준, 유효 부스터 면제).
  // 태국엔 있고 필리핀엔 저장 거부가 빠져 있어 주의만 뜨고 있었다(2026-07-20 사용자 지정으로 추가).
  if (violatesVaccineWaitDays(ctx.data, v, 'rabies_dates', 21)) {
    return '광견병 접종 후 21일이 지나야 필리핀에 입국할 수 있어요. 날짜를 확인하세요.'
  }
  if (violatesVaccineWaitDays(ctx.data, v, 'general_vaccine_dates', 21)) {
    return '종합백신 접종 후 21일이 지나야 필리핀에 입국할 수 있어요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 홍콩 입국일(= 출국 항공편 날짜) — 생후 **5개월 미만** 입국만 hard 차단.
 *
 * AFCD DC-02v05 5항: "Dogs and cats less than 5 months old or more than 4 weeks pregnant
 * must NOT be imported." 규정이 달력 개월이라 일수로 환산하지 않는다(생월에 따라 150~153일로
 * 흔들려 규정을 지킨 사람을 막는다 — 이스라엘 4개월과 같은 처리).
 *
 * 출생일은 바꿀 수 없는 사실이라 위반 해소가 '입국일을 늦추는 것'뿐 → 저장 거부 대상
 * (필리핀 120일과 같은 모델). 광견병 30일·종합백신 14일 대기는 프로파일 파생 차단
 * (validateRabiesEntryWait / validateGeneralVaccineEntryWait)이 따로 담당한다.
 */
export function validateHkEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'hongkong')) return null
  const birth = readDate(ctx.data, 'birth_date')
  if (!birth) return null
  const earliest = addMonths(birth, 5)
  if (earliest && v < earliest) {
    return '생후 5개월이 지나야 홍콩에 입국할 수 있어요.'
  }
  return null
}

/**
 * 이스라엘 — 출국(=입국 근사)일에 반려동물이 **만 4개월(약 17주) 이상**이어야 함(gov.il 수의국,
 * trafficking 방지). 생년월일은 못 바꾸니 위반 해소가 '날짜를 늦추는 것'뿐이라 저장 거부 대상
 * (필리핀 120일과 같은 모델). client(입력 불가)·procedure-check(il.min-4months-on-departure,
 * 출국일을 나중에 당겨 어긋난 경우 '주의') 공용. 이스라엘 외·생년월일 미입력 시 SKIP.
 */
export function validateIlEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!matchesDestinationKey(ctx.destination, 'israel')) return null
  const birth = readDate(ctx.data, 'birth_date')
  if (!birth) return null
  const earliest = addMonths(birth, 4)
  if (earliest && v < earliest) {
    return '출국일에 반려동물이 만 4개월(약 17주) 이상이어야 해요.'
  }
  return null
}

/**
 * EU 패밀리(EU 24국 묶음 + 영국·아일랜드·몰타·노르웨이·핀란드·스위스·키프로스) —
 * destination-config 키. `archetype: 'eu-family'` 선언 파생(진실 출처는 프로파일).
 * procedure-checks/eu.ts 의 EU_REGIME 과 client(step-detail-view) 분기도 이 목록을 쓴다.
 */
export const EU_ENTRY_FAMILY = destinationKeysWhere((o) => o.archetype === 'eu-family')

/** data[key] 배열에서 유효 날짜(들)를 뽑는다 — [{date}] 객체·문자열 항목 모두 지원. */
function readDateArray(data: Record<string, unknown>, key: string): string[] {
  const raw = data[key]
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const r of raw) {
    const d =
      typeof r === 'string'
        ? r
        : r && typeof r === 'object'
          ? (r as Record<string, unknown>).date
          : null
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10))) out.push(d.slice(0, 10))
  }
  return out
}

/**
 * EU 패밀리 — 항체 검사 채혈일은 **직전(가장 최근) 광견병 접종**으로부터 30일 이후여야 함.
 * (EU Reg 576/2013 Annex IV — "접종 후 30일 이후 채혈".) 부스터 chain(연속 재접종)은 *이미
 * 합격한 항체검사를 재검사 안 해도 되게* 하는 별개 조항일 뿐, 새 채혈의 30일 기산점을 더 이른
 * 접종으로 당기지 않는다 — 즉 직전 접종 이전의 접종은 무관. (eu.titer-min-30days-after-vaccine
 * 과 동일 알고리즘 — client 채혈 입력 차단용 단일 함수.)
 *
 * doses = rabies_dates 형태의 [{date, valid_until}] (입력 순서 무관). 채혈·접종 한쪽 비면 통과.
 */
export function validateEuTiterAfterVaccine(
  doses: Array<{ date: string; valid_until?: string | null }>,
  titerDate: string,
  /**
   * 접종 후 최소 대기(일). EU 는 30일이 기본이고, 목적지별로 다르면(싱가포르 28일 등) 프로파일
   * `titer.minDaysAfterVaccine` 파생값(TITER_MIN_DAYS_AFTER_VACCINE)을 넘긴다. 하드코딩 30일은
   * 싱가포르(28)에 안 맞아 저장 거부가 어긋났다(2026-07-24).
   */
  minDays = 30,
): string | null {
  if (!titerDate) return null
  const prior = doses
    .filter((d) => typeof d.date === 'string' && d.date.length >= 10 && d.date <= titerDate)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (prior.length === 0) return null // 접종-채혈 순서 자체는 validateTiterAfterBooster 담당
  const latest = prior[prior.length - 1] // 채혈 직전(가장 최근) 접종 — 그 이전 접종은 무관
  if (daysBetween(latest.date, titerDate) < minDays) {
    // 문구는 일본식 차단 톤과 통일(2026-07-24 사용자안 1번) — 날짜를 찍지 않고 마무리를
    // '날짜를 확인하세요'로. 일수만 목적지별(싱가포르 28·EU 30 등)로 바뀐다.
    return `광견병 항체 검사는 접종 ${minDays}일 후에 받을 수 있어요. 날짜를 확인하세요.`
  }
  return null
}

/**
 * 싱가포르 — 계류장(AQC) 예약 신청일은 광견병 항체 검사 채혈 이후여야 함.
 * (NParks "Reserve quarantine space when the serology test result is ready" — 검사 후 예약.)
 *
 * client(신청일 입력 시 저장 거부)·procedure-check(sg.quarantine-reservation-after-titer,
 * 채혈일을 나중에 수정해 어긋난 경우 '주의') 공용 단일 출처. 채혈 기록이 없으면 순서 비교가
 * 성립하지 않아 통과(주의 룰의 SKIP 과 대칭).
 */
export function validateSgQuarantineReservationFiled(
  filedDate: string,
  titerDates: string[],
): string | null {
  if (!filedDate) return null
  const valid = titerDates.filter((d) => typeof d === 'string' && d.length >= 10).sort()
  if (valid.length === 0) return null
  if (filedDate < valid[0]) {
    return '계류장 예약은 광견병 항체 검사 채혈 이후에 해야 해요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 싱가포르 — 관세청 GST 납부 허가(Customs In-Payment permit)는 도착 전 + 도착일 기준
 * 14일 이내 창에서 받아야 함. (NParks 수입 절차 "Within 14 days of arrival, obtain a
 * Customs In-Payment (GST) permit" — 수입허가 90일과 같은 before-arrival 창 해석,
 * 2026-07-25 사용자 확정. 당일 도착 노선이라 출발일 앵커 = 도착일 근사.)
 *
 * client(발급일 입력 시 저장 거부)·procedure-check(출국일을 나중에 수정해 어긋난 경우
 * '주의') 공용 단일 출처. 출국일이 없으면 비교 불가라 통과.
 */
/**
 * 호주 계류 시작일 — 항체 검체 접수일 + 180일 이후여야 한다.
 *
 * 계류 시작일은 곧 호주 도착일이라 출국일과 같은 제약을 받는다(DAFF 4.3 — 검체가 검사실에
 * 접수된 날부터 180일). 앱은 '검체 접수일'(선택 입력)을 받고, 비어 있으면 **채혈일을 proxy**
 * 로 쓴다 — 채혈 ≤ 접수라 덜 엄격한 쪽이라 안전하다. 그래서 계산된 특정 날짜를 단정하지 않고
 * 요건만 안내한다 (validateEuEntryDate 의 basisReceivedDate 분기와 같은 문구 정책).
 *
 * 표기는 검사기관마다 다르다 — APQA(검역본부)='접수일', KRSL(코미팜)='샘플 수령일'. 앱 라벨은
 * '검체 접수일' 하나로 고정하고 보조설명에 두 표기를 병기한다(2026-07-28 사용자 확인).
 *
 * client(저장 거부)·procedure-check(주의) 공용 — 한쪽 날짜가 비면 통과.
 */
export function validateAuQuarantineReservationDate(
  reservationDate: string,
  titerDates: string[],
): string | null {
  const res = (reservationDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(res)) return null
  const dates = titerDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test((d ?? '').slice(0, 10)))
  if (dates.length === 0) return null
  const days = TITER_ENTRY_WAIT_DAYS['australia'] ?? 180
  const ok = dates.some((d) => {
    const earliest = addDays(d.slice(0, 10), days)
    return !!earliest && earliest <= res
  })
  if (ok) return null
  return `항체 검사 검체가 검사기관에 접수된 날부터 ${days}일이 지나야 계류를 시작할 수 있어요.`
}

export function validateSgGstPermitDate(
  issuedDate: string,
  departureDate: string,
): string | null {
  if (!issuedDate || !departureDate) return null
  const issued = issuedDate.slice(0, 10)
  const dep = departureDate.slice(0, 10)
  if (issued > dep) {
    return 'GST 납부 허가는 싱가포르 도착 전에 받아야 해요. 날짜를 확인하세요.'
  }
  const earliest = addDays(dep, -14)
  if (earliest && issued < earliest) {
    return 'GST 납부 허가는 도착일 기준 14일 이내에 받을 수 있어요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 싱가포르 — 내·외부 구충 처치는 출국일 기준 2~7일 창에서 해야 함.
 * (Schedule III IV(a)(vi) "between 2 and 7 days of export".)
 *
 * client(처치일 입력 시 저장 거부 — 필리핀 SPSIC 창·EU 촌충과 같은 모델, 2026-07-25 사용자
 * 확정)·procedure-check(sg.*-2to7days 안내 — 출국일을 나중에 수정해 어긋난 경우) 공용 단일
 * 출처. 출국일이 없으면 비교 불가라 통과.
 */
export function validateSgParasiteWindow(
  treatDate: string,
  departureDate: string,
  label: string,
): string | null {
  if (!treatDate || !departureDate) return null
  const gap = daysBetween(treatDate.slice(0, 10), departureDate.slice(0, 10))
  if (gap < 2 || gap > 7) {
    return `${label}는 출국 2~7일 전에 해야 해요. 날짜를 확인하세요.`
  }
  return null
}

/**
 * 출국일 앵커 '채취일 ~ 출국 N일 이내' 기생충 창 — 목적지별 상한(일)과 문구. **저장 거부·주의
 * 공용 단일 출처**(validateParasiteDateForDestination 이 읽는다). 새 목적지는 여기 한 줄 추가하면
 * client 저장 거부·procedure-check 주의·커버리지 lint 가 함께 붙는다(2026-07-25 통합).
 *
 * ⚠️ 싱가포르(2~7일, 하한도 있음)·필리핀(수입허가 신청일 앵커)·EU 촌충(입국일 앵커, 1~5일)은
 *   앵커·창 모양이 달라 여기 넣지 않고 dispatch 에서 전용 함수로 분기한다.
 */
export const PARASITE_DEPARTURE_WINDOWS: Record<
  string,
  { maxGap: number; windowLabel: string; kinds: Array<'external' | 'internal'> }
> = {
  turkey: { maxGap: 30, windowLabel: '출국 30일 이내', kinds: ['external', 'internal'] },
  mexico: { maxGap: 180, windowLabel: '멕시코 도착 6개월 이내', kinds: ['external', 'internal'] },
  brazil: { maxGap: 14, windowLabel: '출국 15일 이내', kinds: ['external', 'internal'] },
  uae: { maxGap: 13, windowLabel: '출국 14일 이내', kinds: ['external', 'internal'] },
  hawaii: { maxGap: 13, windowLabel: '출국 14일 이내', kinds: ['external'] },
  // 괌 — 내·외부 기생충 + 심장사상충을 '도착 14일 이내'에 함께 처치한다(www 괌 가이드·gu.ts).
  //   주의만 있고 저장 거부가 없으면 창 밖 날짜가 그대로 저장된다(2026-07-25 5개국 사고와 같은 구멍).
  guam: { maxGap: 13, windowLabel: '괌 도착 14일 이내', kinds: ['external', 'internal'] },
  // 호주 — **내부구충만** 창이 있다(DAFF 7.7 "twice within 45 days before export").
  //   DAFF 예제(출국 1/30 → 1차 12/16)가 45일 당일을 허용하므로 maxGap = 45.
  //   ⛔ 외부구충(external)은 넣지 않는다 — 호주 요건은 "출국 **30일 전에 시작**해서 출국일까지
  //     약효 유지"라 상한이 아니라 **하한**이다. 창으로 막으면 출국 직전의 정당한 반복 처치
  //     (제조사 지침대로 재투여)를 거부하게 된다. 시작 시점은 주의 룰
  //     (au.external-parasite-protocol-dog/-cat)이 판정한다.
  australia: { maxGap: 45, windowLabel: '출국 전 45일 이내', kinds: ['internal'] },
  // 뉴질랜드 — 호주와 같은 이유로 **내부구충만**(IHS 2.3(1) "first treatment must be given in
  //   the 30 days before the date of shipment"). 2차 5일 이내·14일 간격은 창 하나로 표현할 수
  //   없어 주의 룰(nz.internal-parasite-protocol)이 함께 본다.
  //   ⛔ 외부구충(external)은 넣지 않는다 — 뉴질랜드 요건(2.2(2))은 1차가 **바베시아 채혈
  //     14일 전**이라 출국일 앵커가 아니고, 1차는 30일보다 훨씬 이를 수 있다(채혈이 출국 30일
  //     전이면 1차는 최소 44일 전). 창으로 막으면 규정대로 준비한 케이스를 거부한다.
  new_zealand: { maxGap: 30, windowLabel: '출국 30일 이내', kinds: ['internal'] },
}

function validateParasiteWithinDays(
  treatDate: string,
  departureDate: string,
  maxGap: number,
  windowLabel: string,
  treatLabel: string,
): string | null {
  if (!treatDate || !departureDate) return null
  const gap = daysBetween(treatDate.slice(0, 10), departureDate.slice(0, 10))
  if (gap === null) return null
  if (gap < 0) return `${treatLabel}일이 출국일보다 늦어요. 날짜를 확인하세요.`
  if (gap > maxGap) return `${treatLabel}는 ${windowLabel}에 해야 해요.`
  return null
}

/**
 * 기생충(외부·내부) 처치일 저장 거부·주의 **단일 dispatch**. 목적지별 창을 한 곳에서 판정한다.
 * client(getSaveBlockError)·procedure-check(각국 *.parasite 룰)이 같은 함수를 부른다 —
 * 저장 거부가 목적지마다 손수 배선돼 새 목적지에서 누락되던 문제(2026-07-25)를 근본 해결.
 *
 * 출국일(도착 proxy) 미입력이면 통과(치료 먼저 하는 순서를 막지 않기 위해).
 */
export function validateParasiteDateForDestination(
  treatDate: string,
  ctx: {
    destinationKey: string | null | undefined
    kind: 'external' | 'internal'
    departureDate: string
    /**
     * 문구에 쓸 항목 이름 — 기본은 kind 로 정한다('내부/외부 기생충 치료').
     * 같은 창을 공유하지만 이름이 다른 항목(심장사상충 검사)이 넘긴다. 안 넘기면 심장사상충
     * 카드에서 '내부 기생충 치료는…' 이 나간다(2026-07-27 카드 분리 때 발견).
     */
    label?: string
  },
): string | null {
  if (!treatDate || !ctx.departureDate) return null
  const label = ctx.label ?? (ctx.kind === 'internal' ? '내부 기생충 치료' : '외부 기생충 치료')
  // 싱가포르 — 2~7일 창(내·외부 동일).
  if (matchesDestinationKey(ctx.destinationKey, 'singapore')) {
    return validateSgParasiteWindow(treatDate, ctx.departureDate, label)
  }
  // 출국일 앵커 '~N일 이내' 창 (터키·멕시코·브라질·UAE·하와이).
  for (const key of Object.keys(PARASITE_DEPARTURE_WINDOWS)) {
    if (!matchesDestinationKey(ctx.destinationKey, key)) continue
    const w = PARASITE_DEPARTURE_WINDOWS[key]
    if (!w.kinds.includes(ctx.kind)) return null
    return validateParasiteWithinDays(treatDate, ctx.departureDate, w.maxGap, w.windowLabel, label)
  }
  return null
}

/**
 * @deprecated 하위호환 래퍼 — 새 코드는 validateParasiteDateForDestination 을 직접 쓴다.
 *   (통합 dispatch 이관 과도기, step-detail-view 의 옛 하와이 브랜치 호환용.)
 */
export function validateHiTickWindow(treatDate: string, departureDate: string): string | null {
  return validateParasiteDateForDestination(treatDate, {
    destinationKey: 'hawaii',
    kind: 'external',
    departureDate,
  })
}

/**
 * 싱가포르 — 국경 검사(CAPQ 도착 검사)는 도착 최소 5일 전에 예약해야 함.
 * (NParks "Book an inspection ... five days before the animal's arrival, or earlier."
 * 당일 도착 노선이라 출발일 앵커 = 도착일 근사.) 도착 이후 예약(간격 음수)도 같은 위반.
 *
 * client(예약일 입력 시 저장 거부)·procedure-check(출국일을 나중에 수정해 어긋난 경우
 * '주의') 공용 단일 출처. 출국일이 없으면 비교 불가라 통과.
 */
export function validateSgBorderInspectionDate(
  bookedDate: string,
  departureDate: string,
): string | null {
  if (!bookedDate || !departureDate) return null
  const gap = daysBetween(bookedDate.slice(0, 10), departureDate.slice(0, 10))
  if (gap < 5) {
    return '국경 검사는 도착 최소 5일 전에 예약해야 해요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 싱가포르 — 출국일은 계류장(AQC) 예약일과 같은 날 또는 하루 전날이어야 함.
 *
 * 계류 시작(예약일) = 싱가포르 도착일이고 한국→싱가포르는 당일(또는 자정 넘김 +1일) 도착
 * 이므로, 예약일을 먼저 잡은 뒤 항공권을 그 날짜에 맞춰 산다(예약일 − 출국일 ∈ {0, 1}).
 *
 * client(항공권 출국일 입력 시 저장 거부)·procedure-check(예약일을 나중에 수정해 어긋난
 * 경우 '주의') 공용 단일 출처. 예약일이 없으면 비교 불가라 통과.
 */
export function validateSgDepartureVsQuarantineReservation(
  departureDate: string,
  reservationDate: string,
): string | null {
  if (!departureDate || !reservationDate) return null
  const dep = departureDate.slice(0, 10)
  const res = reservationDate.slice(0, 10)
  if (dep === res || addDays(dep, 1) === res) return null
  // 방향별 문구(2026-07-25 사용자안) — 항공권(출국일) 칸 관점.
  if (dep > res) return '출국일이 격리 시작일보다 늦어요. 날짜를 확인하세요.'
  const gap = daysBetween(dep, res)
  return `출국일이 격리 시작일 ${gap}일 전이에요. 날짜를 확인하세요.`
}

/**
 * 싱가포르 — 계류장(AQC) 예약일 입력 시의 역방향 정합(출국일이 먼저 입력된 경우).
 * 같은 규칙(예약일 − 출국일 ∈ {0, 1})을 예약일 칸 관점 문구로 — 조치 대상이 눈앞의 칸이 되게.
 * client(계류장 카드 예약일 입력 시 저장 거부) 전용 — 주의 룰은 출국일 관점(항공권 카드) 하나만.
 */
export function validateSgReservationVsDeparture(
  reservationDate: string,
  departureDate: string,
): string | null {
  if (!departureDate || !reservationDate) return null
  const dep = departureDate.slice(0, 10)
  const res = reservationDate.slice(0, 10)
  if (dep === res || addDays(dep, 1) === res) return null
  if (res < dep) return '예약일이 출국일보다 빨라요. 날짜를 확인하세요.'
  const gap = daysBetween(dep, res)
  return `예약일이 출국일 ${gap}일 이후에요. 날짜를 확인하세요.`
}

/**
 * 싱가포르 — 계류장(AQC) 예약 날짜(계류 시작일)는 채혈 + 90일 이후 ~ + 12개월 이내여야 함.
 *
 * 규정 창의 정식 앵커는 출발(export) — NParks Schedule III IV(a)(iii) "not less than 90 days /
 * not more than 12 months prior to export". 한국→싱가포르는 당일 도착이라 계류 시작(입국) ≈
 * 출발이므로 예약일에도 같은 창을 적용한다(출발일 직접 검증은 항공권 카드 룰이 담당).
 *
 * client(예약일 입력 시 저장 거부)·procedure-check(sg.quarantine-reservation-date-within-
 * titer-window, 채혈 수정으로 어긋난 경우 '주의') 공용 단일 출처. 어떤 채혈이든 창에 들면
 * 통과, 채혈 기록 없으면 비교 불가라 통과.
 */
export function validateSgQuarantineReservationDate(
  reservationDate: string,
  titerDates: string[],
): string | null {
  if (!reservationDate) return null
  const valid = titerDates.filter((d) => typeof d === 'string' && d.length >= 10)
  if (valid.length === 0) return null
  const within = valid.some(
    (d) => daysBetween(d, reservationDate) >= 90 && addYears(d, 1) >= reservationDate,
  )
  if (within) return null
  const passes90 = valid.some((d) => daysBetween(d, reservationDate) >= 90)
  // 문구 통일(2026-07-25 사용자안): 라벨('예약일')로 시작 + '날짜를 확인하세요' 마무리.
  return passes90
    ? '예약일은 항체 검사 유효기간(12개월) 이내여야 해요. 날짜를 확인하세요.'
    : '예약일은 채혈일로부터 90일이 지난 후여야 해요. 날짜를 확인하세요.'
}

/**
 * 태국 — 수입 허가 신청일은 광견병·종합백신의 가장 최근 접종일 + 14일(2주) 이후여야 함.
 * (DLD/petmove 가이드 — 백신은 신청 14일 전 완료. 보수적으로 모든 접종에 적용.)
 * client(신청 입력 시 입력 불가)·procedure-check(백신 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateThImportPermitVaccineGap(
  filedDate: string,
  data: Record<string, unknown>,
): string | null {
  if (!filedDate) return null
  for (const [key, label] of [
    ['rabies_dates', '광견병 백신'],
    ['general_vaccine_dates', '종합백신'],
  ] as const) {
    const dates = readDateArray(data, key)
    if (dates.length === 0) continue
    const latest = dates.reduce((m, d) => (d > m ? d : m))
    const earliest = addDays(latest, 14)
    if (earliest && filedDate < earliest) {
      return `${label} 접종일로부터 14일이 지나고 수입 허가를 신청할 수 있어요.`
    }
  }
  return null
}

/**
 * 필리핀 — 수입 허가증(SPSIC) 신청일은 광견병·종합백신 **1차(단일 접종)** 기준 14일 이후.
 * 부스터(2회 이상)는 BAI 면제(즉시 신청 가능) — 단일 접종일 때만 검사.
 * client·procedure-check 공용. 한쪽 비면 통과.
 */
export function validatePhImportPermitVaccineGap(
  filedDate: string,
  data: Record<string, unknown>,
): string | null {
  if (!filedDate) return null
  for (const [key, label] of [
    ['rabies_dates', '광견병 백신'],
    ['general_vaccine_dates', '종합백신'],
  ] as const) {
    const dates = readDateArray(data, key)
    if (dates.length !== 1) continue // 0건 = 비교 불가, 2건+ = 부스터 면제
    const earliest = addDays(dates[0], 14)
    if (earliest && filedDate < earliest) {
      return `${label} 접종일로부터 14일이 지나고 수입 허가증(SPSIC)을 신청할 수 있어요.`
    }
  }
  return null
}

/**
 * 필리핀 — 내부 기생충 치료는 수입 허가증(SPSIC) **신청일 기준 7일 전 ~ 달력 3개월 이내**여야 한다
 * (BAI MC 49 명시 의무 — 파일 헤더 근거 참조. 카드 문구의 '7일~3개월'이 이 창이다).
 *
 * client(치료일 입력 시 입력 불가)·procedure-check(신청일을 나중에 고쳤을 때 주의) 공용 —
 * 두 층이 같은 함수를 봐야 기준이 갈리지 않는다(멕시코 대기 계산 사고와 같은 부류).
 *
 * ⚠️ 신청일이 아직 없으면 판정하지 않는다(SKIP) — 보호자가 치료를 먼저 하고 나중에 신청하는
 *   순서가 정상이라, 신청일 미입력 상태에서 치료일을 막으면 정상 흐름을 차단하게 된다.
 *   신청일을 넣는 순간 procedure-check 주의가 어긋난 치료일을 잡아 준다.
 */
export function validatePhInternalParasiteWindow(
  treatmentDate: string,
  filedDate: string,
): string | null {
  if (!treatmentDate || !filedDate) return null
  const gap = daysBetween(treatmentDate, filedDate)
  if (!Number.isFinite(gap)) return null
  if (gap < 0) {
    return '내부 기생충 치료는 수입 허가증(SPSIC) 신청 전에 해야 해요. 날짜를 확인하세요.'
  }
  if (gap < 7) {
    return '내부 기생충 치료는 수입 허가증(SPSIC) 신청 7일 전까지 마쳐야 해요. 날짜를 확인하세요.'
  }
  // 상한은 **달력 3개월** — 일수(91) 환산이 아니다(2026-07-22 사용자 지정). 일수로 잡으면
  // 낀 달에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다(몽골 최소 연령과 같은 처리).
  const limit = addMonths(treatmentDate, 3)
  if (limit && filedDate > limit) {
    return '내부 기생충 치료는 수입 허가증(SPSIC) 신청 3개월 이내에 해야 해요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 필리핀 SPSIC 신청일 관점의 같은 검사 — **신청일 칸에서** 내부 기생충 치료 창을 본다.
 *
 * ⚠️ 왜 양쪽에 거는가(2026-07-22 사용자 지적): 실무 순서는 **치료 먼저 → 신청 나중**이라,
 *   치료일 칸에만 걸어 두면 그 시점엔 신청일이 비어 있어 **차단이 사실상 발동하지 않는다.**
 *   규칙이 실제로 판정되는 순간은 신청일을 넣을 때다. 두 칸 모두 같은 함수를 본다.
 *
 * 창을 만족하는 치료가 하나라도 있으면 통과 — 여러 번 치료한 경우를 벌하지 않는다
 * (주의 룰 ph.internal-parasite-7to91days-before-permit 과 같은 판정).
 */
export function validatePhImportPermitParasiteGap(
  filedDate: string,
  data: Record<string, unknown>,
): string | null {
  if (!filedDate) return null
  const dates = readDateArray(data, 'internal_parasite_dates')
  if (dates.length === 0) return null
  if (dates.some((d) => validatePhInternalParasiteWindow(d, filedDate) === null)) return null
  // 전부 창 밖 — 가장 최근 치료 기준으로 이유를 알려준다.
  const latest = [...dates].sort()[dates.length - 1]
  return validatePhInternalParasiteWindow(latest, filedDate)
}

/**
 * 필리핀 — 수입 허가증(SPSIC)은 발급일로부터 60일간 유효(연장 불가)하므로, 출국일 60일보다
 * 일찍 신청하면 출국 전에 만료돼 무효. 신청일이 (출국일 − 60일)보다 빠르면 차단.
 * (발급은 신청 며칠 뒤라 신청일 기준 60일은 약간 보수적이지만 안전 측 — 출국 시 유효 보장.)
 */
export function validatePhImportPermitWithin60Days(
  filedDate: string,
  departureDate: string,
): string | null {
  if (!filedDate || !departureDate) return null
  const earliest = addDays(departureDate.slice(0, 10), -60)
  if (earliest && filedDate.slice(0, 10) < earliest) {
    // 고객 문구에 구체 날짜 보간 금지(앱 카피 규칙) + 목적지 중립(필리핀 SPSIC·태국 R7 공용).
    return '수입 허가증은 발급일로부터 60일간 유효해요. 출국 60일 전부터 신청할 수 있어요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 아랍에미리트 — MOCCAE 수입 허가는 **90일 유효**(ae.ts 헤더). 필리핀 60일과 같은 모델이라
 * 너무 일찍 신청하면 입국 전에 만료된다. client(신청일 차단)·procedure-check 공용.
 *
 * ⚠️ 발급이 신청 며칠 뒤라 '신청일 기준 90일'은 약간 보수적이다(안전 측 — 입국 시 유효 보장).
 *   필리핀과 같은 처리이며, MOCCAE 처리 일수를 확인하면 그때 정밀화할 것.
 */
export function validateAeImportPermitWithin90Days(
  filedDate: string,
  departureDate: string,
): string | null {
  if (!filedDate || !departureDate) return null
  const earliest = addDays(departureDate.slice(0, 10), -90)
  if (earliest && filedDate.slice(0, 10) < earliest) {
    // 고객 문구에 구체 날짜 보간 금지(앱 카피 규칙, 2026-07-25 사용자 지적) — 날짜 없이.
    return '수입 허가증은 발급일로부터 90일간 유효해요. 출국 90일 전부터 신청할 수 있어요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 채혈 후 대기(개월)를 선언한 목적지 — 프로파일 `titer.entryWaitAfterTiter.months` 파생.
 *
 * ⚠️ `days` 선언(대만 180일)은 **여기서 제외**한다 — 대만은 하한만이 아니라 '180일~2년 창'과
 *   격리 분기가 얽혀 있어 전용 함수(validateTwEntryDate)가 따로 판정한다. 두 곳이 같은
 *   입력을 각자 계산하면 기준이 갈린다(멕시코 대기 계산 사고와 같은 부류).
 */
const TITER_ENTRY_WAIT_MONTHS: Record<string, number> = Object.fromEntries(
  destinationKeysWhere((o) => typeof o.titer?.entryWaitAfterTiter?.months === 'number').map((k) => [
    k,
    DESTINATION_OVERRIDES[k]!.titer!.entryWaitAfterTiter!.months!,
  ]),
)

/**
 * 채혈 후 대기(**일수**)를 선언한 목적지 — 프로파일 `titer.entryWaitAfterTiter.days` 파생.
 *
 * ⚠️ 대만(180일)은 제외 — 위 주석대로 '180일~2년 창 + 격리 분기'를 전용 함수
 *   (validateTwEntryDate)가 함께 판정하므로 이중 계산 금지. 싱가포르(90일)처럼 **단순 하한**만
 *   있는 나라가 대상(NParks "not less than 90 days"). 월 근사 대신 정확한 일수로 차단한다.
 */
const TITER_ENTRY_WAIT_DAYS: Record<string, number> = Object.fromEntries(
  destinationKeysWhere((o) => typeof o.titer?.entryWaitAfterTiter?.days === 'number')
    .filter((k) => k !== 'taiwan')
    .map((k) => [k, DESTINATION_OVERRIDES[k]!.titer!.entryWaitAfterTiter!.days!]),
)

/**
 * 채혈 후 대기 목적지의 입국일(= 출국 항공편 날짜) — 광견병 항체 검사 채혈일 + N개월(캘린더)
 * 미만 입국만 hard 차단. 일본 180일 룰과 같은 기준: 재검사해도 새 채혈일 + N개월을 다시
 * 기다려야 하므로 회복 경로가 입국일 변경뿐. (EU Reg 576/2013 Art.12 — "at least three months")
 *
 * 대상 = EU 패밀리(3개월, 프로파일 미선언) **∪ 프로파일 선언 목적지**. 함수 이름은 EU 지만
 * EU 전용이 아니다 — 이름만 보고 다른 나라를 빼지 말 것.
 *
 * ⚠️ 하드코딩 목록만 보던 시절, 같은 3개월 요건인 **우크라이나가 조용히 빠져 있었다**
 *   (2026-07-22 발견 — 프로파일에 entryWaitAfterTiter 를 선언해 뒀는데 읽는 곳이 없었다).
 *   그래서 선언을 진실 출처로 승격시켰다. 새 목적지는 프로파일 한 줄이면 자동 적용되고,
 *   빠뜨리면 `pnpm lint:validation-wiring` 6단계가 실패시킨다. 나라 이름을 손으로 넣는
 *   방식으로 되돌리지 말 것.
 *
 * 대상 외 목적지·항체 검사 미입력 시 SKIP.
 */
export function validateEuEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  // ⚠️ 이스라엘 제외 — archetype 'eu-family'(카드 골격 재사용)로 EU_ENTRY_FAMILY 에 들어오지만
  //   이스라엘 규정엔 '항체 검사 후 3개월 대기'가 없다(procedure-checks/il.ts 헤더: "RNATT 입국
  //   후 추가 대기 없음"). 여기서 안 빼면 정상 입국일 입력을 3개월 대기로 잘못 막는다.
  //   같은 이유로 eu.ts(주의)·destination-overrides.ts(카드 문구)에서도 이스라엘을 제외한다.
  const monthsKey = [
    ...EU_ENTRY_FAMILY.filter((k) => k !== 'israel'),
    ...Object.keys(TITER_ENTRY_WAIT_MONTHS),
  ].find((key) => matchesDestinationKey(ctx.destination, key))
  // 일수 기반(싱가포르 90일) — 월 기반에 안 걸린 경우만. 대만은 TITER_ENTRY_WAIT_DAYS 에서 제외됨.
  const daysKey = monthsKey
    ? undefined
    : Object.keys(TITER_ENTRY_WAIT_DAYS).find((key) => matchesDestinationKey(ctx.destination, key))
  if (!monthsKey && !daysKey) return null

  // 대기 기준일 — 규정이 **검체 도착일**인 목적지(호주·괌·하와이, 프로파일
  //   titer.entryWaitAfterTiter.basisReceivedDate)는 입력된 도착일을 우선 쓰고, 미입력이면
  //   채혈일로 대신한다(채혈 ≤ 도착이라 덜 엄격 = 규정을 지킨 사람을 막지 않는 방향).
  //   그 외 목적지는 종전대로 채혈일만 본다.
  const useReceived = !!(
    daysKey && DESTINATION_OVERRIDES[daysKey]?.titer?.entryWaitAfterTiter?.basisReceivedDate
  )
  const titerDates: string[] = []
  const rawTiters = ctx.data.rabies_titer_records
  if (Array.isArray(rawTiters)) {
    for (const r of rawTiters) {
      if (r && typeof r === 'object') {
        const rec = r as Record<string, unknown>
        const received =
          useReceived && typeof rec.received_date === 'string' ? rec.received_date : ''
        const d = /^\d{4}-\d{2}-\d{2}$/.test(received) ? received : rec.date
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) titerDates.push(d)
      }
    }
  }
  if (titerDates.length === 0) return null
  titerDates.sort()

  // 일수 기반(정확한 N일) — 채혈 + N일 ≤ 입국일 만족 채혈이 하나라도 있으면 통과.
  if (daysKey) {
    const days = TITER_ENTRY_WAIT_DAYS[daysKey]
    const ok = titerDates.some((t) => {
      const earliest = addDays(t, days)
      return !!earliest && earliest <= v
    })
    if (ok) return null
    // 기준일이 검체 수령일(하와이 — 앱 미입력, 채혈일 proxy)인 경우엔 계산된 특정 날짜를
    // 단정하지 않고 요건만 안내한다(hi.favn '안내'와 같은 문구 — 검사일 기준 아님).
    if (DESTINATION_OVERRIDES[daysKey]?.titer?.entryWaitAfterTiter?.basisReceivedDate) {
      return `광견병 항체 검사 검체가 검사기관에 접수된 날로부터 ${days}일이 지나야 입국할 수 있어요.`
    }
    const earliestEntry = addDays(titerDates[0], days)
    return earliestEntry
      ? `검사일로부터 ${days}일 후인 ${fmt(earliestEntry)}에 입국할 수 있어요.`
      : `광견병 항체 검사일로부터 ${days}일이 지나면 입국할 수 있어요.`
  }

  // 월(캘린더) 기반 — 채혈 + N개월 ≤ 입국일 (eu.departure-min-3months 와 동일).
  const months = TITER_ENTRY_WAIT_MONTHS[monthsKey!] ?? 3
  const ok = titerDates.some((t) => {
    const earliest = addMonths(t, months)
    return !!earliest && earliest <= v
  })
  if (ok) return null
  const earliestTiter = titerDates[0]
  const earliestEntry = addMonths(earliestTiter, months)
  return earliestEntry
    ? `검사일로부터 ${months}개월 후인 ${fmt(earliestEntry)}에 입국할 수 있어요.`
    : `광견병 항체 검사일로부터 ${months}개월이 지나면 입국할 수 있어요.`
}

/**
 * 아일랜드 사전 통지일 — 입국일 24시간(1일) 전까지 제출해야 함.
 * client(통지 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateIeAdvanceNoticeDate(noticeDate: string, entryDate: string): string | null {
  if (!noticeDate || !entryDate) return null
  if (daysBetween(noticeDate, entryDate) < 1) {
    return '입국 24시간(1일) 전까지 사전 통지를 해야 해요. 통지가 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 스위스 수입허가(FSVO) 신청일 — 입국일 3주(21일) 전까지 신청해야 함.
 * client(신청 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateChImportPermitDate(filedDate: string, entryDate: string): string | null {
  if (!filedDate || !entryDate) return null
  if (daysBetween(filedDate, entryDate) < 21) {
    return '입국 3주(21일) 전까지 수입허가를 신청해야 해요. 신청이 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 대만 수입허가 최소 리드타임 — 신청은 **출국 20일 전까지**만 가능(APHIA: 應於輸入 20 日前
 * 提出申請). 20일 미만은 신청 자체가 접수되지 않으므로 저장을 거부한다.
 *
 * 120일(격리 면제)과 달리 이건 '가능/불가능'의 선이다. 120일을 놓친 사람은 7일 격리를
 * 감수하고 갈 수 있지만, 20일을 놓친 사람은 허가 자체가 없어 못 간다.
 *
 * 두 칸 어느 쪽을 나중에 입력해도 막아야 한다 — 신청일 입력 시
 * (validateImportPermitFiledDate)와 출국일 입력 시(validateEntryDateForDestination)
 * 양쪽에서 부른다. 한쪽 비면 통과.
 */
export function validateTwImportPermitLeadTime(
  filedDate: string,
  departureDate: string,
  opts?: { subject: 'filed' | 'departure' },
): string | null {
  if (!filedDate || !departureDate) return null
  const filed = filedDate.slice(0, 10)
  const dep = departureDate.slice(0, 10)
  const gap = daysBetween(filed, dep)
  if (gap === null || gap >= 20) return null
  // 지금 사용자가 고치고 있는 칸을 기준으로 안내한다 — 반대쪽 칸을 바꾸라고 하면
  // '지금 여기서 할 수 있는 일'이 아니게 된다.
  if (opts?.subject === 'departure') {
    const earliest = addDays(filed, 20)
    return earliest
      ? `수입 허가 신청일로부터 20일 후인 ${fmt(earliest)}에 대만에 입국할 수 있어요.`
      : '수입 허가 신청일로부터 20일이 지나야 대만에 입국할 수 있어요.'
  }
  return '수입 허가는 출국 20일 전까지 신청할 수 있어요. 날짜를 확인하세요.'
}

/**
 * 출국·입국일 입력불가(저장 거부) — **목적지별 분기의 단일 출처**.
 *
 * 수입허가와 같은 이유로 도메인에 올린다: 분기가 portal 컴포넌트 안에만 있으면 어느
 * 목적지가 빠졌는지·기준이 맞는지 아무도 못 본다. 실제로 대만 180일 오차단이 이 층에
 * 있었고, 이 층을 태우는 스냅샷이 없어 사람이 우연히 발견했다(2026-07-19).
 *
 * 기준일이 목적지마다 다르다 — 클라이언트가 쓰던 그대로 보존한다:
 *  - 일본: 입국일(entry_date)
 *  - 태국·미국: 출발일(departure_date) — procedure-check 가 departure 를 보는 것과 같은 기준
 *  - 필리핀·EU 패밀리·대만: 입국일, 없으면 출발일 폴백(대부분 당일·익일 차이)
 */
export function validateEntryDateForDestination(
  entryDate: string,
  departureDate: string,
  ctx: DateRuleContext,
): string | null {
  const entry = (entryDate ?? '').trim()
  const departure = (departureDate ?? '').trim()
  const outbound = departure || entry
  const entryOrDeparture = entry || departure
  return (
    // 미국 — 항공권 카드에서 도착일 입력을 없애(2026-07-26 사용자 결정) 출발일 기준으로 통일.
    // `outbound`(출발일 우선)를 쓴다 — 예전 케이스에 남아 있는 stale entry_date 가 판정을
    // 가로채지 않게 하려면 entry 우선이면 안 된다. 태국과 같은 기준이다.
    validateUsDogEntryDate(outbound, ctx) ??
    validateJpEntryDate(entry, ctx) ??
    validateThEntryDate(outbound, ctx) ??
    // 말레이시아·인도네시아는 전용 함수를 두지 않는다(2026-07-22 정리) — 말레이시아 30일은
    // 프로파일 entryWaitDaysAfterVaccine 파생(validateRabiesEntryWait)이 처리하고,
    // 인도네시아는 1차 출처에 대기 규정이 없어 대기 차단 자체가 없다.
    validatePhEntryDate(entryOrDeparture, ctx) ??
    // 홍콩 — 생후 5개월(달력) 미만 입국 차단. 광견병 30일·종합백신 14일 대기는 아래 프로파일
    // 파생 차단(validateRabiesEntryWait / validateGeneralVaccineEntryWait)이 담당한다.
    validateHkEntryDate(entryOrDeparture, ctx) ??
    // 이스라엘 — 출국일 만 4개월(생일 불변이라 저장 거부). EU 골격이나 항체 3개월 대기는 없어
    // validateEuEntryDate 에서 제외되므로 여기서 별도로 나이만 막는다.
    validateIlEntryDate(entryOrDeparture, ctx) ??
    // 종합백신 접종 후 대기(싱가포르 14·UAE 21·카자흐/러시아 20) — 프로파일 파생 저장 거부.
    validateGeneralVaccineEntryWait(entryOrDeparture, ctx) ??
    validateEuEntryDate(entryOrDeparture, ctx) ??
    validateTwEntryDate(entryOrDeparture, ctx) ??
    // 대만 광견병 선적 대기(90/30일) — 항체 90일과 별개 요건. 재검사 체인으로 항체 대기가
    // 면제되는 경로에서는 이것만 남는다.
    validateTwRabiesShipmentDate(entryOrDeparture, ctx) ??
    // 접종 후 대기(베트남·몽골·우즈베키스탄·캄보디아 30일) — 출국일 입력 시에만 거부
    // (접종일 입력 경로는 주의로 안내). 이 나라들은 출발일 입력칸이 따로 없어 입국일·출국일이
    // 사실상 같은 값이라 entryOrDeparture 를 쓴다. 대기 0인 캐나다는 함수 안에서 SKIP.
    validateRabiesEntryWait(entryOrDeparture, ctx) ??
    // 대만 — 이미 낸 수입허가 신청일로부터 20일 안쪽으로 출국일을 당기면 거부.
    // 허가를 먼저 내고 항공권을 나중에 넣는 경로(대만은 카드 순서가 허가 → 항공권)에서
    // 이 조합이 실제로 나온다. 신청일 쪽 입력에도 같은 함수가 걸려 있다.
    (matchesDestinationKey(ctx.destination, 'taiwan')
      ? validateTwImportPermitLeadTime(
          typeof ctx.data.import_permit_application_date === 'string'
            ? ctx.data.import_permit_application_date
            : '',
          entryOrDeparture,
          { subject: 'departure' },
        )
      : null)
  )
}

/**
 * 수입허가 신청일 입력불가(저장 거부) — **목적지별 분기의 단일 출처**.
 *
 * 예전엔 이 분기가 portal 의 step-detail-view 안에만 있었다. 그 결과 ①대만이 빠진 걸
 * 아무도 못 봤고(출국일 이후 신청도 저장됨, 2026-07-19 발견) ②lint:behavior 가 이 층을
 * 검사하려면 판정 로직을 복제해야 했다(복제하면 진짜 동작과 어긋난다).
 *
 * 여기로 올려서 client 와 가드가 **같은 함수**를 부르게 한다. 새 목적지의 수입허가 카드는
 * 이 switch 에 한 줄 추가하면 입력불가와 스냅샷이 동시에 붙는다.
 *
 * 마감일(태국 9일·대만 120/20일 등)은 여기 넣지 않는다 — 지나가면 회복이 불가해
 * 차단은 과하고, procedure-check '주의'가 담당한다. 여기 있는 건 전부
 * '그 날짜로는 절차 자체가 성립하지 않는' 논리적 불가능뿐.
 */
export function validateImportPermitFiledDate(
  destinationKey: string,
  filedDate: string,
  ctx: {
    departureDate: string
    entryDate: string
    data: Record<string, unknown>
    /**
     * 허가 번호 — 신청일 없이 번호만 입력하는 카드(호주·뉴질랜드)에서 '입력이 들어왔는지'를
     * 판정하는 데 쓴다. 선행 절차 게이트가 신청일 칸에만 걸리면 번호만 넣는 경로로 빠져나간다.
     */
    permitNo?: string
  },
): string | null {
  const { departureDate, entryDate, data, permitNo } = ctx
  switch (destinationKey) {
    // 태국 — ①출국일 이후 신청 불가 ②백신 접종 14일(2주) 이내 신청 불가
    //   ③R7 허가 60일 유효(출국 60일 전부터 — 더 이르면 출국 전 만료. th.ts 헤더 근거,
    //     2026-07-25 필리핀과 동일 함수로 구현).
    case 'thailand':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateThImportPermitVaccineGap(filedDate, data) ??
        validatePhImportPermitWithin60Days(filedDate, departureDate)
      )
    // 말레이시아·인도네시아 — 검증 없음(2026-07-26, 홍콩과 같은 정리). 수입허가를 **현지
    // 에이전시가 신청**하는 모델이라 보호자가 신청일을 모른다. 카드가 버튼 완료로 바뀌면서
    // 신청일 입력 자체가 사라져, 남아 있던 '출국일 이후 신청 불가'도 판정할 값이 없어졌다.
    // 필리핀 — 위 + SPSIC 60일 유효(출국 60일보다 이르면 출국 전 만료) + 백신 14일.
    case 'philippines':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validatePhImportPermitWithin60Days(filedDate, departureDate) ??
        validatePhImportPermitVaccineGap(filedDate, data) ??
        // 내부 기생충 치료 창(7일~달력 3개월) — 치료일 칸이 아니라 **여기서** 실제로 발동한다
        // (실무 순서가 치료 먼저 → 신청 나중이라 치료 시점엔 신청일이 비어 있다).
        validatePhImportPermitParasiteGap(filedDate, data)
      )
    // 홍콩 — 검증 없음(2026-07-26). 수입 허가를 펫무브가 대행하지 않아 현지 에이전트가
    //   신청하므로 보호자는 신청일을 모른다. 카드가 버튼 완료 모델로 바뀌면서 신청일 입력
    //   자체가 사라져, 신청일 기반 판정(구 6개월·출국일 순서)을 함께 삭제했다.
    // 대만 — 출국일 이후 신청 불가. 카드 order 가 43(항공권 45 앞)이라 항공권 미입력 시
    // departureDate 가 비어 통과한다. 120일·20일 마감은 주의 담당.
    case 'taiwan':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateTwImportPermitLeadTime(filedDate, departureDate, { subject: 'filed' })
      )
    // 아랍에미리트 — 검증 없음(2026-07-26, 홍콩·말레이시아·인도네시아와 같은 정리).
    //   카드가 버튼 완료 모델로 바뀌어 신청일 입력 자체가 없다. 90일 유효는 카드 문구가 안내.
    //   (validateAeImportPermitWithin90Days 는 싱가포르가 계속 쓰므로 함수는 남는다.)
    // 싱가포르 — 출국일 이후 신청 불가 + 허가 90일 유효(도착일 기준 90일 이내 신청 — 더
    // 이르면 도착 전 만료. 당일 도착 노선이라 출발일 앵커 = 도착일 근사). UAE 와 동일
    // 구조(90일 유효)라 같은 함수 재사용 — 문구도 목적지 중립.
    case 'singapore': {
      // 강아지 라이선스 → 수입 허가 선행 순서 — sg.dog-licence-before-import-permit 주의와
      // 같은 함수(단일 출처). 라이선스 쪽을 나중에 고쳐 어긋난 경우는 그 주의가 잡는다.
      const sgLicence =
        typeof data.sg_dog_licence_application_date === 'string'
          ? data.sg_dog_licence_application_date.slice(0, 10)
          : ''
      const sgSpecies = typeof data.species === 'string' ? data.species : ''
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateAeImportPermitWithin90Days(filedDate, departureDate) ??
        validateSgImportPermitAfterDogLicence(filedDate, sgLicence, sgSpecies)
      )
    }
    // 뉴질랜드·호주 — 광견병 증명서(RCF · RNATT 선언서)를 먼저 받아야 신청할 수 있다.
    //   두 나라 모두 허가 신청의 필수 제출물이다(2026-07-29 사용자 지정). 발급 카드의
    //   **완료 여부**로 본다 — 날짜 비교가 아니다(위 함수 주석 참고).
    // 뉴질랜드·호주 — 선행 절차 게이트는 아래 단일 출처(importPermitPrerequisiteError)에.
    //   '완료' 버튼 경로(markImportPermitIssued)는 저장 검증을 타지 않으므로 서버 액션이
    //   같은 함수를 직접 부른다.
    case 'new_zealand':
    case 'australia':
      return importPermitPrerequisiteError(
        destinationKey,
        data,
        /^\d{4}-\d{2}-\d{2}$/.test((filedDate ?? '').slice(0, 10)) || !!permitNo,
      )
    // 스위스 — 입국 3주(21일) 이내 신청 불가.
    case 'switzerland':
      return validateChImportPermitDate(filedDate, entryDate)
    default:
      return null
  }
}

/**
 * 수입 허가는 광견병 증명서를 **먼저 받아야** 신청할 수 있다 — 뉴질랜드 RCF · 호주 RNATT 선언서.
 *
 * 두 나라 모두 그 서류가 허가 신청의 필수 제출물이라, 없이 신청하는 건 절차가 성립하지 않는다.
 * 판정 기준은 **발급 카드의 완료 여부**(=발급일 저장 여부)다 — 날짜 크기 비교가 아니다
 * (2026-07-29 사용자 결정). 호주 카드는 버튼 완료라 저장값이 '버튼 누른 날'이어서 날짜로
 * 비교하면 순서를 제대로 지킨 케이스에도 오경보가 난다. 완료 여부만 보면 두 나라를 같은
 * 방식으로 판정할 수 있다.
 *
 * 신청일이 비어 있으면 통과 — 아직 입력 단계가 아니다.
 */
export function validateImportPermitPrerequisite(
  /** 허가 카드에 입력이 들어왔는가 — 신청일 또는 허가 번호. 둘 다 비면 아직 입력 단계가 아니다. */
  hasPermitInput: boolean,
  prerequisiteDate: string,
  message: string,
): string | null {
  if (!hasPermitInput) return null
  const done = (prerequisiteDate ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(done)) return null
  return message
}

/**
 * 수입 허가의 **선행 절차 게이트** — 뉴질랜드(계류 예약 + RCF)·호주(RNATT 선언서). 단일 출처.
 *
 * 두 경로가 이 함수를 공유한다:
 *   ① 신청일·허가 번호 저장 — validateImportPermitFiledDate 의 목적지 분기
 *   ② '완료' 버튼 — markImportPermitIssued(서버 액션). 이쪽은 저장 검증을 타지 않아서,
 *      게이트를 저장 경로에만 두면 완료 버튼으로 선행 절차를 건너뛸 수 있었다(2026-07-29).
 *
 * @param data 활성 목적지로 **평탄화된** case.data (by_dest 값이 top-level 로 올라온 상태)
 * @param hasPermitInput 허가 카드에 입력·완료가 들어왔는가(신청일·허가 번호·완료 버튼)
 */
export function importPermitPrerequisiteError(
  destinationKey: string,
  data: Record<string, unknown>,
  hasPermitInput: boolean,
): string | null {
  const read = (k: string) => (typeof data[k] === 'string' ? (data[k] as string) : '')
  if (destinationKey === 'new_zealand') {
    // 선행이 **둘**이다 — 계류시설 예약 확인서와 RCF 가 모두 신청 제출물이다.
    //   둘 사이의 순서 제약은 없다.
    return (
      validateImportPermitPrerequisite(
        hasPermitInput,
        read('nz_rcf_date'),
        '광견병 증명서(RCF)를 먼저 발급받으세요.',
      ) ??
      validateImportPermitPrerequisite(
        hasPermitInput,
        read('nz_quarantine_reservation_date'),
        '계류시설을 먼저 예약하세요.',
      )
    )
  }
  if (destinationKey === 'australia') {
    return validateImportPermitPrerequisite(
      hasPermitInput,
      read('au_rnatt_declaration_date'),
      'RNATT 선언서를 먼저 발급받으세요.',
    )
  }
  return null
}

/**
 * 싱가포르 — 수입 허가(Licence to Import)는 강아지 라이선스(PALS)를 먼저 받아야 신청할 수
 * 있다(AVS/GoBusiness). 수입 허가 신청일이 라이선스 신청일보다 앞서면 순서 위반이라 저장을
 * 거부한다. client(수입 허가 신청일 입력 불가 — validateImportPermitFiledDate 싱가포르 분기)·
 * procedure-check(sg.dog-licence-before-import-permit — 라이선스 날짜를 나중에 고쳐 어긋난
 * 경우 주의) 공용 단일 출처.
 * 고양이는 라이선스 불요라 통과. 라이선스 날짜 미입력은 미보유로 단정하지 않고 통과
 * (둘 다 입력된 경우에만 순서 비교 — 추측 단정 금지).
 */
export function validateSgImportPermitAfterDogLicence(
  filedDate: string,
  licenceAppliedDate: string,
  species?: string | null,
): string | null {
  if (!filedDate || !licenceAppliedDate) return null
  if (species && species !== 'dog') return null
  if (filedDate.slice(0, 10) < licenceAppliedDate.slice(0, 10)) {
    return '수입 허가 신청일이 강아지 라이선스 신청일보다 앞서 있어요. 강아지 라이선스를 먼저 받아야 수입 허가를 신청할 수 있어요 — 두 날짜를 확인해 주세요.'
  }
  return null
}


/**
 * 노르웨이 사전 통지일 — 입국 48시간(2일) 전까지 Mattilsynet(노르웨이 식품안전청)에
 * 이메일로 통지해야 함 (mattilsynet.no 공식 확인, 2026-07-16).
 * client(통지 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateNoAdvanceNoticeDate(noticeDate: string, entryDate: string): string | null {
  if (!noticeDate || !entryDate) return null
  if (daysBetween(noticeDate, entryDate) < 2) {
    return '입국 48시간(2일) 전까지 사전 통지를 해야 해요. 통지가 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 키프로스 사전 통지일 — 입국 48시간(2일) 전까지 관할 지구 수의검역국(District Veterinary
 * Office)에 이메일로 통지해야 함 (moa.gov.cy 공식 확인, 2026-07-16).
 * client(통지 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateCyAdvanceNoticeDate(noticeDate: string, entryDate: string): string | null {
  if (!noticeDate || !entryDate) return null
  if (daysBetween(noticeDate, entryDate) < 2) {
    return '입국 48시간(2일) 전까지 사전 통지를 해야 해요. 통지가 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 이스라엘 사전 통보일 — **출국(적재) 2영업일 전**까지 통보해야 함(공식 안내 섹션 P·Q).
 * client(통보 입력 시 입력 불가)·procedure-check(출국일 수정 후 주의) 공용. 한쪽 비면 통과.
 *
 * 2영업일은 캘린더 계산이 복잡해 **입력불가는 2캘린더일**로 근사(사용자 지정 2026-07-23:
 * "입력불가는 2일 전부터"). 주말·공휴일 버퍼는 마감 알림 D-11·D-4(reminders.ts)가 담당한다
 * — 몰타 3영업일을 캘린더로 근사한 것과 같은 선례.
 */
export function validateIlAdvanceNoticeDate(noticeDate: string, departureDate: string): string | null {
  if (!noticeDate || !departureDate) return null
  if (daysBetween(noticeDate, departureDate) < 2) {
    return '출국 2영업일(최소 2일) 전까지 사전 통보를 해야 해요. 통보가 늦은 경우 출국일을 변경해야 해요.'
  }
  return null
}

/**
 * 몰타 사전 통지일 — 입국 3영업일 전까지 온라인 포털(nldmalta.gov.mt)에 등록해야 함
 * (servizz.gov.mt 공식 확인, 2026-07-16). 영업일 단위를 달력일로 보수 근사(공휴일 미고려) —
 * 실제로는 이 기한보다 여유 있게 제출을 권장.
 * client(통지 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateMtAdvanceNoticeDate(noticeDate: string, entryDate: string): string | null {
  if (!noticeDate || !entryDate) return null
  if (daysBetween(noticeDate, entryDate) < 3) {
    return '입국 3영업일 전까지 사전 통지를 해야 해요. 통지가 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 외부 기생충 **1차 처치 시작** 하한 — 출국일 앵커, 종별로 다르다.
 *
 * DAFF 7.6(개) / 고양이 가이드 7.3 — "Start at least 30(21) days before export." 처치일을
 * day 0 으로 세므로 정확히 30(21)일 전 당일 시작까지 인정한다(원문 예: 1/1 처치 → 개는
 * 1/31, 고양이는 1/22 이 가장 이른 출국일).
 *
 * ⛔ 뉴질랜드는 넣지 않는다 — NZ 외부구충 1차는 **바베시아 채혈 14일 전** 앵커라 출국일
 *   기준이 아니고, 채혈이 출국 30일 전이면 1차는 44일 전이 될 수도 있다. 출국일 창으로
 *   막으면 규정대로 준비한 케이스를 거부한다(PARASITE_DEPARTURE_WINDOWS 의 NZ 주석과 같은
 *   이유).
 */
export const EXTERNAL_PARASITE_START_WINDOWS: Record<string, { dog: number; cat: number }> = {
  australia: { dog: 30, cat: 21 },
}

/**
 * 외부 기생충 처치일 **저장 거부** — 두 가지(2026-07-28 사용자 확정).
 *
 *   ① 처치일이 출국일보다 늦음 — 논리적 불가능. **모든 목적지** 공통.
 *   ② 1차 처치가 출국 N일 전보다 늦게 시작 — 호주만(EXTERNAL_PARASITE_START_WINDOWS).
 *      판정 대상은 **가장 이른 처치일**이라 뒤에 추가하는 2차·3차는 이 하한과 무관하다.
 *
 * ⛔ 처치 간격·마지막 처치→출국 간격은 **검증하지 않는다**(2026-07-28 사용자 확정).
 *   DAFF 기준이 "제조사 지침대로"라 제품마다 다르고, 앱은 제품별 재적용 간격표가 없다.
 *   30일(개)·21일(개월 아님) 같은 임의 근사로 판정하면 규정대로 준비한 케이스를 잘못 잡거나
 *   (프론트라인 진드기 14일) 반대로 끊긴 걸 통과시킨다. 근거 없는 판정은 넣지 않는다.
 *   ⚠️ 뉴질랜드의 '마지막 처치는 출국 16일 이내'는 다르다 — IHS 2.2(2) 명문 규정이라 유지한다.
 *
 * client(getSaveBlockError)·procedure-check(au.external-parasite-protocol-…) 공용 단일 출처.
 * 출국일이 비면 통과.
 */
export function validateExternalParasiteDates(
  treatDates: string[],
  departureDate: string,
  destinationKey: string | null | undefined,
  speciesRaw: string | null | undefined,
): string | null {
  const dep = (departureDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dep)) return null
  const all = treatDates
    .map((d) => (d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (all.some((d) => d > dep)) {
    return '외부 기생충 치료일이 출국일보다 늦어요. 날짜를 확인하세요.'
  }
  const table = destinationKey ? EXTERNAL_PARASITE_START_WINDOWS[destinationKey] : undefined
  if (!table) return null
  const raw = (speciesRaw ?? '').toLowerCase()
  const minDays =
    raw === 'dog' || raw === '강아지' || raw === '개'
      ? table.dog
      : raw === 'cat' || raw === '고양이'
        ? table.cat
        : null
  if (minDays === null) return null
  const dates = [...all].sort()
  if (dates.length === 0) return null
  const gap = daysBetween(dates[0], dep)
  if (gap !== null && gap < minDays) {
    return `외부 기생충 치료는 출국 ${minDays}일 전에 시작해야 해요.`
  }
  return null
}

/**
 * 마이크로칩 인증은 **광견병 항체 채혈보다 앞서야** 한다 — 호주·뉴질랜드 공용.
 *
 * 호주 DAFF 3.2 — "Do this before having blood taken for the Rabies Neutralising Antibody
 * Titre test (RNATT). An identity check cannot be done at the same vet visit as the RNATT."
 * 원문은 '같은 **진료**에서 불가'이지 '같은 날 불가'가 아니다(2026-07-27 사용자 확인) —
 * 오전에 검역본부에서 인증, 오후에 동물병원에서 채혈은 가능하므로 **같은 날은 통과**시킨다.
 * 어기면 계류가 최소 10일 → 30일로 늘어난다(3.2 는 선택 절차지만 그게 단축 조건이다).
 *
 * 뉴질랜드 IHS 1.11(4) — 같은 순서 요건이고 **같은 날을 명시 허용**한다("The blood sample
 * for the RNATT can be taken on the same day as the microchip scan"). 판정식이 같아 함수를
 * 공유한다(2026-07-28 사용자 '호주 방식으로 통일' 결정). 다만 뉴질랜드는 이 절차가 **필수**라
 * 어기면 계류 연장이 아니라 수입 허가 자체가 나오지 않는다.
 *
 * client(저장 거부)·procedure-check(au/nz.identity-check-before-titer) 공용 단일 출처.
 * 한쪽이 비면 통과 — 인증을 먼저 하고 채혈을 나중에 넣는 정상 순서를 막지 않기 위해.
 */
/**
 * 마이크로칩 인증은 **칩 시술 이후**여야 한다 — 호주·뉴질랜드 공용.
 *
 * 검역관이 확인하는 대상이 칩이므로 칩보다 앞선 인증일은 성립하지 않는다(논리적 불가능 →
 * 저장 거부). 광견병 접종의 validateMicrochipBeforeBooster 와 같은 자리다. 칩 시술일은 이미
 * 지나간 사실이라 조치 가능한 쪽(인증일)으로 안내한다. 한쪽이 비면 통과.
 */
export function validateIdentityCheckAfterMicrochip(
  microchipDate: string,
  idDate: string,
): string | null {
  const chip = (microchipDate ?? '').slice(0, 10)
  const id = (idDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chip) || !/^\d{4}-\d{2}-\d{2}$/.test(id)) return null
  if (chip > id) return '마이크로칩 삽입 후 인증을 받으세요.'
  return null
}

/**
 * 마이크로칩 인증 2차는 1차 이후여야 한다 — 뉴질랜드 전용(회차가 둘인 곳은 여기뿐).
 *
 * 광견병 접종 회차 순서(rabiesChainBreakMessage 'too-early')와 같은 성격이라 문형도 맞춘다.
 * 한쪽이 비면 통과 — 2차 없이 1차만 있는 케이스(1회 인증)가 정상이다.
 */
export function validateIdentityCheckOrder(first: string, second: string): string | null {
  const a = (first ?? '').slice(0, 10)
  const b = (second ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  if (b < a) return '2차 인증일이 1차 인증일보다 빨라요. 날짜를 확인하세요.'
  return null
}

/**
 * 뉴질랜드 광견병 증명서(RCF) 발급일은 **채혈 이후**여야 한다.
 *
 * RCF 는 항체 검사 결과를 옮겨 적는 서식이라(지원문서 Documentation — RCF 가 채혈일과 RNATT
 * 결과를 증명한다) 채혈보다 먼저 발급될 수 없다. 논리적 불가능 → 저장 거부.
 * client(발급일 입력 차단)·procedure-check(nz.rcf-order) 공용 단일 출처.
 * 채혈이 여러 건이면 **가장 이른** 채혈보다 앞선 발급만 막는다(어느 회차를 근거로 발급했는지
 * 앱이 모르므로 확정 위반만 잡는다 — 호주 선언서 룰과 같은 기준).
 */
/**
 * 광견병 증명서(뉴질랜드 RCF · 호주 RNATT 선언서)는 **항체 검사 기록이 있어야** 발급된다.
 *
 * 두 서류 모두 항체 결과를 옮겨 적는 서식이라 채혈 없이 존재할 수 없다. 카드가 버튼 완료라
 * 날짜 크기 비교는 못 하지만(저장값이 버튼 누른 날), '채혈 기록이 있는가'는 판정할 수 있다.
 * 완료 버튼이 저장 검증을 타지 않아 채혈 전에도 완료되던 구멍을 막는다(2026-07-29 사용자 지적).
 * client·server(updateSimpleDateField)·procedure-check(nz.rcf-order·au.rnatt-declaration-order)
 * 공용 단일 출처.
 */
export function validateRabiesDocRequiresTiter(
  docDate: string,
  titerDates: string[],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test((docDate ?? '').slice(0, 10))) return null
  const hasTiter = titerDates.some((d) => /^\d{4}-\d{2}-\d{2}$/.test((d ?? '').slice(0, 10)))
  return hasTiter ? null : '광견병 항체 검사 채혈일을 입력하세요.'
}

export function validateNzRcfDate(rcfDate: string, titerDates: string[]): string | null {
  const rcf = (rcfDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rcf)) return null
  const dates = titerDates
    .map((d) => (d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (dates.length === 0) return null
  const earliest = dates.reduce((m, d) => (d < m ? d : m))
  if (rcf < earliest) {
    return '광견병 증명서(RCF)는 항체 검사 결과를 근거로 발급돼요. 채혈일보다 빠를 수 없어요.'
  }
  return null
}

/**
 * 뉴질랜드 계류 시작일 ↔ 항체 채혈일 간격 — 인증 횟수까지 함께 본다(2026-07-29 사용자 확정).
 *
 * IHS 2.1.3(3) 의 채혈 창(출국 3~12개월 전)과 1.11(4) 의 인증 횟수 분기를 하나로 합친 판정이다.
 *   · 3개월 미만  → 규정 위반 **확정**. 계류 시작일은 도착일이고 도착은 출국 이후라, 도착
 *     기준으로 3개월이 안 되면 출국 기준으로는 더 짧다.
 *   · 3~6개월     → 규정상 합법이지만 **인증을 2회** 받아야 하는 구간(1.11(4)). 2차 인증일이
 *     없으면 거부하고 그걸 넣게 안내한다.
 *   · 6개월 이상  → 인증 1회로 충분.
 * 채혈이 여러 건이면 **하나라도** 통과시키는 것이 있으면 통과(nz.titer-3to12months 와 같은 방식).
 *
 * 상한(12개월)은 여기서 보지 않는다 — 도착이 12개월을 넘겼다고 출국도 넘겼다고 단정할 수
 * 없어 확정 위반이 아니다. 그쪽은 항공권 카드의 주의가 담당한다.
 */
export function validateNzQuarantineStartAfterTiter(
  titerDates: string[],
  startDate: string,
  hasSecondIdentityCheck: boolean,
): string | null {
  const start = (startDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const dates = titerDates
    .map((d) => (d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (dates.length === 0) return null

  let inThreeToSix = false
  for (const t of dates) {
    const six = addMonths(t, 6)
    if (six && start >= six) return null
    const three = addMonths(t, 3)
    if (three && start >= three) {
      if (hasSecondIdentityCheck) return null
      inThreeToSix = true
    }
  }
  return inThreeToSix
    ? '항체 검사 채혈 후 6개월 안에 입국하려면 마이크로칩 인증을 두 번 받아야 해요. 2차 인증일을 입력하세요.'
    : '계류 시작일은 항체 검사 채혈일로부터 3개월이 지난 후여야 해요. 날짜를 확인하세요.'
}

/**
 * 채혈은 마이크로칩 인증 이후여야 한다(같은 날 허용) — 인증 카드 차단의 **반대 방향**.
 *
 * 인증 카드는 '인증일 > 채혈일'을 막지만, 항체 카드에서 채혈일을 인증보다 앞으로 고치는 건
 * 막지 않아 같은 위반이 한쪽으로만 걸렸다(2026-07-29 사용자 지적). 양쪽을 대칭으로 막는다.
 *
 * `required` — 인증일이 **비어 있는 것도 거부**한다. 뉴질랜드는 인증이 필수 절차라(빠지면
 * 수입 허가가 나오지 않는다) 인증 없는 채혈은 무효다. 중국 항체 카드가 2차 접종일을 먼저
 * 넣게 하는 것과 같은 패턴. ⛔ 호주에는 쓰지 말 것 — 호주 인증은 **선택 절차**(안 받으면
 * 계류가 10일 → 30일로 늘 뿐)라 인증 없는 채혈도 정상 경로다.
 */
export function validateTiterAfterIdentityCheck(
  idDate: string,
  titerDate: string,
  opts?: { required?: boolean },
): string | null {
  const t = (titerDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const id = (idDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) {
    return opts?.required ? '마이크로칩 인증일을 입력하세요.' : null
  }
  if (t < id) return '채혈일은 마이크로칩 인증일 이후여야 해요. 날짜를 확인하세요.'
  return null
}

export function validateIdentityCheckBeforeTiter(
  idDate: string,
  titerDates: string[],
): string | null {
  const id = (idDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null
  const dates = titerDates
    .map((d) => (d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  if (dates.length === 0) return null
  if (id > dates[0]) {
    return '마이크로칩 인증은 광견병 항체 검사 채혈 전에 받아야 해요. 날짜를 확인하세요.'
  }
  return null
}

/** 호주 내부구충 프로토콜 일수 — DAFF 7.7 명문. */
export const AU_INTERNAL_PARASITE = { windowDays: 45, minGapDays: 14, secondWithinDays: 5 }

/**
 * 호주 내부구충 2회 프로토콜 저장 거부 — **2회가 다 들어왔을 때만** 본다(2026-07-28 확정).
 *
 *   ① 두 치료 간격 ≥ 14일 — DAFF 7.7 "spaced at least 14 days apart"
 *   ② 2차는 출국 5일 이내 — "The second treatment must be given within 5 days before export"
 *
 * ⛔ '45일 이내'·'출국일보다 늦음'은 여기서 보지 않는다 — 이미
 *   validateParasiteDateForDestination(PARASITE_DEPARTURE_WINDOWS.australia, kinds:['internal'])
 *   이 같은 저장 거부 자리에서 막고 있다. 두 번 막으면 문구만 갈린다.
 * ⛔ '2회 받아야 해요'도 저장 거부가 아니다 — 1회씩 입력하는 카드라 1차 저장을 막게 된다.
 *   그건 주의(au.internal-parasite-protocol)가 담당한다.
 *
 * 외부구충과 달리 일수가 전부 규정 명문이라 저장 거부로 올릴 근거가 있다(외부는 "제조사
 * 지침대로"라 간격 판정 자체를 제거했다 — validateExternalParasiteDates 주석 참고).
 *
 * **뉴질랜드도 같은 함수를 쓴다**(2026-07-29 사용자 지정) — IHS 2.3(1)의 간격 14일·2차 5일이
 * DAFF 7.7 과 값이 같다. 창만 다르고(호주 45일 / 뉴질랜드 30일) 그건 위 dispatch 가 본다.
 * 그래서 이름에서 Au 를 뗐다.
 *
 * client(getSaveBlockError)·procedure-check(au/nz.internal-parasite-protocol) 공용 단일 출처.
 */
export function validateInternalParasiteSpacing(
  treatDates: string[],
  departureDate: string,
): string | null {
  const dep = (departureDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dep)) return null
  const dates = treatDates
    .map((d) => (d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  if (dates.length < 2) return null
  const dose1 = dates[dates.length - 2]
  const dose2 = dates[dates.length - 1]
  const gap = daysBetween(dose1, dose2)
  if (gap !== null && gap < AU_INTERNAL_PARASITE.minGapDays) {
    return `두 번의 치료는 최소 ${AU_INTERNAL_PARASITE.minGapDays}일 이상 간격을 두고 해야 해요.`
  }
  const toDep = daysBetween(dose2, dep)
  if (toDep !== null && toDep > AU_INTERNAL_PARASITE.secondWithinDays) {
    return `2차 치료는 출국 전 ${AU_INTERNAL_PARASITE.secondWithinDays}일 이내에 해야 해요.`
  }
  return null
}

/**
 * 전염병 검사 채혈 창 — 출국일 앵커. 목적지별 일수 단일 출처.
 *
 * ⛔ 남아공(south_africa, 29일)은 넣지 않는다 — 펫무브워크 전용 목적지라 앱 카드가 없고,
 *   za.infectious-disease-within-29days 가 자체 문구(날짜 보간 포함)로 담당한다.
 *   앱에 올릴 때 여기 한 줄 추가하면 저장 거부·주의가 함께 붙는다.
 */
export const INFECTIOUS_TEST_DEPARTURE_WINDOWS: Record<string, number> = {
  australia: 45,
  new_zealand: 30,
}

/**
 * 전염병 검사일 저장 거부 — 두 가지를 막는다(2026-07-28 사용자 확정).
 *
 *   ① 출국일보다 늦은 검사 — 논리적 불가능.
 *   ② 창(호주 45일·뉴질랜드 30일)보다 이른 검사 — 규정상 무효라 다시 받아야 한다.
 *
 * ②를 저장 거부로 올린 이유 — 처음엔 '출국일을 나중에 당기면 유효해질 수 있으니 주의로
 * 두자'로 갔지만, 실무 순서가 반대다. 항공권(출국일)이 먼저 정해지고 그 뒤 D-45 창이 열려야
 * 검사를 받는다. 창보다 이른 날짜가 들어왔다는 건 검사를 헛되이 받았거나 출국일이 틀렸다는
 * 뜻이라, 저장을 막아 그 자리에서 드러내는 편이 낫다.
 *
 * client(getSaveBlockError)·procedure-check(au/nz.infectious-disease-test-…) 공용 단일 출처.
 * 날짜 한쪽이 비거나 창이 없는 목적지면 통과.
 */
export function validateInfectiousDiseaseTestDate(
  testDate: string,
  departureDate: string,
  destinationKey?: string | null,
): string | null {
  if (!testDate || !departureDate) return null
  const t = testDate.slice(0, 10)
  const d = departureDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (t > d) return '전염병 검사일이 출국일보다 늦어요. 날짜를 확인하세요.'
  const maxGap = destinationKey ? INFECTIOUS_TEST_DEPARTURE_WINDOWS[destinationKey] : undefined
  if (maxGap === undefined) return null
  const gap = daysBetween(t, d)
  if (gap !== null && gap > maxGap) {
    return `전염병 검사는 출국 ${maxGap}일 이내에 받아야 해요. 다시 검사받아야 할 수 있어요.`
  }
  return null
}

/**
 * 촌충(에키노코쿠스) 구충 — 입국 `1~maxDays`일 전 사이에 받아야 함. EU echinococcus-free
 * 국(영국·아일랜드·몰타·노르웨이·핀란드)은 입국 직전 24~120시간(1~5일)에만 유효한 절차라, 그
 * 밖(너무 이르거나 늦음)의 구충은 의미가 없어 입력불가로 막는다. maxDays 는 앱별로 다름 —
 * 펫무브앱(portal)=5(법적 상한), 펫무브워크(admin)는 별도 1~3일 주의(eu.tapeworm-1to3days)를
 * 그대로 유지(portal 에선 그 주의를 숨김). 처치·기준일 한쪽 비면 통과.
 *
 * anchorDate 는 호출 측이 입국일(entry_date) 있으면 그 값, 없으면 출국일(departure_date)로
 * 대체해서 넘긴다(2026-07-16) — anchorLabel 도 그에 맞춰 '입국'/'출국'으로 같이 넘길 것.
 */
export function validateEchinococcusWindow(
  treatmentDate: string,
  anchorDate: string,
  maxDays: number,
  anchorLabel: '입국' | '출국' = '입국',
): string | null {
  if (!treatmentDate || !anchorDate) return null
  const days = daysBetween(treatmentDate, anchorDate)
  if (days === null) return null
  if (days < 1 || days > maxDays) {
    return `촌충 치료는 ${anchorLabel} 전 1~${maxDays}일 사이에 받아야 해요.`
  }
  return null
}

/** 일본 수출검역 예약일: 일본 입국일 ≤ 예약일 ≤ 귀국일. */
export function validateJpExportReservationDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '수출 검역 예약일은 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.'
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return '수출 검역 예약일은 일본 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  return null
}

/** 한국 수출검역일: 임상검사일 ≤ 검역일 ≤ 출국일, 출국일 기준 윈도우 이내. */
export function validateKrExportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const vet = readDate(ctx.data, 'vet_visit_date')
  if (vet && v < vet) return `한국 수출 검역은 출국 전 임상검사 후 받을 수 있어요.`
  const depart = departFromData(ctx.data)
  if (depart) {
    if (v > depart) return '한국 수출 검역일은 출국일보다 늦을 수 없어요. 날짜를 확인하세요.'
    const windowDays = getVetVisitWindowDays(ctx.destination, readSpecies(ctx.data))
    if (daysBetween(v, depart) >= windowDays) {
      return `한국 수출 검역일은 출국일 기준 ${windowDays}일 이내여야 해요.`
    }
  }
  return null
}

/** 일본 수입검역일: 일본 입국(출국 항공편)보다 빠를 수 없음. 도착 이후(당일 포함)는 제한 없음. */
export function validateJpImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = departFromData(ctx.data)
  if (!entry) return null
  // 일본 도착(출국 항공편) 전에는 받을 수 없음. 도착 이후 날짜는 입력 허용(상한 없음).
  if (v < entry) return '일본 수입 검역일은 일본 입국일보다 빠를 수 없어요.'
  return null
}

/** 한국 수입검역일: 한국 입국(귀국 항공편)보다 빠를 수 없음. 도착 이후(당일 포함)는 제한 없음. */
export function validateKrImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (!ret) return null
  // 한국 도착(귀국 항공편) 전에는 받을 수 없음. 도착 이후 날짜는 입력 허용(상한 없음).
  if (v < ret) return '한국 수입 검역일은 입국일보다 빠를 수 없어요.'
  return null
}

/**
 * 나라별 도착(수입) 검역일: 그 나라 입국일(entry_date)보다 빠를 수 없음. 도착 이후는 제한 없음.
 * 'quarantine:<나라>_import_quarantine_date' step(태국·필리핀·EU 등, 일본 외)의 입력 차단용 —
 * 일본은 entry_date 미사용이라 validateJpImportDate(출국 항공편 기준)를 따로 쓴다.
 */
export function validateImportQuarantineDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return '수입 검역일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  return null
}

/**
 * 출국 전 임상검사일: 출국일(앞 단계) 이전·목적지별 윈도우 이내. **자기 기준(출국일)으로만** 검증.
 *
 * 한국 수출검역일과의 관계(임상검사 ≤ 수출검역)는 여기서 보지 않는다 — 그 제약은 의존하는 쪽인
 * 한국 수출검역 step(validateKrExportDate, 검역일 ≥ 임상검사일)에서만 표면화한다. 내원일이 뒤
 * 단계(수출검역)를 참조하면, 항공편을 옮겨 내원일을 새 출국일에 맞추려 할 때 옛 수출검역일 때문에
 * 역행 '주의'/차단이 떠 수정이 막힌다. 내원일은 앞만 보고, 수출검역이 내원일에 맞춰 따라온다.
 */
export function validateVetVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const dep = ctx.departureDate ? ctx.departureDate.slice(0, 10) : ''
  if (dep && /^\d{4}-\d{2}-\d{2}$/.test(dep)) {
    if (v > dep) return '입력한 날짜가 출국일보다 늦어요. 출국 전 임상검사는 출국 전에 받아야 해요.'
    const windowDays = getVetVisitWindowDays(ctx.destination, readSpecies(ctx.data))
    if (daysBetween(v, dep) >= windowDays) {
      return `출국 전 임상검사는 출국일 기준 ${windowDays}일 이내에 받아야 해요.`
    }
  }
  return null
}

// ── 광견병 1·2차 관계 검증 (날짜만 받는 순수 함수 — client 입력 차단·procedure-check 공용) ──

/**
 * 광견병 1·2차 접종 간격 — 2차는 1차 접종일로부터 30일 이후여야 함.
 *
 * 단일 출처: 펫무브 client(2차 입력 시 입력 불가) + procedure-check(1차 수정 후 2차 step '주의')
 * 가 같은 함수를 호출한다. 순서 위반(2차 < 1차)과 간격 부족(< 30일)은 모두 같은 요건
 * (2차 ≥ 1차 + 30일) 위반이므로 같은 문구 하나로 안내한다(주의 문구는 날짜 없이 담백한
 * 설명문 — 통일 정책). 어느 한쪽 날짜가 비면 비교 불가라 null(통과).
 */
export function validateRabiesInterval(
  primeDate: string,
  boosterDate: string,
  minDays = 30,
): string | null {
  if (!primeDate || !boosterDate) return null
  const gap = daysBetween(primeDate, boosterDate)
  if (gap >= minDays) return null
  return `2차 광견병 접종은 1차 접종일로부터 ${minDays}일이 지난 후에 해야 해요.`
}

/**
 * 목적지의 1→2차 광견병 간격 최소일 — 프로파일 doseIntervalDays 파생(미선언·'soft'=30 디폴트).
 * validateRabiesInterval 저장 거부와 그 나라 간격 주의 룰이 같은 값을 공유하게 하는 출처.
 * (하와이 31 = HDOA "more than 30 days apart" ≥31. 일본 등 미선언 = 30.)
 */
export function rabiesIntervalMinDays(destinationKey: string | null | undefined): number {
  for (const key of Object.keys(DESTINATION_OVERRIDES)) {
    if (!matchesDestinationKey(destinationKey, key)) continue
    const v = DESTINATION_OVERRIDES[key]?.rabies?.doseIntervalDays
    return typeof v === 'number' ? v : 30
  }
  return 30
}

/**
 * 광견병 저장 배열을 시간순으로 정규화 — "index 0 = 가장 이른 접종 = 1차" 불변식을
 * **write 시점**에 보장한다. (reader 정렬은 금지 — procedure-checks/utils.ts readRabiesEntries
 * 주석 참고. 폼의 1차 칸 = index 0 매핑이 어긋나는 버그를 막기 위해 reader 는 raw 순서를 쓴다.)
 *
 * 펫무브(portal)는 클라이언트 입력 차단(validateRabiesInterval)으로 이 순서를 보장하지만,
 * 펫무브워크(admin)의 카드형 편집기·AI 추출은 비순차 배열을 만들 수 있다. 이 함수를 admin
 * 저장 직전에 호출해 동일 불변식을 admin 에서도 맞춘다.
 *
 * **모든 항목이 유효 date(YYYY-MM-DD, ≥10자)일 때만** 안정 정렬한다. 빈/phantom date 가
 * 하나라도 있으면 원본을 그대로 반환 — portal 의 고정 슬롯(index=차수)·sparse 패딩 의미를
 * 건드리지 않기 위함(= portal 이 만든 배열에는 절대 개입하지 않음을 보장). 동일 날짜는
 * 입력 순서를 보존한다.
 */
export function normalizeRabiesOrder<T extends { date?: string | null }>(records: T[]): T[] {
  const allDated = records.every(
    (r) => typeof r.date === 'string' && r.date.length >= 10,
  )
  if (!allDated) return records
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date as string).localeCompare(b.r.date as string) || a.i - b.i)
    .map((x) => x.r)
}

/**
 * 광견병 1차 접종은 생후 minDays(일본 91일) 이후여야 함. client(1차 입력 시 입력 불가)·
 * procedure-check(출생일·1차 수정 후 주의) 공용. minDays 는 목적지별로 다를 수 있어 인자(기본 91,
 * 예: EU 84). 출생일·접종일 한쪽이 비면 통과.
 */
export function validateRabiesPrimeAge(
  birthDate: string,
  primeDate: string,
  minDays = 91,
  minMonths?: number,
): string | null {
  if (!birthDate || !primeDate) return null
  // 달력 개월 기준(베트남 "at least 3 months of age") — 지정되면 일수 대신 이걸 쓴다.
  // 일수로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다(meetsCalendarAge 주석).
  if (minMonths != null) {
    return meetsCalendarAge(birthDate, primeDate, minMonths)
      ? null
      : `광견병 접종은 생후 ${minMonths}개월이 지나서 할 수 있어요.`
  }
  const age = daysBetween(birthDate, primeDate)
  if (age < minDays) {
    return `광견병 접종은 생후 ${minDays}일(${Math.round(minDays / 7)}주)이 지나서 할 수 있어요.`
  }
  return null
}

/**
 * 광견병 1차 최소 연령 — **목적지 프로파일 파생판**. rabies.minAgeDays/minAgeMonths
 * (destination-config, 근거 주석도 그쪽)를 읽어 validateRabiesPrimeAge 에 넘긴다.
 *
 * client 입력 차단은 카탈로그 earliest(birth anchor — buildRabiesCard 가 같은 선언에서
 * 파생)를 거쳐 이미 이 값을 쓰므로, 주의 룰이 이 함수를 쓰면 두 층의 기준이 항상 일치한다.
 * 구 evaluateRabiesAgeConservative(91일 AND 캘린더 3개월)를 8개국에 무차별 적용하던 것을
 * 나라별 확정값으로 정확화(2026-07-25 ③) — 달력 3개월 국가에서 규정대로 3개월에 접종한
 * 2월생(89일)을 막는 과잉, 84일국(우크라이나·이스라엘)에서 91일을 요구하는 과잉이 있었다.
 * 미선언 목적지는 기본 91일(OIE 표준).
 */
export function validateRabiesPrimeAgeForDestination(
  birthDate: string,
  primeDate: string,
  destinationKey: string,
): string | null {
  const p = DESTINATION_OVERRIDES[destinationKey]?.rabies
  return validateRabiesPrimeAge(birthDate, primeDate, p?.minAgeDays ?? 91, p?.minAgeMonths)
}

/**
 * 생년월일 + N개월(달력) 이 되었는가 — 입력 차단·주의·안내 **세 층이 공유하는 단일 판정**.
 *
 * 달력 기준이라 생월에 따라 실제 일수가 89~92일로 달라진다. 일수 고정 기준(91일)으로 바꾸면
 * 11·12·1·2월생이 규정대로 3개월에 접종해도 막힌다(예: 2월 1일생 → 5월 1일 접종 = 89일).
 * 규정 문구가 "3 months of age"인 목적지는 반드시 이 함수를 쓴다.
 *
 * 층마다 따로 계산하면 기준이 어긋나므로(대만 titer 사고와 같은 부류) 여기 하나만 둔다.
 */
export function meetsCalendarAge(birthDate: string, targetDate: string, months: number): boolean {
  if (!birthDate || !targetDate) return true
  const threshold = addMonths(birthDate, months)
  return !!threshold && targetDate >= threshold
}

/** 생년월일 + N개월(달력) 임계일 — 메시지·안내에 노출할 날짜. */
export function calendarAgeThreshold(birthDate: string, months: number): string {
  return birthDate ? addMonths(birthDate, months) : ''
}

/**
 * 마이크로칩은 2차 광견병 백신 접종일 이전에 삽입되어야 함 (칩 > 2차면 위반). client(2차 입력 시
 * 입력 불가)·jp.microchip-rabies-sequence(주의) 공용. 마이크로칩은 과거 사실이라 조치 가능한
 * 쪽(접종일)으로 안내. 한쪽이 비면 통과.
 */
export function validateMicrochipBeforeBooster(
  microchipDate: string,
  secondDate: string,
  /** 백신명 — 메시지에 들어감. 광견병 기본, 종합백신 등은 호출 시 지정. */
  vaccineLabel = '광견병',
): string | null {
  if (!microchipDate || !secondDate) return null
  if (microchipDate > secondDate) {
    return `마이크로칩 삽입 후 ${vaccineLabel}을 접종하세요.`
  }
  return null
}

// 광견병 2차가 1차 면역 유효기간 이내인지(과거 validateRabiesBoosterValidity)는 부스터 chain
// 검증으로 통합 — findRabiesChainBreak(rabies-chain.ts)가 1차→2차→3차… 전체를 순차 검사한다.
// client(rabies2/extra 입력 불가)·procedure-check(jp.rabies-booster/extra-validity 주의) 공용.

/**
 * 일본 사전 신고(NACCS) 마감 — 신청일은 입국일 40일 이전이어야 함.
 * client(신청 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateAdvanceNotification(notifDate: string, entryDate: string): string | null {
  if (!notifDate || !entryDate) return null
  if (daysBetween(notifDate, entryDate) < 40) {
    return '일본 입국 40일 전까지 신고를 해야 해요. 신고가 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/**
 * 광견병 부스터 chain 의 면역 최종 만료일. 2차(boosters[0])부터 시작해 매 부스터가 직전
 * 만료일 이내면 chain 연장, 끊기면 멈춤. valid_until 은 "N년"·날짜 어느 형식이든
 * resolveValidUntil 로 환산. boosters = 2차부터의 [{date, valid_until}] (입력 순서). 비면 ''.
 */
export function rabiesBoosterChainEnd(
  boosters: Array<{ date: string; valid_until?: string | null }>,
): string {
  if (boosters.length === 0 || !boosters[0].date) return ''
  let chainEnd = resolveValidUntil(boosters[0].date, boosters[0].valid_until)
  for (let i = 1; i < boosters.length; i++) {
    if (boosters[i].date && boosters[i].date <= chainEnd) {
      chainEnd = resolveValidUntil(boosters[i].date, boosters[i].valid_until)
    } else break
  }
  return chainEnd
}

/**
 * 채혈일이 부스터 chain 면역 유효기간 이내인지 (규칙 B). 마지막 유효일 당일까지 유효.
 * client(채혈 입력 시 입력 불가)·procedure-check(부스터 수정 후 주의) 공용. 채혈 미입력 시 통과.
 */
export function validateTiterWithinChain(
  boosters: Array<{ date: string; valid_until?: string | null }>,
  titerDate: string,
): string | null {
  if (!titerDate) return null
  const chainEnd = rabiesBoosterChainEnd(boosters)
  if (chainEnd && titerDate > chainEnd) {
    return '채혈일이 광견병 백신 면역 유효기간을 벗어났어요. 날짜를 확인하세요.'
  }
  return null
}

/**
 * 채혈일은 광견병 백신(1·2차 중 늦은 날) 접종 이후여야 함 (규칙 A). primaryDates = 1·2차 날짜.
 * client(채혈 입력 시 입력 불가)·common.rabies-titer-chain-consistent(2차 수정 후 주의) 공용.
 * 1·2차 모두 미입력이면 통과(누락은 별도 체크).
 */
export function validateTiterAfterBooster(
  primaryDates: string[],
  titerDate: string,
  /**
   * 2회 접종국(일본·중국)인지 — 메시지를 '2차 접종 후에 받아야 해요'로 구체화한다.
   * 1회국은 접종이 하나뿐이라 기존 문구가 정확하다.
   */
  twoDose = false,
): string | null {
  if (!titerDate) return null
  const valid = primaryDates.filter((d) => d && d.length >= 10)
  if (valid.length === 0) return null
  const latest = valid.reduce((m, d) => (d > m ? d : m))
  if (titerDate < latest) {
    // 접종이 2개 이상 있을 때만 '2차' 표현을 쓴다 — 1차만 입력된 상태면 어차피 1차 기준이라
    // '2차 접종 후'라고 하면 없는 접종을 가리키게 된다.
    return msgTiterBeforeVaccine({ twoDose: twoDose && valid.length >= 2 })
  }
  return null
}

/**
 * caseRow → DateRuleContext (저장 액션·재검증 공통).
 *
 * destination(활성 목적지 토큰) 인자 동작:
 *   - 다중 목적지 케이스: 해당 destination 의 by_dest 값만 사용. top-level fallback X
 *     (다른 destination 의 값이 leak 되는 걸 방지 — 예: KZ tab 에서 CN 의 출국일이
 *     검증에 끼는 버그). 스코프 대상: vet_visit_date / departure_date / entry_date /
 *     departure_flight_date / return_date (validate 함수가 참조하는 모든 날짜 앵커).
 *   - 단일 목적지 케이스: 기존 동작(by_dest 우선 + top-level/column fallback).
 *   - destination 미지정: 기존 동작(top-level data / column).
 */
export function buildDateRuleContext(caseRow: CaseRow, destination?: string | null): DateRuleContext {
  const baseData = (caseRow.data ?? {}) as Record<string, unknown>
  if (destination) {
    const isMultiDest = parseDestinations(caseRow.destination).length > 1
    if (isMultiDest) {
      // validate 함수가 참조하는 destination-scoped 키를 by_dest 값으로 덮어쓴 view.
      // 키가 by_dest 에 없으면 undefined 로 덮어 top-level leak 차단.
      const SCOPED_DATA_KEYS = [
        'vet_visit_date',
        'entry_date',
        'departure_flight_date',
        'return_date',
      ]
      const overrides: Record<string, unknown> = {}
      for (const key of SCOPED_DATA_KEYS) {
        const v = readByDestValue(baseData, destination, key)
        overrides[key] = typeof v === 'string' && v ? v : undefined
      }
      const data = { ...baseData, ...overrides }
      const d = readByDestValue(baseData, destination, 'departure_date')
      const scopedDep = typeof d === 'string' && d ? d : null
      return {
        data,
        destination,
        departureDate: scopedDep,
      }
    }
    // 단일 목적지: by_dest 우선 + top-level/column fallback (기존 동작).
    const scopedVisit = getVetVisitDate(caseRow, destination)
    const scopedDep = getDepartureDate(caseRow, destination)
    const data = { ...baseData, vet_visit_date: scopedVisit ?? undefined }
    return {
      data,
      destination,
      departureDate: scopedDep,
    }
  }
  return {
    data: baseData,
    destination: caseRow.destination ?? null,
    departureDate: caseRow.departure_date ?? null,
  }
}

// 검역·검사 일정의 자기 검증은 procedure-check 룰로 이관 — common.*-date-valid /
// jp.*-date-valid 가 매 렌더마다 위 validate 함수들을 재실행해 어긋난 후행 일정을 '주의'로
// 표면화한다. server action 의 입력 차단도 같은 함수를 직접 호출 — 단일 출처.
