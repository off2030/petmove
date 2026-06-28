import type { CaseRow } from '../types'
import { getVetVisitWindowDays, matchesDestinationKey, parseDestinations } from '../destination-config'
import { getDepartureDate, getVetVisitDate, readByDestValue } from '../destination-scoped-fields'
import { addDays, addMonths, resolveValidUntil } from '../procedure-checks/utils'
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
    return `광견병 항체 검사일(${fmt(latestTiter)})로부터 180일이 지난 ${fmt(earliest)} 이후에 일본 입국이 가능해요.`
  }
  return null
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
  return null
}

/**
 * EU 패밀리(EU·영국·아일랜드·몰타·노르웨이·핀란드·스위스) — destination-config 키.
 * procedure-checks/eu.ts 의 EU_REGIME 과 같은 목록 — eu.ts 가 이 파일을 import 하므로
 * (순환 방지) 여기 별도로 둔다. 목록 변경 시 양쪽 함께.
 * client(step-detail-view)도 destinationKey 분기에 사용 — export.
 */
export const EU_ENTRY_FAMILY = ['eu', 'uk', 'ireland', 'malta', 'norway', 'finland', 'switzerland']

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
 * EU 패밀리 — 항체 검사 채혈일은 직전 유효 광견병 접종으로부터 30일 이후여야 함.
 * 부스터 chain 이 끊기지 않았으면(직전 접종 면역 유효 중 추가 접종) 30일 시계는 chain 시작
 * 접종 기준 — 채혈 당일 부스터를 맞아도 리셋되지 않는다. (eu.titer-min-30days-after-vaccine
 * 과 동일 알고리즘 — client 채혈 입력 차단용 단일 함수.)
 *
 * doses = rabies_dates 형태의 [{date, valid_until}] (입력 순서 무관). 채혈·접종 한쪽 비면 통과.
 */
export function validateEuTiterAfterVaccine(
  doses: Array<{ date: string; valid_until?: string | null }>,
  titerDate: string,
): string | null {
  if (!titerDate) return null
  const prior = doses
    .filter((d) => typeof d.date === 'string' && d.date.length >= 10 && d.date <= titerDate)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (prior.length === 0) return null // 접종-채혈 순서 자체는 validateTiterAfterBooster 담당
  let chainStart = prior[prior.length - 1]
  for (let i = prior.length - 2; i >= 0; i--) {
    const earlier = prior[i]
    const validUntil = resolveValidUntil(earlier.date, earlier.valid_until)
    if (validUntil && validUntil >= chainStart.date) chainStart = earlier
    else break
  }
  if (daysBetween(chainStart.date, titerDate) < 30) {
    const earliest = addDays(chainStart.date, 30)
    return `광견병 항체 검사는 백신 접종일(${fmt(chainStart.date)})로부터 30일이 지난 후에 받을 수 있어요.${earliest ? ` ${fmt(earliest)} 이후로 입력하세요.` : ''}`
  }
  return null
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
    return `수입 허가증(SPSIC)은 발급일로부터 60일간 유효해요. 출국 60일 이내(${fmt(earliest)} 이후)에 신청하세요.`
  }
  return null
}

/**
 * EU 패밀리 입국일(= 출국 항공편 날짜) — 광견병 항체 검사 채혈일 + 3개월(캘린더) 미만 입국만
 * hard 차단. 일본 180일 룰과 같은 기준: 재검사해도 새 채혈일 + 3개월을 다시 기다려야 하므로
 * 회복 경로가 입국일 변경뿐. (EU Reg 576/2013 Art.12 — "at least three months")
 *
 * EU 패밀리 외 목적지·항체 검사 미입력 시 SKIP.
 */
export function validateEuEntryDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  if (!EU_ENTRY_FAMILY.some((key) => matchesDestinationKey(ctx.destination, key))) return null

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

  // 채혈 + 3개월 ≤ 입국일을 만족하는 채혈이 하나라도 있으면 통과 (eu.departure-min-3months 와 동일).
  titerDates.sort()
  const ok = titerDates.some((t) => {
    const earliest = addMonths(t, 3)
    return !!earliest && earliest <= v
  })
  if (ok) return null
  const earliestTiter = titerDates[0]
  const earliest = addMonths(earliestTiter, 3)
  return `광견병 항체 검사일(${fmt(earliestTiter)})로부터 3개월이 지난 ${earliest ? fmt(earliest) : ''} 이후에 입국이 가능해요.`
}

