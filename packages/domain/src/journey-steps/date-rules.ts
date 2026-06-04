import type { CaseRow } from '../types'
import { getVetVisitWindowDays, matchesDestinationKey } from '../destination-config'
import { addDays, resolveValidUntil } from '../procedure-checks/utils'
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
 *  - 백신 유효기간 만료 → 재접종으로 회복 (jp.rabies-valid-until-on-departure)
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
    return `광견병 항체 검사일(${fmt(latestTiter)})로부터 180일이 지난 ${fmt(earliest)} 이후에 일본 입국이 가능합니다.`
  }
  return null
}

/** 일본 수출검역 예약일: 일본 입국일 ≤ 예약일 ≤ 귀국일. */
export function validateJpExportReservationDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return '수출 동물검역 예약일은 귀국일보다 늦을 수 없습니다.'
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `수출 동물검역 예약일은 일본 입국일(${fmt(entry)})보다 빠를 수 없습니다.`
  return null
}

/** 일본 수출검역 검역일(방문): 일본 입국일 ≤ 검역일 ≤ 귀국일. */
export function validateJpExportVisitDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const entry = readDate(ctx.data, 'entry_date')
  if (entry && v < entry) return `일본 수출 동물검역일은 일본 입국일(${fmt(entry)})보다 빠를 수 없습니다.`
  const ret = readDate(ctx.data, 'return_date')
  if (ret && v > ret) return `일본 수출 동물검역일은 귀국일(${fmt(ret)})보다 늦을 수 없습니다.`
  return null
}

/** 한국 수출검역일: 임상검사일 ≤ 검역일 ≤ 출국일, 출국일 기준 윈도우 이내. */
export function validateKrExportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const vet = readDate(ctx.data, 'vet_visit_date')
  if (vet && v < vet) return `한국 수출 동물검역은 출국 전 임상검사(${fmt(vet)}) 후에 받을 수 있습니다.`
  const depart = departFromData(ctx.data)
  if (depart) {
    if (v > depart) return `한국 수출 동물검역일은 출국일(${fmt(depart)})보다 늦을 수 없습니다.`
    const windowDays = getVetVisitWindowDays(ctx.destination)
    if (daysBetween(v, depart) >= windowDays) {
      return `한국 수출 동물검역일은 출국일 기준 ${windowDays}일 이내여야 합니다.`
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
  if (v < entry) return '일본 수입 동물검역일은 일본 입국일보다 빠를 수 없습니다.'
  return null
}

/** 한국 수입검역일: 한국 입국(귀국 항공편)보다 빠를 수 없음. 도착 이후(당일 포함)는 제한 없음. */
export function validateKrImportDate(v: string, ctx: DateRuleContext): string | null {
  if (!v) return null
  const ret = readDate(ctx.data, 'return_date')
  if (!ret) return null
  // 한국 도착(귀국 항공편) 전에는 받을 수 없음. 도착 이후 날짜는 입력 허용(상한 없음).
  if (v < ret) return '한국 수입 동물검역일은 입국일보다 빠를 수 없습니다.'
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
    if (v > dep) return '입력한 날짜가 출국일보다 늦습니다. 출국 전 임상검사는 출국 전에 받아야 합니다.'
    const windowDays = getVetVisitWindowDays(ctx.destination)
    if (daysBetween(v, dep) >= windowDays) {
      return `출국 전 임상검사는 출국일 기준 ${windowDays}일 이내에 받아야 합니다.`
    }
  }
  return null
}

// ── 광견병 1·2차 관계 검증 (날짜만 받는 순수 함수 — client 입력 차단·procedure-check 공용) ──

/**
 * 광견병 1·2차 접종 간격 — 2차는 1차 이후이고, 1차 + 30일 이상이어야 함.
 *
 * 단일 출처: 펫무브 client(2차 입력 시 입력 불가) + procedure-check(1차 수정 후 2차 step '주의')
 * 가 같은 함수를 호출한다. 순서 위반(2차 < 1차)과 간격 부족(< 30일)을 구분해 메시지를 낸다.
 * 어느 한쪽 날짜가 비면 비교 불가라 null(통과).
 */
export function validateRabiesInterval(primeDate: string, boosterDate: string): string | null {
  if (!primeDate || !boosterDate) return null
  const gap = daysBetween(primeDate, boosterDate)
  if (gap < 0) {
    return `광견병 2차 접종일이 1차 접종일(${fmt(primeDate)})보다 빠릅니다. 날짜를 확인해 주세요.`
  }
  if (gap < 30) {
    const earliest = addDays(primeDate, 30)
    return `1·2차 접종 간격은 30일 이상이어야 합니다. 현재 ${gap}일로, 2차 접종일은 ${earliest ? fmt(earliest) : ''} 이후여야 합니다.`
  }
  return null
}

/**
 * 광견병 2차가 1차 면역 유효기간 이내인지 — 유효기간 경과 후 접종은 부스터가 아닌 새 기초접종.
 *
 * primeValidUntilRaw 는 저장값 그대로("N년" 또는 'YYYY-MM-DD' 또는 빈값) — resolveValidUntil 이
 * 어느 형식이든 마지막 유효일로 환산한다(없으면 1년). client·procedure-check 공용 단일 출처.
 * 2차가 마지막 유효일 당일이면 유효(경계 포함). 어느 날짜든 비면 통과.
 */
export function validateRabiesBoosterValidity(
  primeDate: string,
  primeValidUntilRaw: string | null | undefined,
  boosterDate: string,
): string | null {
  if (!primeDate || !boosterDate) return null
  const validUntil = resolveValidUntil(primeDate, primeValidUntilRaw)
  if (validUntil && boosterDate > validUntil) {
    return '2차 광견병 백신은 1차 광견병 백신 면역 유효기간 안에 해야 합니다.'
  }
  return null
}

/**
 * 일본 사전 신고(NACCS) 마감 — 신청일은 입국일 40일 이전이어야 함.
 * client(신청 입력 시 입력 불가)·procedure-check(입국일 수정 후 주의) 공용. 한쪽 비면 통과.
 */
export function validateAdvanceNotification(notifDate: string, entryDate: string): string | null {
  if (!notifDate || !entryDate) return null
  if (daysBetween(notifDate, entryDate) < 40) {
    return '일본 입국 40일 전까지 신고를 해야 합니다. 신고가 늦은 경우 입국일을 변경해야 합니다.'
  }
  return null
}

/** caseRow → DateRuleContext (저장 액션·재검증 공통). */
export function buildDateRuleContext(caseRow: CaseRow): DateRuleContext {
  return {
    data: (caseRow.data ?? {}) as Record<string, unknown>,
    destination: caseRow.destination ?? null,
    departureDate: caseRow.departure_date ?? null,
  }
}

// 검역·검사 일정의 자기 검증은 procedure-check 룰로 이관 — common.*-date-valid /
// jp.*-date-valid 가 매 렌더마다 위 validate 함수들을 재실행해 어긋난 후행 일정을 '주의'로
// 표면화한다. server action 의 입력 차단도 같은 함수를 직접 호출 — 단일 출처.
