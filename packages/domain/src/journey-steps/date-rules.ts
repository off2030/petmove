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
import { addDays, addMonths, addYears, resolveValidUntil } from '../procedure-checks/utils'
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
      return `${label} 접종 후 21일이 지나야 태국에 입국할 수 있어요`
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
  const days = rabiesEntryWaitDays(ctx.destination)
  if (days <= 0) return null
  if (violatesRabiesEntryWait(ctx.data, v, ctx.destination)) {
    const ko = destinationKoLabel(resolveWaitDestinationKey(ctx.destination))
    return `광견병 접종 후 ${days}일이 지나야 ${ko}에 입국할 수 있어요. 날짜를 확인하세요.`
  }
  return null
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
    return '생후 120일(4개월)이 지나야 필리핀에 입국할 수 있어요'
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
    return `수입 허가증(SPSIC)은 발급일로부터 60일간 유효해요. 출국 60일 전 ${fmt(earliest)}부터 신청할 수 있어요.`
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
    return `수입 허가증은 발급일로부터 90일간 유효해요. 출국 90일 전 ${fmt(earliest)}부터 신청할 수 있어요.`
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
  titerDates.sort()

  // 일수 기반(정확한 N일) — 채혈 + N일 ≤ 입국일 만족 채혈이 하나라도 있으면 통과.
  if (daysKey) {
    const days = TITER_ENTRY_WAIT_DAYS[daysKey]
    const ok = titerDates.some((t) => {
      const earliest = addDays(t, days)
      return !!earliest && earliest <= v
    })
    if (ok) return null
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
 *  - 태국: 출발일(departure_date) — procedure-check 가 departure 를 보는 것과 같은 기준
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
    validateJpEntryDate(entry, ctx) ??
    validateThEntryDate(outbound, ctx) ??
    // 말레이시아·인도네시아는 전용 함수를 두지 않는다(2026-07-22 정리) — 말레이시아 30일은
    // 프로파일 entryWaitDaysAfterVaccine 파생(validateRabiesEntryWait)이 처리하고,
    // 인도네시아는 1차 출처에 대기 규정이 없어 대기 차단 자체가 없다.
    validatePhEntryDate(entryOrDeparture, ctx) ??
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
  ctx: { departureDate: string; entryDate: string; data: Record<string, unknown> },
): string | null {
  const { departureDate, entryDate, data } = ctx
  switch (destinationKey) {
    // 태국 — ①출국일 이후 신청 불가 ②백신 접종 14일(2주) 이내 신청 불가.
    case 'thailand':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateThImportPermitVaccineGap(filedDate, data)
      )
    // 말레이시아·인도네시아 — 수입허가를 **현지 에이전시가 신청**하는 모델이라(가이드)
    // 태국식 '백신 접종 14일 후 신청' 제약은 근거가 없어 2026-07-22 제거했다.
    // 남는 건 '출국일 이후엔 신청 불가'라는 논리적 제약뿐.
    case 'malaysia':
    case 'indonesia':
      return validateImportPermitNotAfterDeparture(filedDate, departureDate)
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
    // 대만 — 출국일 이후 신청 불가. 카드 order 가 43(항공권 45 앞)이라 항공권 미입력 시
    // departureDate 가 비어 통과한다. 120일·20일 마감은 주의 담당.
    case 'taiwan':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateTwImportPermitLeadTime(filedDate, departureDate, { subject: 'filed' })
      )
    // 아랍에미리트 — 출국일 이후 신청 불가 + MOCCAE 허가 90일 유효.
    case 'uae':
      return (
        validateImportPermitNotAfterDeparture(filedDate, departureDate) ??
        validateAeImportPermitWithin90Days(filedDate, departureDate)
      )
    // 스위스 — 입국 3주(21일) 이내 신청 불가.
    case 'switzerland':
      return validateChImportPermitDate(filedDate, entryDate)
    default:
      return null
  }
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

/** 일본 수출검역 검역일(방문): 일본 입국일 ≤ 검역일 ≤ 귀국일. */
export function validateJpExportVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return '일본 수출 검역일은 일본 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '일본 수출 검역일은 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.'
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
 * 나라별 현지 수출 검역일: 그 나라 입국일(entry_date) ≤ 검역일 ≤ 귀국일(return_date).
 * 'quarantine:<나라>_export_quarantine_date' step(태국·필리핀 등)의 입력 차단용.
 */
export function validateExportQuarantineDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return '수출 검역일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '수출 검역일은 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.'
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
export function validateRabiesInterval(primeDate: string, boosterDate: string): string | null {
  if (!primeDate || !boosterDate) return null
  const gap = daysBetween(primeDate, boosterDate)
  if (gap >= 30) return null
  return '2차 광견병 접종은 1차 접종일로부터 30일이 지난 후에 해야 해요.'
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
      : `광견병 접종은 생후 ${minMonths}개월이 지나서 할 수 있어요`
  }
  const age = daysBetween(birthDate, primeDate)
  if (age < minDays) {
    return `광견병 접종은 생후 ${minDays}일(${Math.round(minDays / 7)}주)이 지나서 할 수 있어요`
  }
  return null
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
    return `마이크로칩 삽입 후 ${vaccineLabel}을 접종하세요`
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