/**
 * 아일랜드 사전 통지일 — 입국일 24시간(1일) 전까지 제출해야 함.
 * client(통지 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateIeAdvanceNoticeDate(noticeDate: string, entryDate: string): string | null {
  if (!noticeDate || !entryDate) return null
  if (daysBetween(noticeDate, entryDate) < 1) {
    return '아일랜드 입국 24시간(1일) 전까지 사전 통지를 해야 해요. 통지가 늦은 경우 입국일을 변경해야 해요.'
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
    return '스위스 입국 3주(21일) 전까지 수입허가를 신청해야 해요. 신청이 늦은 경우 입국일을 변경해야 해요.'
  }
  return null
}

/** 일본 수출검역 예약일: 일본 입국일 ≤ 예약일 ≤ 귀국일. */
export function validateJpExportReservationDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '출국 검역 예약일은 귀국일보다 늦을 수 없어요.'
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `출국 검역 예약일은 일본 입국일(${fmt(entry)})보다 빠를 수 없어요.`
  return null
}

/** 일본 수출검역 검역일(방문): 일본 입국일 ≤ 검역일 ≤ 귀국일. */
export function validateJpExportVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `일본 출국 검역일은 일본 입국일(${fmt(entry)})보다 빠를 수 없어요.`
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return `일본 출국 검역일은 귀국일(${fmt(ret)})보다 늦을 수 없어요.`
  return null
}

/** 한국 수출검역일: 임상검사일 ≤ 검역일 ≤ 출국일, 출국일 기준 윈도우 이내. */
export function validateKrExportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const vet = readDate(ctx.data, 'vet_visit_date')
  if (vet && v < vet) return `한국 출국 검역은 출국 전 임상검사 후 받을 수 있어요.`
  const depart = departFromData(ctx.data)
  if (depart) {
    if (v > depart) return `한국 출국 검역일은 출국일(${fmt(depart)})보다 늦어요. 날짜를 확인하세요.`
    const windowDays = getVetVisitWindowDays(ctx.destination)
    if (daysBetween(v, depart) >= windowDays) {
      return `한국 출국 검역일은 출국일 기준 ${windowDays}일 이내여야 해요.`
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
  if (v < entry) return '일본 입국 검역일은 일본 입국일보다 빠를 수 없어요.'
  return null
}

/** 한국 수입검역일: 한국 입국(귀국 항공편)보다 빠를 수 없음. 도착 이후(당일 포함)는 제한 없음. */
export function validateKrImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (!ret) return null
  // 한국 도착(귀국 항공편) 전에는 받을 수 없음. 도착 이후 날짜는 입력 허용(상한 없음).
  if (v < ret) return '한국 입국 검역일은 입국일보다 빠를 수 없어요.'
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
  if (entry && v < entry) return '입국 검역일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  return null
}

/**
 * 나라별 현지 출국 검역일: 그 나라 입국일(entry_date) ≤ 검역일 ≤ 귀국일(return_date).
 * 'quarantine:<나라>_export_quarantine_date' step(태국·필리핀 등)의 입력 차단용.
 */
export function validateExportQuarantineDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return '출국 검역일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.'
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '출국 검역일은 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.'
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
    const windowDays = getVetVisitWindowDays(ctx.destination)
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
 * (2차 ≥ 1차 + 30일) 위반이므로, 어느 쪽이든 **실행 가능한 목표 날짜(1차 + 30일)** 를 안내한다.
 * 어느 한쪽 날짜가 비면 비교 불가라 null(통과).
 */
export function validateRabiesInterval(primeDate: string, boosterDate: string): string | null {
  if (!primeDate || !boosterDate) return null
  const gap = daysBetween(primeDate, boosterDate)
  if (gap >= 30) return null
  const earliest = addDays(primeDate, 30)
  return earliest
    ? `2차 광견병 접종은 1차 접종일(${fmt(primeDate)})로부터 30일 이후에 해야 해요. ${fmt(earliest)} 이후로 입력하세요.`
    : `2차 광견병 접종은 1차 접종일(${fmt(primeDate)})로부터 30일 이후에 해야 해요.`
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
): string | null {
  if (!birthDate || !primeDate) return null
  const age = daysBetween(birthDate, primeDate)
  if (age < minDays) {
    return `광견병 접종은 생후 ${minDays}일(${Math.round(minDays / 7)}주)이 지나서 할 수 있어요`
  }
  return null
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
export function validateTiterAfterBooster(primaryDates: string[], titerDate: string): string | null {
  if (!titerDate) return null
  const valid = primaryDates.filter((d) => d && d.length >= 10)
  if (valid.length === 0) return null
  const latest = valid.reduce((m, d) => (d > m ? d : m))
  if (titerDate < latest) {
    return '광견병 항체 검사일이 광견병 접종일보다 빨라요. 날짜를 확인하세요.'
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
