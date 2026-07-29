import type { CaseRow } from '@petmove/domain'
import {
  ALL_PROCEDURE_CHECKS,
  FLIGHT_DATE_IMPORT_QUARANTINE_DESTINATIONS,
  QUARANTINE_START_FIELD_BY_DESTINATION,
  FLIGHT_DATE_RETURN_QUARANTINE_DESTINATIONS,
  JOURNEY_STEP_CATALOG,
  SINGLE_DOSE_RABIES_DESTINATIONS,
  TITER_EXTRA_CARD_DESTINATIONS,
  buildCaseJourneyContext,
  findStepForCheck,
  getStepsForCase,
  isExtraTiterResultConfirmed,
  latestExtraTiterEntry,
  resolveCompletedDate,
  resolveDone,
  runChecksForCase,
  todayKst,
  type StepDefinition,
} from '@petmove/domain'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { mergeRabiesDatesRaw } from './rabies-scheduled'

/**
 * Portal 여정(/journey) 화면 데이터 모델.
 *
 * docs/portal-journey-design.md 의 step 카탈로그 기반.
 * docs/portal-preview/data.jsx 의 `SCENARIO.stages` 와 동일 shape — Calm 디자인
 * (TimelineCalm) 이 그대로 소비.
 *
 * 카탈로그가 빈 케이스(목적지 미상)는 destinations='all' step 들만 남는다 — 8개
 * 디폴트 단계로 자동 폴백.
 */

export type StageState = 'done' | 'current' | 'upcoming'

export interface JourneyStage {
  id: string
  label: string
  short: string
  date: string | null
  /**
   * 미래 날짜 칩의 prefix 단어. 단일 non-window 마감일이 표시 날짜인 step(사전 신고 등)은
   * '마감', 그 외(이벤트·window 시작·earliest·flight)는 '예정'. 과거 날짜·칩 없는 경우는 무시됨.
   */
  dateLabel?: '예정' | '마감'
  state: StageState
  /** 전체 일정 리스트 보조 줄. done→완료 문구, 그 외→행동 문구. */
  desc?: string
  /** 다음 할 일 카드 본문 — 날짜 구문 + 행동 문구. 미완료 step 에만 채워짐. */
  cardDesc?: string
  /** 이 step 의 ok=false 체크 중 '주의'(severity 'info' 제외) 개수. */
  failedChecks?: number
  /** 이 step 의 ok=false 체크 중 '안내'(severity 'info') 개수. */
  infoChecks?: number
  /**
   * 안내 카드 본문 — info check 의 description 또는 advisory step 의 동적 안내문.
   * '안내' 톤 stage(infoChecks > 0 또는 advisory) 일 때만 채워진다. 다건이면 첫 메시지만.
   */
  infoMessage?: string
  /**
   * 주의 본문 — 실패한 비-info 체크의 첫 메시지. desc 와 달리 '설명문 표시' 토글과
   * 무관하게 항상 채워진다 — 히어로 날씨 칩·바텀시트가 내용을 보여줄 수 있도록.
   */
  warnMessage?: string
  /**
   * advisoryOnly step (추가 백신·추가 검사 등 미래 만료 대비 reminder) 여부.
   * 미완료(upcoming) 상태일 때 본 흐름의 다음 단계는 못 가리되, 일정 row 에서는
   * '안내' 톤으로 표시해 보호자가 인지하도록 한다. (deferrable 한 미래 대비라
   * '주의'(실제 문제)가 아닌 차분한 안내 톤.)
   */
  advisory?: boolean
  /**
   * 검사→결과 2단계 step(광견병 항체 검사)에서 채혈일이 도래(≤ 오늘)했으나 아직 결과
   * 미입력 = '진행 중' 상태. 안내 문구 없이 기본 문구 + '진행 중' 칩으로 표시한다.
   */
  inProgress?: boolean
  /**
   * true 면 이 행을 누를 때 step 상세가 아니라 서류 페이지(/cases/<id>/docs)로 이동한다.
   * 서류 체크리스트(document-checklist) 전용 — 서류 검토·완료는 서류 페이지에서 한다.
   */
  linkToDocs?: boolean
}

/**
 * 케이스 차원 '주의' — 특정 step 에 묶이지 않는 자격·외부 행정 결격.
 * (예: 수입 금지 견종, 마릿수 한도, 거주 요건, 1년 라이선스 백신 거부)
 * step 안의 procedure-check 배지가 아니라 journey 페이지 상단의 별도 카드로 노출된다.
 */
export interface CaseAlert {
  id: string
  title: string
  message: string
  severity: 'blocker' | 'warning'
}

export interface JourneyData {
  /** nameEn — 증명서 로마자 표기. 앱 온보딩은 필수라 항상 있고, admin 생성 케이스만 null 가능. */
  pet: { name: string; nameEn: string | null }
  trip: {
    fromCity: string
    toCity: string
    departureDate: string | null
    daysLeft: number | null
    tripType: 'round' | 'one_way'
    /**
     * 출국일 미정 + 일본行 일 때만 채워지는 링 보조줄 힌트. 그 외 null.
     * "지금부터 가장 빠르게 준비하면 출국 가능한 최단 시점"을 표시 — 항체검사 후엔 확정 입국 가능일(달력 날짜),
     * 그 전엔 '최소 N일 남음' 상대 기간. 출국일이 있으면 D-day 가 우선이라 이 값은 안 쓴다.
     */
    prep: { label: string } | null
    /**
     * 케이스 생성일(created_at) 기준 '며칠째 준비 중' 카운트업 (1일째 = 생성 당일). created_at 없으면 null.
     * 출국일이 없을 때 링 보조줄에 D-day 대신 표시 — 전 나라 공통(절차 floor 와 무관한 단순 경과일).
     * 출국일이 있으면 D-day 가 우선이라 이 값은 안 쓴다.
     */
    elapsedDays: number | null
  }
  stages: JourneyStage[]
  /**
   * state==='current' 인 스테이지들 — '다음 할 일' 카드로 노출.
   * 보통 1개지만, non-blocking step(예: 수출검역) 뒤엔 후속 step 도 동시에 current 가 되어 2개 이상.
   * 빈 배열이면 전체 완료.
   */
  nextStages: JourneyStage[]
  /**
   * 여정 완료 — 마지막 절차(편도=일본 수입 / 왕복=한국 수입)가 끝남(has-arrived).
   * true 면 '다음 할 일' 자리에 완료 배너(소감 남기기)를 띄운다. 옛 journey-complete
   * 마커 step 을 대체.
   */
  journeyComplete: boolean
  /** 여정 완료일(YYYY-MM-DD) — 마지막 검역일. 완료 배너의 '도착 도장'에 표시. 미완료면 null. */
  journeyCompleteDate: string | null
  /** 전체 stage 의 failedChecks 합 — 상단 '주의' 배너에 사용. */
  totalFailedChecks: number
  /** 전체 stage 의 infoChecks 합 — 상단 '안내' 배너에 사용. */
  totalInfoChecks: number
  /**
   * 케이스 차원 '주의' 목록 — step 매핑이 없는 procedure-check 의 non-info 결과.
   * 견종·마릿수·거주·1년 라이선스 같은 자격 결격이 여기로 들어온다. 빈 배열이면 표시 안 함.
   */
  caseAlerts: CaseAlert[]
}

/**
 * description 의 첫 문장만 추출 — 일정 row 의 sub-line 용.
 * 마침표/물음표/느낌표 의 첫 등장까지 (그 부호 포함) 반환. 없으면 원문 그대로.
 * 마침표는 뒤에 숫자가 오는 경우(소수점 — "0.5 IU/mL") 는 문장 종결로 보지 않음.
 */
function firstSentence(text: string): string {
  const m = text.match(/[!?]|\.(?!\d)/)
  if (!m || m.index == null) return text.trim()
  return text.slice(0, m.index + 1).trim()
}

/**
 * 배열(rabies_dates / rabies_titer_records)에서 fromIndex 이상 항목 중 가장 늦은 date.
 * 추가 접종·추가 검사 step 의 '예정 [날짜]' 칩 날짜 계산용. 없으면 null.
 */
function latestEntryDate(arr: unknown, fromIndex: number): string | null {
  if (!Array.isArray(arr)) return null
  let max = ''
  for (const r of arr.slice(fromIndex)) {
    const d =
      r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
        ? ((r as Record<string, unknown>).date as string)
        : ''
    if (d.length >= 10 && d > max) max = d
  }
  return max || null
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문 반환. */
function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 'YYYY-MM-DD' → 'YY·MM·DD' (timeline 카드 날짜 표기와 동일). 형식이 아니면 원문. */
function formatYmdDot(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y.slice(2)}·${m}·${d}`
}

const JP_TITER_WAIT_DAYS = 180 // 일본: 항체검사 채혈일 + 180일 이후 입국 가능
const JP_PRIME_BOOST_GAP_DAYS = 30 // 1차→2차 광견병 접종 최소 간격
const RABIES_TITER_PASS_IU = 0.5 // 합격 항체값(IU/mL)

/**
 * 일본 최소 준비기간 / 입국 가능일 힌트 — 출국일이 미정일 때만 링 보조줄에 노출.
 * "지금부터 가장 빠르게 준비하면 언제 출국 가능한가" 를 표시한다.
 *
 * 일본 규정의 핵심: 입국은 '항체검사 채혈일 + 180일' 이후 가능. 그래서 모든 분기가
 * '가장 빠른 채혈 가능일(earliestDraw) + 180' 으로 환원된다.
 *  - 합격 항체검사(채혈일 有, value≥0.5 IU/mL): 채혈일+180 = 확정 입국 가능일(달력 날짜)
 *  - 2차 접종 완료: 지금 채혈 가능 → 최소 180일
 *  - 1차만 완료: 1차일+30 에 2차+채혈 → 그만큼 + 180
 *  - 광견병 시작 안 함(또는 칩 미완 — 최소기간 동일): 1차→+30→채혈→+180 ≈ 7개월
 *
 * 항체 2년 만료·백신 유효기간·40일 사전신고는 '정해진 출국일의 유효성' 문제라 최소기간엔 제외.
 */
function jpPrepHint(
  caseData: Record<string, unknown>,
  today: string,
): { label: string } | null {
  // ① 항체검사 채혈일 — 180 카운트다운의 기준점. value 는 명시적 불합격(<0.5)일 때만 제외하고,
  // 비어 있으면 '완료' 버튼(rabies_titer_result_confirmed) 경로라 합격 취급. (done-resolver 와 동일)
  const records = Array.isArray(caseData.rabies_titer_records) ? caseData.rabies_titer_records : []
  let drawDate: string | null = null
  let hasValue = false
  for (const r of records) {
    if (!r || typeof r !== 'object') continue
    const rec = r as Record<string, unknown>
    const d = typeof rec.date === 'string' && rec.date.length >= 10 ? rec.date.slice(0, 10) : ''
    if (!d) continue
    const vStr = typeof rec.value === 'string' ? rec.value.trim() : ''
    if (vStr) {
      hasValue = true
      const v = parseFloat(vStr)
      if (Number.isFinite(v) && v < RABIES_TITER_PASS_IU) continue // 명시적 불합격 채혈 제외
    }
    if (!drawDate || d < drawDate) drawDate = d // 가장 이른 합격 채혈일
  }
  // 항체검사 완료 판정 — 결과확인 플래그 OR 결과값 입력 (앱 done-resolver 기준).
  const titerDone = caseData.rabies_titer_result_confirmed === true || hasValue
  if (titerDone) {
    // 완료됐는데 채혈일이 없으면(자동추출분 등) 확정 입국일을 못 구함 → 표시 안 함.
    if (!drawDate) return null
    if (daysBetween(drawDate, today) >= JP_TITER_WAIT_DAYS) return { label: '입국 가능' }
    return { label: `${formatYmdDot(addDays(drawDate, JP_TITER_WAIT_DAYS))} 입국 가능` }
  }

  // ②③④ 접종 진행도 → 가장 빠른 채혈 가능일.
  const dateAt = (i: number): string | null => {
    const arr = Array.isArray(caseData.rabies_dates) ? caseData.rabies_dates : []
    const r = arr[i]
    const d =
      r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
        ? ((r as Record<string, unknown>).date as string)
        : ''
    return d.length >= 10 ? d.slice(0, 10) : null
  }
  const first = dateAt(0)
  const second = dateAt(1)

  // ④ 광견병 정보 없음 → 약 7개월(1차→+30→채혈→+180 = 210일).
  if (!first && !second) return { label: '최소 7개월 남음' }

  // 채혈 가능 최단일: 2차 완료 → 그 날(보통 과거) / 1차만 → 1차+30. 과거면 오늘로 클램프.
  const earliestDraw = second ?? addDays(first as string, JP_PRIME_BOOST_GAP_DAYS)
  const daysToDraw = Math.max(0, daysBetween(today, earliestDraw))
  return { label: `최소 ${daysToDraw + JP_TITER_WAIT_DAYS}일 남음` }
}

/**
 * deadline anchor 의 기준일 (YYYY-MM-DD, 없으면 null).
 * 'departure' 는 출국일 — 미입력 시 입국일(entry_date)로 폴백. 'entry' 는 입국일 — 미입력 시
 * 출국일(departure_date)로 폴백(2026-07-16). 대부분 목적지는 둘이 같은 날(한일 노선)이거나
 * 보호자가 입국일까지는 안 적어(EU 등) 반대쪽으로 근사하는 것이 안전.
 */
function deadlineAnchorDate(step: StepDefinition, caseRow: CaseRow): string | null {
  const dl = step.deadline
  if (!dl) return null
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const entry = typeof data.entry_date === 'string' ? data.entry_date : ''
  let base = ''
  if (dl.anchor === 'departure') base = caseRow.departure_date || entry
  else if (dl.anchor === 'entry') base = entry || caseRow.departure_date || ''
  else if (dl.anchor === 'created') base = caseRow.created_at ?? ''
  return base.length >= 10 ? base.slice(0, 10) : null
}

/**
 * step 의 deadline 표시일 — 기준일에서 daysBefore 만큼 당김. window 면 구간 시작일.
 *
 * fallbackDaysBefore 가 있으면 **1차 마감이 지난 뒤 2차 마감으로 넘어간다**(대만 수입허가
 * 120일 → 20일). 1차만 두면 119일째부터 '마감 지남'이 되어, 아직 신청할 수 있는 사람에게
 * 이미 늦었다고 잘못 알린다. 알림도 같은 2단계(reminders.ts).
 */
function deadlineDate(step: StepDefinition, caseRow: CaseRow): string | null {
  if (!step.deadline) return null
  const base = deadlineAnchorDate(step, caseRow)
  if (!base) return null
  const at = (daysBefore: number): string | null => {
    const d = new Date(base + 'T00:00:00Z')
    if (isNaN(d.getTime())) return null
    d.setUTCDate(d.getUTCDate() - daysBefore)
    return d.toISOString().slice(0, 10)
  }
  const primary = at(step.deadline.daysBefore)
  const fb = step.deadline.fallbackDaysBefore
  if (fb == null || !primary) return primary
  // 1차가 아직 안 지났으면 1차, 지났으면 2차.
  return primary >= todayKst() ? primary : at(fb)
}

/** 날짜 구간의 끝 날짜 표시 — 시작과 같은 해면 'YYYY년' 생략. */
function formatRangeEnd(start: string, end: string): string {
  const full = formatKoreanDate(end)
  return start.slice(0, 4) === end.slice(0, 4) ? full.replace(/^\d+년\s*/, '') : full
}

/**
 * step 의 earliest 앵커로 '가능 시작일' 계산.
 * - anchor 'birth': case.data.birth_date + daysAfter.
 * - anchor 'step:<id>': 선행 step 의 완료일 + daysAfter. 선행 step 미완료면 null.
 */
function earliestDate(step: StepDefinition, caseRow: CaseRow): string | null {
  const e = step.earliest
  if (!e) return null
  if (e.anchor === 'birth') {
    const data = (caseRow.data ?? {}) as Record<string, unknown>
    const birth = typeof data.birth_date === 'string' ? data.birth_date : null
    if (!birth || birth.length < 10) return null
    return addDays(birth.slice(0, 10), e.daysAfter)
  }
  if (e.anchor.startsWith('step:')) {
    const refId = e.anchor.slice('step:'.length)
    const refStep = JOURNEY_STEP_CATALOG.find((s) => s.id === refId)
    if (!refStep || !resolveDone(refStep.done, caseRow)) return null
    const base = resolveCompletedDate(refStep.done, caseRow)
    return base ? addDays(base, e.daysAfter) : null
  }
  return null
}

/**
 * 검역·검사 5단계에서 예정일이 지났는데 보호자가 아직 '저장'으로 확인(완료)하지 않은 상태 안내.
 * 자동 완료가 아니라 직접 확인 방식이라, 지난 일정을 어떻게 처리할지 알려준다.
 */
const PASSED_UNCONFIRMED_MSG =
  '예정일이 지났습니다. 완료 버튼을 눌러 완료하시거나, 새로운 예정일을 등록하실 수 있습니다.'

/**
 * 기록형(A부류 — 마이크로칩·광견병·백신·항체·구충·임상검사) 카드에서 예정일(*_scheduled)이
 * 지났는데 아직 완료 전 상태의 목록 카드 안내 — 상세 화면의 안내·'완료' 버튼과 짝
 * (2026-07-24 모델 재정립, 문구는 사용자안 글자 그대로).
 */
const RECORD_PASSED_MSG = '예정일이 지났습니다. 완료 버튼을 누르거나 날짜를 변경하세요.'

/**
 * 절차검증(주의·안내 룰)용 데이터 뷰 — 실제 기록 + 예정(*_scheduled)을 합친다.
 *
 * 예정은 보호자가 실제로 잡아둔 예약이라, 앞 단계(접종일 등)를 나중에 수정해 계획이
 * 어긋나면 주의로 표면화해야 한다(2026-07-25 사용자 결정 — 광견병만 합치던 것을 전체로).
 * 입력 차단(저장 거부)과 같은 룰이 같은 데이터를 보게 되는 효과. 이 합본은 portal 검증
 * 계산에만 쓰인다 — 완료판정(resolveDone)·펫무브워크·PDF 는 계속 실제 기록만 본다.
 *
 * 변경이 없으면 원본 객체를 그대로 반환(식별자 보존 — 호출부가 caseRow 재구성 생략).
 */
function mergeScheduledForChecks(data: Record<string, unknown>): Record<string, unknown> {
  let out = data
  const ensure = (): Record<string, unknown> => {
    if (out === data) out = { ...data }
    return out
  }
  // 광견병 — 회차 순서가 얽혀 전용 병합(날짜순 정렬) 사용.
  if (Array.isArray(data.rabies_dates_scheduled) && (data.rabies_dates_scheduled as unknown[]).length > 0) {
    ensure().rabies_dates = mergeRabiesDatesRaw(data)
  }
  const dateOfEntry = (e: unknown): string =>
    typeof e === 'string'
      ? e.slice(0, 10)
      : e && typeof e === 'object' && typeof (e as Record<string, unknown>).date === 'string'
        ? ((e as Record<string, unknown>).date as string).slice(0, 10)
        : ''
  // 단일 문자열 예정 → 대응 배열에 entry 로 병합(같은 날짜 있으면 skip).
  const mergeDateInto = (arrKey: string, schedKey: string) => {
    const s = data[schedKey]
    if (typeof s !== 'string' || s.length < 10) return
    const d = s.slice(0, 10)
    const src = out[arrKey] ?? data[arrKey]
    const arr = Array.isArray(src) ? (src as unknown[]) : []
    if (arr.some((e) => dateOfEntry(e) === d)) return
    ensure()[arrKey] = [...arr, { date: d }]
  }
  mergeDateInto('general_vaccine_dates', 'general_vaccine_dates_scheduled')
  mergeDateInto('external_parasite_dates', 'external_parasite_dates_scheduled')
  mergeDateInto('internal_parasite_dates', 'internal_parasite_dates_scheduled')
  // 항체 1회차 예정 — 첫 slot 이 shell(검사기관만, date 없음)이면 거기에 채우고, 아니면 앞에 추가.
  {
    const s = data.rabies_titer_scheduled
    if (typeof s === 'string' && s.length >= 10) {
      const d = s.slice(0, 10)
      const src = out.rabies_titer_records ?? data.rabies_titer_records
      const arr = Array.isArray(src) ? [...(src as unknown[])] : []
      if (!arr.some((e) => dateOfEntry(e) === d)) {
        const first = arr[0]
        if (first && typeof first === 'object' && !(first as Record<string, unknown>).date) {
          arr[0] = { ...(first as Record<string, unknown>), date: d }
        } else {
          arr.unshift({ date: d })
        }
        ensure().rabies_titer_records = arr
      }
    }
  }
  // 추가 채혈 예정 — 뒤에 추가.
  mergeDateInto('rabies_titer_records', 'rabies_titer_extra_scheduled')
  // 스칼라 예정(칩 시술·검진) — 실제 값이 비어 있을 때만 채움.
  const mergeScalar = (key: string, schedKey: string) => {
    const s = data[schedKey]
    if (typeof s !== 'string' || s.length < 10) return
    const cur = data[key]
    if (typeof cur === 'string' && cur) return
    ensure()[key] = s.slice(0, 10)
  }
  mergeScalar('microchip_implant_date', 'microchip_implant_date_scheduled')
  mergeScalar('vet_visit_date', 'vet_visit_date_scheduled')
  return out
}

/**
 * 어느 step 에도 매핑하지 않았지만, '추가 백신·추가 검사' advisory step 의 situational 안내가
 * 같은 조건을 더 정확한 맥락에서 전달하므로 상단 case-level '주의' 배너로는 띄우지 않는 체크.
 *
 * 이 규칙들은 admin(펫무브워크)에선 'warning'(문서 발행 전 운영자 경고)로 살아있어야 하므로
 * 규칙 severity 자체는 바꾸지 않고, 포털 표시에서만 제외한다.
 *  - jp.entry-within-2years-of-titer  → '추가 검사'(rabies-titer-extra) 안내가 재검사를 가리킴
 *  - jp.rabies-valid-until-on-departure → '추가 백신'(rabies-vaccine-extra) (이미 info 라 묻히지만 명시)
 */
const ADVISORY_DEFERRED_CHECKS = new Set<string>([
  'jp.entry-within-2years-of-titer',
  'jp.rabies-valid-until-on-departure',
  // 1회 접종국의 광견병·종합백신 '입국 전 만료' 룰 — 각 백신 카드(rabies-vaccine-1·
  // general-vaccine) situational 이 같은 조건을 안내 (일본 모델). 항공권 validationIds 에서도
  // 제거해 광견병과 대칭 — 종합백신만 항공권 카드에 중복으로 새던 것 차단.
  'th.rabies-not-expired-on-arrival',
  'th.general-vaccine-not-expired-on-arrival',
  'ph.rabies-not-expired-on-arrival',
  'ph.general-vaccine-not-expired-on-arrival',
  // 카자흐스탄 — 종합백신 12개월(입국 요건)도 같은 처리. 카드 situational 이 "직전 종합백신의
  // 면역 유효기간이 …에 만료되었어요"로 같은 말을 하므로 배지는 중복(2026-07-22).
  'kz.general-vaccine-not-expired-on-arrival',
  'eu.rabies-valid-until-on-entry',
  // 우크라이나 — EU 와 같은 '조건부 무기한 항체' 모델이라 같은 처리(2026-07-21).
  'ua.rabies-valid-on-departure',
])

/**
 * 펫무브앱(portal) 표시 제외 — **룰 선언의 `audience: 'staff'` 에서 파생**한다(2026-07-18).
 *
 * 예전엔 이 목록에 id 를 손으로 적었다. 그러면 "이 문구를 고객이 보는가"를 알려면
 * severity + 이 목록 + relatedCases 의존 여부를 사람이 조합해야 해서 반복해서 잘못 짚었다.
 * 이제 룰 파일 한 줄(`audience: 'staff'`)이 단일 출처고, 여기·lint:checks 가 모두 그걸 본다.
 *
 * 현재 staff 전용:
 *  - eu.tapeworm-1to3days-before-entry — portal 은 1~5일(법정 24~120h) 입력불가로 대체
 *  - cn.one-pet-per-guardian / ph.max-3pets-per-shipment — relatedCases 는 admin 만 전달
 *
 * export — step-detail-screen.tsx 의 collectStepChecks(단계 상세 인라인 '주의' 박스)도 같은
 * 집합을 참조한다. 한쪽만 거르면 목록에선 숨고 상세엔 새는 불일치가 생긴다(2026-07-16 수정).
 */
export const PORTAL_SUPPRESSED_CHECKS: ReadonlySet<string> = new Set(
  ALL_PROCEDURE_CHECKS.filter((c) => c.audience === 'staff').map((c) => c.id),
)

export function buildJourney(
  caseRowInput: CaseRow,
  activeDestination?: string | null,
  prefs?: {
    /** 자기책임 모드 — '주의'/case 경고 숨김(입력불가 차단은 step-detail·server 가 담당). '안내'는 유지. */
    freeInputMode?: boolean
    /** 일정 탭 단계의 정적 설명문 숨김(상태 안내·주의는 유지). */
    hideStepDescriptions?: boolean
  },
): JourneyData {
  const freeInputMode = prefs?.freeInputMode === true
  const hideStepDescriptions = prefs?.hideStepDescriptions === true
  // 다중 목적지: 활성 목적지 1개짜리 뷰로 좁혀, 아래 단일목적지 가정 로직을 그대로 태운다.
  // (단계 적용·완료 판정·검증·표시 날짜가 모두 활성 목적지 기준이 된다. 단일 목적지면 무변경.)
  const caseRow = activeDestinationView(caseRowInput, activeDestination)
  const ctx = buildCaseJourneyContext(caseRow)
  const today = todayKst()
  const dep = caseRow.departure_date
  const daysLeft = dep ? daysBetween(today, dep) : null
  // 출국일 미정 + 일본行 일 때만 — 링 보조줄에 '최소 준비기간/입국 가능일' 힌트. 출국일 있으면 D-day 우선.
  const prep =
    !dep && ctx.destinationKey === 'japan'
      ? jpPrepHint((caseRow.data ?? {}) as Record<string, unknown>, today)
      : null
  // 출국일이 없을 때 링 보조줄에 표시할 '며칠째 준비 중' 카운트업 — 그 목적지의 준비 시작일 기준,
  // 1일째 = 시작 당일. 전 나라 공통(절차 floor 와 무관한 단순 경과일). 출국일이 있으면 D-day 우선.
  // 기준일: 그 목적지를 추가한 날(data.dest_started_at[활성목적지], addCaseDestination 이 기록) →
  // 없으면 케이스 생성일(created_at)로 폴백. 폴백이 처음 등록한 목적지·기존 케이스를 자동 backfill —
  // 첫 고객 화면은 그대로, 재이용 고객의 새 여정만 시작일부터 다시 센다. caseRow 는 활성 목적지 뷰라
  // caseRow.destination = 활성 토큰, dest_started_at(top-level 맵)은 flatten 후에도 보존된다.
  const startedMap = (caseRow.data as Record<string, unknown> | null)?.dest_started_at as
    | Record<string, string>
    | undefined
  const activeDest = caseRow.destination ?? null
  const destStartedAt =
    activeDest && typeof startedMap?.[activeDest] === 'string'
      ? startedMap[activeDest].slice(0, 10)
      : null
  const createdAt = caseRow.created_at ? caseRow.created_at.slice(0, 10) : null
  const countupAnchor = destStartedAt ?? createdAt
  const elapsed = countupAnchor ? daysBetween(countupAnchor, today) : null
  const elapsedDays = elapsed != null && elapsed >= 0 ? elapsed + 1 : null

  const applicableSteps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)

  // procedure-check 결과를 step 단위로 집계. severity 'info' 는 차분한 '안내'
  // 톤으로 분리, 그 외(blocker/warning)는 '주의'. destinationKey 없으면 빈 맵.
  // 광견병 체인 정합성·검역·검사 일정 자기검증·국가별 의료 룰 모두 동일 패스로 평가된다.
  const failedByStep = new Map<string, number>()
  const infoByStep = new Map<string, number>()
  const infoMessageByStep = new Map<string, string>()
  // 주의 카드 본문 — 같은 step 에 여러 주의가 묶이면 첫 메시지만 보존. 타임라인 desc 보조줄.
  const failedMessageByStep = new Map<string, string>()
  // step 매핑이 없는 non-info 결과 — 견종·마릿수·거주·1년 라이선스 같은 case-level 결격.
  // journey 페이지 상단의 별도 '주의' 카드로 노출된다.
  const caseAlerts: CaseAlert[] = []
  if (ctx.destinationKey) {
    // 다중 목적지 케이스에서 by_dest 조회를 위해 destination 토큰 전달 (caseRow.destination
    // 그대로 — 단일 목적지면 그 값, 다중이면 read 시 헬퍼가 토큰을 파싱).
    // 고객 절차검증은 실제 + 예정(*_scheduled 전체)을 합친 뷰로 — 고객이 잡아둔 계획(접종·
    // 채혈·구충·검진 예정)도 체인·간격·순서 검증을 받게(2026-07-25 광견병만 → 전체 확장).
    // 완료판정(resolveDone)은 실제 기록만 봐서 미래로 안 완료된다.
    const checksData = (caseRow.data ?? {}) as Record<string, unknown>
    const mergedChecksData = mergeScheduledForChecks(checksData)
    const checksCaseRow =
      mergedChecksData === checksData ? caseRow : { ...caseRow, data: mergedChecksData }
    const all = runChecksForCase(ctx.destinationKey, {
      caseRow: checksCaseRow,
      destination: caseRow.destination,
    })
    for (const { check, result } of all) {
      if (result.ok) continue
      // portal 전용 표시 제외(admin 과 기준 다른 룰) — 위 PORTAL_SUPPRESSED_CHECKS 주석 참고.
      if (PORTAL_SUPPRESSED_CHECKS.has(check.id)) continue
      let stepId = findStepForCheck(check.id)
      if (!stepId) {
        // advisory step(추가 백신·추가 검사)이 같은 조건을 안내로 처리 — 상단 주의로 중복 노출 안 함.
        if (ADVISORY_DEFERRED_CHECKS.has(check.id)) continue
        // step 에 매핑되지 않은 non-info = case-level 결격. 별도 영역에 모은다.
        // (자기책임 모드: '주의'/경고는 숨김 — info '안내'만 남긴다.)
        if (check.severity !== 'info' && !freeInputMode) {
          caseAlerts.push({
            id: check.id,
            title: check.title,
            message: result.message ?? check.description,
            severity: check.severity,
          })
        }
        continue
      }
      // 1차 < 마이크로칩 사전 안내는 보호자가 다음 액션할 step 으로 옮긴다.
      // 2차 백신 미완 → catalog 매핑(rabies-vaccine-2) 그대로, 2차 done → rabies-titer.
      // (같은 날 룰을 두 입력 시점 모두에서 환기.)
      if (check.id === 'jp.rabies-prime-before-microchip') {
        const r2 = applicableSteps.find((s) => s.id === 'rabies-vaccine-2')
        if (r2 && resolveDone(r2.done, caseRow)) stepId = 'rabies-titer'
      }
      // 자기책임 모드: '주의'(non-info)는 배지·보조줄에서 숨긴다. info '안내'는 그대로.
      if (check.severity !== 'info' && freeInputMode) continue
      const bucket = check.severity === 'info' ? infoByStep : failedByStep
      bucket.set(stepId, (bucket.get(stepId) ?? 0) + 1)
      // 안내 카드 본문 — 같은 step 에 여러 안내가 묶이면 첫 메시지만 보존.
      if (check.severity === 'info' && !infoMessageByStep.has(stepId)) {
        infoMessageByStep.set(stepId, result.message ?? check.description)
      }
      // 주의 본문도 같은 방식 — 첫 메시지를 타임라인 desc 보조줄로 노출.
      if (check.severity !== 'info' && !failedMessageByStep.has(stepId)) {
        failedMessageByStep.set(stepId, result.message ?? check.description)
      }
    }
  }

  const stages: JourneyStage[] = applicableSteps.map((step) => {
    // getStepsForCase 가 이미 destination override 머지된 step 을 돌려준다 — 별도 머지 불필요.
    const done = resolveDone(step.done, caseRow)
    // departure step 은 출국일 자체. 그 외에는:
    //  - done → resolveCompletedDate (없으면 dash 로 fallback)
    //  - upcoming → deadline 권장일, 없으면 earliest 가능일
    const isDeparture = step.id === 'departure'
    // 나라별 도착(수입)·출국(수출) 검역 — done 시그널 'quarantine:<검역일필드>' (일본 외 공용
    // 배선, step-detail-view 와 동일 규약). 그 나라 검역일 필드 key 를 동적으로 읽는다.
    const quarantineField =
      typeof step.done === 'string' && step.done.startsWith('quarantine:')
        ? step.done.slice('quarantine:'.length)
        : null
    // 날짜 입력칸 없이 '완료' 버튼만 있는 도착 검역(싱가포르·호주·뉴질랜드) — 예정 배지는
    //   계류시설 예약 카드의 계류 시작일로 띄운다. 이 분기를 빠뜨리면 카드가 '평범한 출국
    //   카드'로 분류돼 **출국일**이 예정 배지로 나간다(2026-07-28 실제로 그렇게 났다).
    const quarantineStartField = isDeparture
      ? (QUARANTINE_START_FIELD_BY_DESTINATION[ctx.destinationKey ?? ''] ?? null)
      : null
    // 수입검역(= departure 의 목적지 override — 일본 'has-jp-import-quarantine' 또는 그 외
    // 나라 quarantine: 시그널)은 검역일로 완료·날짜를 잡으므로 departure 의 '출국일'
    // shortcut 에서 제외 — 일반 경로(done→완료일)를 탄다.
    const isJpImportQuarantine =
      isDeparture &&
      ((step.inputs ?? []).some((i) => i.key === 'jp_import_quarantine_date') ||
        quarantineField !== null ||
        quarantineStartField !== null)
    const deadline = deadlineDate(step, caseRow)
    const earliest = earliestDate(step, caseRow)
    // window 마감이면 구간 끝(기준일) — 카드에 'A ~ B' 구간으로 표시.
    const deadlineEnd = step.deadline?.window ? deadlineAnchorDate(step, caseRow) : null
    // 항공권 dates → 검역 step 표시일. 한일 노선은 도착·검역이 같은 날이라
    // entry_date(출국 항공편) = 일본 수입검역, return_date(귀국 항공편) = 한국 수입검역.
    // 일본 수출 동물검역(visit) 은 신청 step 에서 입력한 예약일(jp_export_quarantine_date)이
    // 곧 방문일 — visit step 의 미완료 표시일로 사용.
    const caseData = (caseRow.data ?? {}) as Record<string, unknown>
    const flightEntryDate =
      typeof caseData.entry_date === 'string' && caseData.entry_date.length >= 10
        ? caseData.entry_date.slice(0, 10)
        : null
    const flightReturnDate =
      typeof caseData.return_date === 'string' && caseData.return_date.length >= 10
        ? caseData.return_date.slice(0, 10)
        : null
    // 항공권 날짜(출발/귀국편)를 도착·귀국 수입검역의 '예정 [날짜]' 배지로 — 단, 출발=도착이 같은
    // 날인 목적지(FLIGHT_DATE_*_QUARANTINE_DESTINATIONS)에서, 그 날짜가 '미래'일 때만. 지나면 null →
    // 배지 내려가고 평범한 상태(다른 백신·검사 카드와 동일 '예정→도래→내림'). 완료는 고객이 실제
    // 검역일을 입력·저장할 때(quarantine: 모델). 명단 밖 목적지(EU·태국 도착 등)는 예정 배지 없음.
    const importQuarantineUpcoming =
      isJpImportQuarantine &&
      FLIGHT_DATE_IMPORT_QUARANTINE_DESTINATIONS.includes(ctx.destinationKey ?? '') &&
      flightEntryDate &&
      flightEntryDate > today
        ? flightEntryDate
        : null
    // 입력칸 없는 도착 검역 — 예정 배지 = **계류시설 예약 카드에 넣은 계류 시작일**.
    //   항공권 날짜(출국일)를 쓰지 않는 이유는 quarantineStartField 주석 참고.
    //   예약일이 지나면 done 이 true 라 위 resolveCompletedDate 가 그 날짜를 그대로 쓴다.
    const quarantineStartUpcoming =
      quarantineStartField && typeof caseData[quarantineStartField] === 'string'
        ? ((caseData[quarantineStartField] as string).slice(0, 10) || null)
        : null
    const krImportUpcoming =
      step.id === 'kr-import-quarantine' &&
      FLIGHT_DATE_RETURN_QUARANTINE_DESTINATIONS.includes(ctx.destinationKey ?? '') &&
      flightReturnDate &&
      flightReturnDate > today
        ? flightReturnDate
        : null
    const jpExportReservationDate =
      typeof caseData.jp_export_quarantine_date === 'string' &&
      caseData.jp_export_quarantine_date.length >= 10
        ? caseData.jp_export_quarantine_date.slice(0, 10)
        : null
    // 일본 수출검역 신청은 마감(deadline)이 없어 미완료 시 표시일이 없다 — 신청일을 입력했으면
    // '예정 [신청일]'로 노출. (사전 신고는 마감일이 있어 기존대로 '마감 [날짜]' 유지.)
    const jpExportApplicationDate =
      typeof caseData.jp_export_quarantine_application_date === 'string' &&
      caseData.jp_export_quarantine_application_date.length >= 10
        ? caseData.jp_export_quarantine_application_date.slice(0, 10)
        : null
    // 임상검사 검진일이 미래로 입력된 경우 — done 시그널은 '오늘 이전'만 인정하므로
    // 미완료 상태가 되지만, 보호자가 일정을 잡아둔 셈이라 '예정 [날짜]' 칩으로 노출.
    const vetVisitDate = (() => {
      const sched =
        typeof caseData.vet_visit_date_scheduled === 'string'
          ? caseData.vet_visit_date_scheduled.slice(0, 10)
          : ''
      if (sched.length >= 10 && sched > today) return sched
      const field =
        typeof caseData.vet_visit_date === 'string' ? caseData.vet_visit_date.slice(0, 10) : ''
      return field.length >= 10 ? field : null
    })()
    // 마이크로칩 미래(예정) 시술일은 별도 자리(microchip_implant_date_scheduled)에 저장된다 —
    // 그게 미래면 '예정 [날짜]' 칩. (마이그레이션 전 옛 데이터: 실제 필드에 미래가 남아 있으면 폴백.)
    const microchipImplantDate = (() => {
      const sched =
        typeof caseData.microchip_implant_date_scheduled === 'string'
          ? caseData.microchip_implant_date_scheduled.slice(0, 10)
          : ''
      if (sched.length >= 10 && sched > today) return sched
      const field =
        typeof caseData.microchip_implant_date === 'string'
          ? caseData.microchip_implant_date.slice(0, 10)
          : ''
      return field.length >= 10 ? field : null
    })()
    // 한국 수출 동물검역도 동일 — 검역일이 미래면 미완료지만 잡아둔 일정이므로 '예정' 으로 노출.
    const krExportQuarantineDate =
      typeof caseData.kr_export_quarantine_date === 'string' &&
      caseData.kr_export_quarantine_date.length >= 10
        ? caseData.kr_export_quarantine_date.slice(0, 10)
        : null
    // 추가 접종(일본 3차+/1회 접종국 2차+) — 가장 최근 추가 접종일이 미래(예정)면 '예정 [날짜]'
    // 칩으로 노출. (검역·임상검사와 동일 패턴. 도래·확인 후엔 done 으로 완료 처리되어 여기 안 옴.)
    const rabiesExtraUpcomingDate =
      step.id === 'rabies-vaccine-extra'
        ? latestEntryDate(
            mergeRabiesDatesRaw(caseData),
            SINGLE_DOSE_RABIES_DESTINATIONS.includes(ctx.destinationKey ?? '') ? 1 : 2,
          )
        : null
    // 항체검사 채혈일을 미래(예정)로 저장하면 별도 자리(rabies_titer_scheduled)에 저장된다.
    // 그게 미래면 '예정 [날짜]' 칩. 도래/지나면 null → 배지 사라짐(원래 상태). 실제 검사는
    // 보호자가 오늘/과거 채혈일로 저장할 때만 기록되어 진행 중→완료 2스텝이 시작된다.
    const titerScheduledDate =
      step.id === 'rabies-titer' &&
      typeof caseData.rabies_titer_scheduled === 'string' &&
      caseData.rabies_titer_scheduled.slice(0, 10) > today
        ? caseData.rabies_titer_scheduled.slice(0, 10)
        : null
    // 사전 신고 — 미래(예정) 신청일이 입력돼 있으면 '예정 [신청일]' 칩(마감 대신). 없으면 마감.
    // 신청일이 마감을 넘기면 procedure-check '주의'가 칩을 덮어쓴다(여기선 단순 표시만).
    const advanceUpcomingDate =
      step.id === 'advance-notification' &&
      !done &&
      typeof caseData.advance_notification_date === 'string' &&
      caseData.advance_notification_date.slice(0, 10) > today
        ? caseData.advance_notification_date.slice(0, 10)
        : null
    // 수입 허가 — 미래(예정) 신청일이면 '예정 [신청일]' 칩(마감 대신). 사전 신고와 동일.
    const importPermitUpcomingDate =
      step.id === 'import-permit' &&
      !done &&
      typeof caseData.import_permit_application_date === 'string' &&
      caseData.import_permit_application_date.slice(0, 10) > today
        ? caseData.import_permit_application_date.slice(0, 10)
        : null
    // 구충 '진행 중' — 규정이 2회를 요구하는 곳(호주·뉴질랜드)에서 **1회만 마친** 상태.
    //   카드를 1차/2차로 쪼개는 대신 한 장에 상태로 표현한다(2026-07-30 사용자 지정 모델):
    //   한 번 넣으면 '진행 중', 필요 회차를 채우면 완료. 회차 요건이 없는 목적지는
    //   requiredParasiteDoses 가 1을 돌려줘 첫 기록에서 바로 done 이라 여기 오지 않는다.
    //   ⚠️ 도래(≤오늘)한 기록만 센다 — 예정만 잡아둔 상태는 '진행 중'이 아니라 '예정' 배지다.
    const parasiteInProgress =
      (step.id === 'external-parasite' || step.id === 'internal-parasite') &&
      !done &&
      (() => {
        const key =
          step.id === 'external-parasite' ? 'external_parasite_dates' : 'internal_parasite_dates'
        const raw = caseData[key]
        if (!Array.isArray(raw)) return false
        const arrived = raw
          .map((e) =>
            typeof e === 'string' ? e.slice(0, 10) : ((e as { date?: string })?.date ?? '').slice(0, 10),
          )
          .filter((d) => d.length >= 10 && d <= today).length
        return arrived > 0
      })()
    // 항체검사 '진행 중' — 채혈일이 도래(≤ 오늘)했고 아직 결과·완료 전(!done). 안내 문구 없이
    // 기본 문구 + '진행 중' 칩으로 표시한다(2스텝의 1단계 완료 상태). 미래 채혈일은 위 예정 배지.
    const titerInProgress =
      step.id === 'rabies-titer' &&
      !done &&
      (() => {
        const arr = Array.isArray(caseData.rabies_titer_records) ? caseData.rabies_titer_records : []
        const p = arr[0] as Record<string, unknown> | undefined
        const d = p && typeof p.date === 'string' ? p.date.slice(0, 10) : ''
        return d.length >= 10 && d <= today
      })()
    // 추가 항체 검사도 1회차와 동일 2단계 — 최신 추가 채혈일이 도래했고 결과·완료 전이면 '진행 중'.
    // 판정은 도메인 단일 출처(latestExtraTiterEntry/isExtraTiterResultConfirmed).
    const titerExtraInProgress =
      step.id === 'rabies-titer-extra' &&
      !done &&
      (() => {
        const latest = latestExtraTiterEntry(caseRow)
        if (!latest || latest.date.slice(0, 10) > today) return false
        return !isExtraTiterResultConfirmed(caseRow)
      })()
    // 사전 신고·일본 수출검역 신청 '진행 중' — 신청일이 도래(≤ 오늘)했고 미완료. titer 방식:
    // ack 버튼 없이 신청일 도래만으로 진행 중. 미래 신청일은 ≤오늘 가드에 안 걸려 예정으로 남음.
    const advanceInProgress =
      step.id === 'advance-notification' &&
      !done &&
      typeof caseData.advance_notification_date === 'string' &&
      caseData.advance_notification_date.slice(0, 10).length >= 10 &&
      caseData.advance_notification_date.slice(0, 10) <= today
    const jpExportInProgress =
      step.id === 'jp-export-quarantine' &&
      !done &&
      typeof caseData.jp_export_quarantine_application_date === 'string' &&
      caseData.jp_export_quarantine_application_date.slice(0, 10).length >= 10 &&
      caseData.jp_export_quarantine_application_date.slice(0, 10) <= today
    // 수입 허가 '진행 중' — 사전 신고와 동일 titer 방식. ack 버튼 없이 신청일 도래만으로 진행 중.
    // (import_permit_application_date 는 by_dest scoped — caseData 는 활성 목적지로 flatten 됨.)
    const importPermitInProgress =
      step.id === 'import-permit' &&
      !done &&
      typeof caseData.import_permit_application_date === 'string' &&
      caseData.import_permit_application_date.slice(0, 10).length >= 10 &&
      caseData.import_permit_application_date.slice(0, 10) <= today
    // 추가 검사 — 입국일 이전에 예약한(미래) 채혈이 있으면 '예정 [날짜]' 칩. 입국 후 채혈은
    // 그 입국을 보증 못 하므로 제외(무의미한 미래 채혈을 예정으로 오인 노출하지 않음).
    const titerExtraUpcomingDate = (() => {
      if (step.id !== 'rabies-titer-extra') return null
      const entryBound =
        (typeof caseData.entry_date === 'string' && caseData.entry_date.length >= 10
          ? caseData.entry_date.slice(0, 10)
          : '') ||
        (typeof dep === 'string' && dep.length >= 10 ? dep.slice(0, 10) : '')
      // 미래(예정) 추가 채혈은 별도 자리(rabies_titer_extra_scheduled)에 저장 — 그게 미래(입국 전)면 칩.
      const sched =
        typeof caseData.rabies_titer_extra_scheduled === 'string'
          ? caseData.rabies_titer_extra_scheduled.slice(0, 10)
          : ''
      if (sched.length >= 10 && sched > today && (!entryBound || sched <= entryBound)) return sched
      // 옛 데이터 폴백 — 기록 배열에 미래가 남아 있으면.
      if (!Array.isArray(caseData.rabies_titer_records)) return null
      let max = ''
      for (const r of (caseData.rabies_titer_records as unknown[]).slice(1)) {
        const d =
          r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
            ? ((r as Record<string, unknown>).date as string)
            : ''
        if (d.length >= 10 && d > today && (!entryBound || d <= entryBound) && d > max) max = d
      }
      return max || null
    })()
    // 검역·검사 5단계는 '저장' 확인으로 완료(날짜 ≤ 오늘 자동완료 아님). 각 step 의 '자기 검진일'.
    const jpImportOwnDate =
      typeof caseData.jp_import_quarantine_date === 'string' &&
      caseData.jp_import_quarantine_date.length >= 10
        ? caseData.jp_import_quarantine_date.slice(0, 10)
        : null
    // 나라별 검역 step(quarantine:<field>)의 '자기 검역일' — 태국 수입·수출검역 등.
    const quarantineOwnDate =
      quarantineField &&
      typeof caseData[quarantineField] === 'string' &&
      (caseData[quarantineField] as string).length >= 10
        ? (caseData[quarantineField] as string).slice(0, 10)
        : null
    const jpExportVisitOwnDate =
      typeof caseData.jp_export_quarantine_visit_date === 'string' &&
      caseData.jp_export_quarantine_visit_date.length >= 10
        ? caseData.jp_export_quarantine_visit_date.slice(0, 10)
        : null
    const krImportOwnDate =
      typeof caseData.kr_import_quarantine_date === 'string' &&
      caseData.kr_import_quarantine_date.length >= 10
        ? caseData.kr_import_quarantine_date.slice(0, 10)
        : null
    // vet-visit 는 새 모델(완료 = 서류 모두 ✓ 또는 '완료' 버튼) — '저장 = 완료' 가정의
    // PASSED_UNCONFIRMED_MSG 가 부적절해서 ownConfirmDate 에서 제외. 대신 situational 이
    // '받았습니다. 서류 체크리스트를 확인하세요' 로 안내.
    // 수입검역(도착·귀국)은 항공편 날짜를 ownConfirmDate 폴백으로 쓰지 않는다 — 항공편은
    // '미래 예정 배지'(importQuarantineUpcoming/krImportUpcoming) 전용이고, 지나면 그냥 배지가
    // 내려가야 한다(상세엔 완료 버튼이 없어 'PASSED_UNCONFIRMED_MSG = 완료 버튼 누르세요'가
    // 거짓이 됨). 따라서 ownConfirmDate 는 '고객이 직접 저장한 검역일'만 본다 — 그 저장분이
    // 도래·미확인일 때만 안내가 뜨고, 그땐 상세에 실제로 '완료' 버튼이 있어 문구가 맞는다.
    const ownConfirmDate =
      step.id === 'certificate-issue'
        ? krExportQuarantineDate
        : isJpImportQuarantine
          ? (jpImportOwnDate ?? quarantineOwnDate)
          : step.id === 'jp-export-quarantine-visit'
            ? (jpExportVisitOwnDate ?? jpExportReservationDate)
            : step.id === 'kr-import-quarantine'
              ? krImportOwnDate
              // 나라별 출국(수출) 검역(태국 등) — 자기 검역일만 (예약 fallback 앵커 없음).
              : quarantineField
                ? quarantineOwnDate
                : null
    // 예정일이 지났는데(예정일 다음날부터 — 당일은 제외) 아직 확인(done) 전 — '예정 [지난 날짜]'
    // 대신 안내 문구로 표시. 당일(예정일 == 오늘)엔 아직 '지났다'가 아니라 정상 안내로 둔다.
    const passedUnconfirmed = !done && !!ownConfirmDate && ownConfirmDate < today
    // 기록형(A부류) 카드 — 예정(*_scheduled)일이 지났는데(당일 제외) 아직 완료 전이면 목록
    // 카드에도 안내(RECORD_PASSED_MSG). 상세 화면의 안내 박스·'완료' 버튼과 짝(2026-07-24).
    // civ·감염병(호주 전용, 앱 미노출)은 _scheduled 분리 전이라 제외.
    const recordScheduledPassed =
      !done &&
      (() => {
        const passedStr = (key: string): boolean => {
          const v = caseData[key]
          return typeof v === 'string' && v.length >= 10 && v.slice(0, 10) < today
        }
        switch (step.id) {
          case 'microchip':
            return passedStr('microchip_implant_date_scheduled')
          case 'vet-visit':
            return passedStr('vet_visit_date_scheduled')
          case 'general-vaccine':
            return passedStr('general_vaccine_dates_scheduled')
          case 'external-parasite':
            return passedStr('external_parasite_dates_scheduled')
          case 'internal-parasite':
          case 'echinococcus-treatment':
            return passedStr('internal_parasite_dates_scheduled')
          case 'rabies-titer':
            // 단일카드국(추가 검사 카드가 없는 곳)은 추가 예정 키도 이 카드가 담당.
            return (
              passedStr('rabies_titer_scheduled') ||
              (!TITER_EXTRA_CARD_DESTINATIONS.includes(ctx.destinationKey ?? '') &&
                passedStr('rabies_titer_extra_scheduled'))
            )
          case 'rabies-titer-extra':
            return passedStr('rabies_titer_extra_scheduled')
          case 'rabies-vaccine-1':
          case 'rabies-vaccine-2':
          case 'rabies-vaccine-extra': {
            const sched = caseData.rabies_dates_scheduled
            return (
              Array.isArray(sched) &&
              sched.some((e) => {
                const d =
                  typeof e === 'string'
                    ? e.slice(0, 10)
                    : e && typeof e === 'object' && typeof (e as Record<string, unknown>).date === 'string'
                      ? ((e as Record<string, unknown>).date as string).slice(0, 10)
                      : ''
                return d.length >= 10 && d < today
              })
            )
          }
          default:
            return false
        }
      })()
    // 미완 step 의 타임라인 표시일 — step 의 직접 입력 필드(advance_notification_date 등)는
    // 비어있는데 earliest(다른 step 완료일 기준 계산값)만으로 '예정 [날짜]' 칩을 띄우면
    // 일정이 정해진 것처럼 오해됨. 따라서:
    //  - window 마감(출국 10일 이내 등): 구간 시작일을 박으면 그날 해야 할 것처럼 읽혀서 제외.
    //  - earliest 단독: '예정' 의미상 어긋나 제외 — '다음 할 일' 카드 본문(cardDesc)에서만 안내.
    // deadline 이 있고 window 가 아니면 그게 마감일 — '마감' 칩으로 표시.
    const fallbackDate = step.deadline && !step.deadline.window ? deadline : null
    // 백신·검사·구충(예정→도래→완료) 카드 — not-done 인데 미래 입력 날짜가 있으면 '예정 [날짜]' 칩.
    // (done 게이트로 미래=미완료가 됐으므로, 회귀 없이 예정 칩이 유지되도록 직접 surface.
    //  done 이면 max ≤ 오늘이라 datedUpcoming=null — done 분기와 충돌 없음.)
    const datedUpcoming = (() => {
      if (step.id === 'rabies-vaccine-1' || step.id === 'rabies-vaccine-2') {
        // 예정(미래) 회차는 rabies_dates_scheduled 에 있으므로 합친 뷰로 배지를 계산한다.
        // 1회 접종국 단일카드(rabies-vaccine-1)는 1·2·n차 목록 — 최신일 기준(general-vaccine 동일).
        const merged = mergeRabiesDatesRaw(caseData)
        if (
          step.id === 'rabies-vaccine-1' &&
          SINGLE_DOSE_RABIES_DESTINATIONS.includes(ctx.destinationKey ?? '')
        ) {
          const max = latestEntryDate(merged, 0)
          return max && max > today ? max : null
        }
        const i = step.id === 'rabies-vaccine-2' ? 1 : 0
        const slot = merged[i] as Record<string, unknown> | string | undefined
        const d =
          typeof slot === 'string'
            ? slot.slice(0, 10)
            : slot && typeof slot.date === 'string'
              ? slot.date.slice(0, 10)
              : ''
        return d.length >= 10 && d > today ? d : null
      }
      const arrKey: Record<string, string> = {
        'general-vaccine': 'general_vaccine_dates',
        'civ-vaccine': 'civ_dates',
        'infectious-disease-test': 'infectious_disease_records',
        'external-parasite': 'external_parasite_dates',
        'internal-parasite': 'internal_parasite_dates',
        'echinococcus-treatment': 'internal_parasite_dates',
      }
      const key = arrKey[step.id]
      if (!key) return null
      // 별도 예정 자리(<key>_scheduled) 우선 — 미래 회차를 기록 배열에서 뺐으므로 배지는
      // 여기서 읽는다. 아직 마이그레이션 안 된(배열에 미래가 남은) 데이터는 배열 최신 미래일로 폴백.
      const sched = caseData[`${key}_scheduled`]
      const schedDate =
        typeof sched === 'string' && sched.slice(0, 10) > today ? sched.slice(0, 10) : null
      const max = latestEntryDate(caseData[key], 0)
      return schedDate ?? (max && max > today ? max : null)
    })()
    const date = passedUnconfirmed || recordScheduledPassed
      ? null
      : isDeparture && !isJpImportQuarantine
      ? dep
      : isJpImportQuarantine
        ? (done ? resolveCompletedDate(step.done, caseRow) : null) ??
          quarantineStartUpcoming ??
          importQuarantineUpcoming
        : step.id === 'kr-import-quarantine'
          ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? krImportUpcoming
          : step.id === 'jp-export-quarantine-visit'
            ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? jpExportReservationDate
            : step.id === 'vet-visit'
              ? done
                ? resolveCompletedDate(step.done, caseRow)
                // 다른 백신·검사와 동일 — 미래 검진일이면 '예정 [날짜]' 칩, 도래(≤오늘) +
                // 미완료(예정 저장분이 지남)면 칩을 내려 plain 상태로(완료는 상세에서 '완료').
                : vetVisitDate && vetVisitDate <= today
                  ? null
                  : vetVisitDate
              : step.id === 'certificate-issue'
                ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? krExportQuarantineDate
                : step.id === 'jp-export-quarantine'
                  ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? jpExportApplicationDate
                  : step.id === 'microchip'
                    ? done
                      ? resolveCompletedDate(step.done, caseRow)
                      : microchipImplantDate && microchipImplantDate > today
                        ? microchipImplantDate
                        : null
                    : step.id === 'rabies-titer'
                      ? (done ? resolveCompletedDate(step.done, caseRow) : titerScheduledDate)
                    : step.id === 'rabies-vaccine-extra'
                      ? done
                        ? resolveCompletedDate(step.done, caseRow)
                        : rabiesExtraUpcomingDate && rabiesExtraUpcomingDate > today
                          ? rabiesExtraUpcomingDate
                          : null
                      : step.id === 'rabies-titer-extra'
                        ? done
                          ? resolveCompletedDate(step.done, caseRow)
                          : titerExtraUpcomingDate
                        : step.id === 'advance-notification'
                          ? done
                            ? resolveCompletedDate(step.done, caseRow)
                            : advanceUpcomingDate ?? fallbackDate
                          : step.id === 'import-permit'
                            ? done
                              ? resolveCompletedDate(step.done, caseRow)
                              : importPermitUpcomingDate ?? fallbackDate
                            : done
                              ? resolveCompletedDate(step.done, caseRow)
                              : (datedUpcoming ?? fallbackDate)
    // 칩 라벨 분기 — '마감 26·11·21' (단일 non-window 마감일이 표시 날짜인 경우) vs
    // '예정 …' (그 외 일정·이벤트·window 시작·기간 시작 등). 사전 신고처럼 deadline 자체가
    // 보호자의 행동 마감일일 때만 '마감'. window 마감(출국 10일 이내 검진 등)은 구간 시작이라 '예정' 유지.
    const dateLabel: '예정' | '마감' =
      !done &&
      !isDeparture &&
      !isJpImportQuarantine &&
      step.id !== 'kr-import-quarantine' &&
      step.deadline &&
      !step.deadline.window &&
      date === deadline
        ? '마감'
        : '예정'
    // 보조 문구의 기본값은 description 첫 문장(절차 설명).
    const summary = firstSentence(step.description)
    // 상황별 override — 데이터 상태로 desc/cardDesc 를 갈아끼울 수 있는 훅.
    // (예: 마이크로칩 한 필드만 채워진 상태 → 빠진 쪽 입력 요청.)
    const sit = step.situational?.(caseRow)
    // 전체 일정 리스트 보조 문구.
    //  - 완료(과거·오늘): step.doneSummary(과거형 narration)가 최우선 — situational 의
    //    미래형 리마인더가 완료 표시와 모순되지 않도록.
    //  - 완료(미래 — 예약 입력 상태): "받았습니다" 같은 과거형은 맞지 않으므로 미완료와
    //    동일한 안내 톤(situational/현재형) 사용.
    //    ⚠️ 단 **예약형(booked:)은 예외** — 예약·구매는 이미 끝난 일이라 날짜가 미래여도
    //    과거형이 맞다. 이 예외가 없으면 완료 체크가 붙은 카드에 "예약하세요"가 남는다
    //    (2026-07-28 계류시설 예약에서 사용자 지적).
    //  - 미완료: situational.desc 가 있으면 우선, 없으면 description 첫 문장(현재형 안내문).
    const isFutureDate = date != null && date > today
    const isBookedStep = typeof step.done === 'string' && step.done.startsWith('booked:')
    // 일본 수출검역 방문 — situational.desc 는 예약 날짜·시간(상세 '안내' 박스 + '다음 할 일'
    // 인라인 안내 전용)이다. 전체 일정 리스트 보조문구로 쓰면 '예정 [예약일]' 배지와 날짜가
    // 중복되고, 다른 검역 카드(배지 + 정적 설명)와도 어긋난다 — 리스트에선 정적 설명(summary)만.
    const listSit = step.id === 'jp-export-quarantine-visit' ? undefined : sit?.desc
    const desc = passedUnconfirmed
      ? PASSED_UNCONFIRMED_MSG
      : recordScheduledPassed
        ? RECORD_PASSED_MSG
        : done && (!isFutureDate || isBookedStep)
          ? (step.doneSummary ?? listSit ?? summary)
          : (listSit ?? summary)
    // 다음 할 일 카드 본문 — 날짜(earliest/deadline)가 있으면 step.cardLine
    // (미지정 시 설명 첫 문장)에 날짜 구문을 붙이고, 날짜가 없으면 설명 첫 문장만.
    // earliest("이후")가 deadline("까지"/window 구간)보다 우선: 보호자가 먼저 알아야 할 제약.
    // situational.cardDesc 가 있으면 모든 날짜 로직을 덮어쓴다.
    // (참고: recommended 는 일정 row 표시일만 영향 — 카드 본문은 마감 기준 유지.)
    const cardLine = step.cardLine ?? summary
    // 가능 시작일(earliest)이 이미 지났으면 날짜 조건은 무의미 — "2024년 …일 이후 접종하세요"
    // 같은 과거 날짜 노출을 막고 행동 문구만 남긴다(미래일 때만 "{날짜} 이후 …" 프리픽스).
    const upcomingEarliest = earliest && earliest > today ? earliest : null
    // 마감일이 이미 지났으면 "{과거 날짜}까지 …" 같은 모순 문구를 막고 행동 문구만 남긴다
    // (earliest 과거 처리와 동일 선례). window 는 구간 끝(deadlineEnd)이 미래면 아직 유효.
    const upcomingDeadline = deadline && deadline >= today ? deadline : null
    const cardDesc = passedUnconfirmed
      ? PASSED_UNCONFIRMED_MSG
      : recordScheduledPassed
      ? RECORD_PASSED_MSG
      : done
      ? undefined
      : (sit?.cardDesc
          ?? (upcomingEarliest
            ? `${formatKoreanDate(upcomingEarliest)} 이후 ${cardLine}`
            : deadline && deadlineEnd && deadlineEnd >= today
              ? `${formatKoreanDate(deadline)} ~ ${formatRangeEnd(deadline, deadlineEnd)} 사이에 ${cardLine}`
              : upcomingDeadline
                ? `${formatKoreanDate(upcomingDeadline)}까지 ${cardLine}`
                : deadline
                  ? cardLine
                  : summary))
    const failedChecks = failedByStep.get(step.id) ?? 0
    // 액션-완료 두 단계 step (수입 허가) — 신청은 됐지만 완료는 아직(situational 활성, !done)
    // 상태에선 우측 칩이 '안내' 톤으로 바뀌도록 infoChecks 1 추가. 이미 액션 한 번을 마친
    // 셈이라 '마감 …' / '예정' 만 보이면 어색. (출국 전 임상검사는 dated-confirm 모델로 통일돼
    // situational 이 없으므로 제외 — 서류는 별도 '서류 체크리스트' 단계로 분리.)
    const isAwaitingStep =
      step.id === 'import-permit' &&
      !done &&
      !!sit
    // '지난 예정'(검역 5단계 passedUnconfirmed / 기록형 recordScheduledPassed)도 '안내' 채널 —
    // 칩('안내')은 설명문 숨김 설정과 무관하게 항상 보인다(2026-07-24 사용자 확정: 채널 통일).
    const scheduledPassed = passedUnconfirmed || recordScheduledPassed
    const infoChecks =
      (infoByStep.get(step.id) ?? 0) + (isAwaitingStep ? 1 : 0) + (scheduledPassed ? 1 : 0)
    // 만료 상태의 백신(광견병 단일카드·종합백신)은 일본 추가백신처럼 '안내'로 배치한다 —
    // situational 안내가 있고 미완료면 advisory 취급(다음 할 일 대신 별도 안내 카드, 일정 row
    // 안내 톤). 미접종이면 situational 이 undefined 라 일반 '다음 할 일'(접종하세요)로 노출.
    // 만료(advisory 마커)일 때만 안내로 강등 — 당일/지남 '완료확인' situational 은 advisory 가
    // 아니므로 '다음 할 일'에 그대로 남는다(도래일에 가장 actionable 한 항목이 묻히지 않게).
    const isExpiryVaccineState =
      (step.id === 'rabies-vaccine-1' || step.id === 'general-vaccine') && !done && sit?.advisory === true
    const isAdvisory = step.advisoryOnly === true || isExpiryVaccineState
    // 안내 카드 본문 — info check 메시지가 있으면 그걸, 없으면 advisory step 의 desc(상황별),
    // 신청-완료 awaiting 은 situational desc 자체가 안내문.
    const infoMessage =
      infoMessageByStep.get(step.id) ??
      (isAdvisory && !done ? desc : undefined) ??
      (isAwaitingStep ? sit?.desc : undefined) ??
      // '지난 예정' 안내 카드 본문 — 검역 5단계·기록형 각자의 문구(desc 교체와 동일 문구).
      (passedUnconfirmed ? PASSED_UNCONFIRMED_MSG : recordScheduledPassed ? RECORD_PASSED_MSG : undefined)
    // procedure-check 주의가 있으면 첫 메시지를 보조줄로 노출 — done 이어도 ⚠ 로 바뀐다
    // (timeline 우선순위 주의 > done). 데이터·완료 상태 자체는 보존.
    const failedMsg = failedMessageByStep.get(step.id)
    return {
      id: step.id,
      label: step.title,
      short: step.shortLabel,
      date,
      dateLabel,
      state: done ? 'done' : 'upcoming',
      // 설명문 숨김 토글: 켜져 있으면(표시 OFF) 일정 리스트의 보조 줄을 전부 감춘다 —
      // 주의(failedMsg)·상태 안내(situational)도 포함(2026-07-12 사용자 확정). 주의의
      // 존재 자체는 배지 아이콘 + 우측 '주의' 라벨 + 히어로 날씨 칩이 항상 알리고,
      // 내용은 warnMessage(칩·바텀시트)와 상세 페이지가 담당한다.
      desc: hideStepDescriptions
        ? undefined
        : failedMsg
          ? failedMsg
          : done && !isFutureDate
            ? // 완료된 절차(과거·오늘)는 설명문 숨김 — doneSummary 과거형 narration("…했습니다")은
              // 제목을 반복할 뿐 정보가 없다. 미래 예약(done+future)은 아래 분기로 현재형 안내 유지.
              undefined
            : desc,
      cardDesc,
      failedChecks: failedChecks > 0 ? failedChecks : undefined,
      infoChecks: infoChecks > 0 ? infoChecks : undefined,
      advisory: isAdvisory ? true : undefined,
      infoMessage,
      warnMessage: failedMsg,
      inProgress:
        titerInProgress ||
        titerExtraInProgress ||
        advanceInProgress ||
        jpExportInProgress ||
        importPermitInProgress ||
        parasiteInProgress
          ? true
          : undefined,
      // 서류 체크리스트 행은 step 상세가 아니라 서류 페이지(/docs)로 이동.
      linkToDocs: step.id === 'document-checklist' ? true : undefined,
    }
  })

  // 두 lane 의 첫 upcoming 을 각각 'current' 로 승격.
  //  - main lane: 출국 준비 흐름 (마이크로칩 → 백신 → 항체 → 항공권 → 사전 신고 → 임상검사 → …).
  //  - return lane: 왕복의 귀국편 절차 (수출검역 신청 등) — step.nonBlocking 으로 마킹.
  //    main 흐름과 평행이라 main 의 다음 단계를 가리지 않고 동시 노출하되, 자기 lane 의
  //    후속 step(임상검사 등 main 의 것)까지 끌어올리지는 않는다.
  // advisoryOnly step (추가 백신·추가 검사 등 미래 만료 대비 reminder) 은 본 흐름의
  // 다음 단계를 가리지 않도록 두 lane 모두에서 제외.
  const nonBlockingIds = new Set(applicableSteps.filter((s) => s.nonBlocking).map((s) => s.id))
  // advisory 배치는 동적 — static advisoryOnly(추가백신·추가검사) + 만료 상태 백신(stage.advisory).
  // 이들은 '다음 할 일'을 차지하지 않고 별도 '안내' 카드로 빠진다(일본 추가백신과 동일 위치).
  const advisoryIds = new Set(stages.filter((s) => s.advisory).map((s) => s.id))
  const concurrentIds = new Set(applicableSteps.filter((s) => s.concurrent).map((s) => s.id))
  const mainIdx = stages.findIndex(
    (s) => s.state === 'upcoming' && !nonBlockingIds.has(s.id) && !advisoryIds.has(s.id),
  )
  if (mainIdx >= 0) {
    stages[mainIdx].state = 'current'
    // mainIdx 직후의 concurrent step(순서 의존 없는 병렬 접종 — 광견병·종합백신)도 함께 current.
    // 사이에 비-concurrent 미완료 step 이 있으면 멈춘다(그 step 이 선행). done·nonBlocking·
    // advisory(만료 백신 포함) 는 건너뛴다.
    for (let i = mainIdx + 1; i < stages.length; i++) {
      const s = stages[i]
      if (s.state !== 'upcoming') continue
      if (nonBlockingIds.has(s.id) || advisoryIds.has(s.id)) continue
      if (concurrentIds.has(s.id)) {
        s.state = 'current'
        continue
      }
      break
    }
  }
  // return lane step 별 노출 조건 — 충족돼야 다음 할 일에 올림.
  //
  // 일본 수출검역 신청은 **사전 신고와 함께, 한국에서, 출국 전에** 하는 절차다(사전 신고 카드
  // 문구 "왕복 일정이면 일본 수출 검역 신청도 함께 하세요"와 짝). 실제 선행 조건이 둘:
  //   ① 출국+귀국 항공권 — has-flight-date. 왕복의 이 시그널은 출국편(entry/departure)과
  //      귀국일(return_date)을 모두 요구한다. return_date 단독으로 판정하면 출국편 없이
  //      귀국일만 남은 잔재(과거 여정 미삭제 값)에도 떠버린다(누수 버그).
  //   ② 광견병 항체 검사 완료 — has-titer-entry. 채혈만 한 '진행 중' 상태는 done 이 아니다.
  //
  // ②가 빠져 있어, 보호자가 여행 날짜를 미리 넣어두면 **항체 검사 중인데 수출검역 신청이
  // 사전 신고보다 먼저** 다음 할 일로 떴다(2026-07-19 사용자 지적·재현 확인). 아직 신청할 수
  // 없는 일을 띄우고 순서도 뒤집혀 보였다.
  const RETURN_LANE_READY: Record<string, (c: typeof caseRow) => boolean> = {
    'jp-export-quarantine': (c) =>
      resolveDone('has-flight-date', c) && resolveDone('has-titer-entry', c),
  }
  const returnIdx = stages.findIndex(
    (s) => s.state === 'upcoming' && nonBlockingIds.has(s.id),
  )
  if (returnIdx >= 0) {
    const check = RETURN_LANE_READY[stages[returnIdx].id]
    const ready = !check || check(caseRow)
    if (ready) stages[returnIdx].state = 'current'
  }
  // 폴백 — 두 lane 모두 비어 있고 advisory 만 남았다면 (예: 항체 검사도 끝났는데
  // 추가 백신만 만료 임박) 가장 앞의 advisory 를 다음 할 일로 노출. 보호자가 행동할 게
  // 그것뿐일 때까지 가려두면 화면이 공백처럼 보인다.
  if (stages.every((s) => s.state !== 'current')) {
    const firstAdvisory = stages.findIndex(
      (s) => s.state === 'upcoming' && advisoryIds.has(s.id),
    )
    if (firstAdvisory >= 0) stages[firstAdvisory].state = 'current'
  }
  // 여정 완료 — 마지막 절차가 끝났는지(has-arrived: 왕복=한국 수입검역 / 편도=일본 수입검역·도착).
  // 옛 journey-complete 마커 step 의 done 시그널을 그대로 재사용. 완료면 timeline-calm 이
  // '다음 할 일' 자리에 완료 배너를 띄우고 그 외 카드는 가린다.
  const journeyComplete = resolveDone('has-arrived', caseRow)
  const journeyCompleteDate = journeyComplete ? resolveCompletedDate('has-arrived', caseRow) : null
  const nextStages = stages.filter((s) => s.state === 'current')
  // 일본 수출검역 방문 step 이 '다음 할 일'이 됐을 때만, 신청 step 에서 입력한 예약 날짜·시간
  // 안내(situational.desc)를 카드 인라인 '안내'로 승격한다(infoMessage/infoChecks 보강).
  // 방문이 아직 멀면(current 아님) 별도 '안내' 카드로 조기 노출되지 않도록 current 에서만 처리.
  // step 상세 화면의 '안내' 박스는 situational.desc 로 이미 별도 노출된다.
  const jpExportVisitStage = nextStages.find((s) => s.id === 'jp-export-quarantine-visit')
  // 예약 날짜·시간 안내는 situational.desc 에서 직접 읽어 '다음 할 일' 인라인 안내로 승격한다.
  // (리스트 보조문구 desc 는 정적 설명으로 분리됐으므로 그걸 재사용하지 않는다.) 예약일이 지나
  // 미확인(passedUnconfirmed)이면 desc 가 '지났어요, 저장' 안내라 승격하지 않는다(지난 예약 숨김).
  if (jpExportVisitStage && jpExportVisitStage.desc !== PASSED_UNCONFIRMED_MSG) {
    const d = (caseRow.data ?? {}) as Record<string, unknown>
    const hasReservation =
      typeof d.jp_export_quarantine_date === 'string' && d.jp_export_quarantine_date.length >= 10
    const reservationDesc = applicableSteps
      .find((s) => s.id === 'jp-export-quarantine-visit')
      ?.situational?.(caseRow)?.desc
    if (hasReservation && reservationDesc) {
      jpExportVisitStage.infoMessage = reservationDesc
      jpExportVisitStage.infoChecks = (jpExportVisitStage.infoChecks ?? 0) + 1
    }
  }
  const totalFailedChecks = stages.reduce((sum, s) => sum + (s.failedChecks ?? 0), 0)
  const totalInfoChecks = stages.reduce((sum, s) => sum + (s.infoChecks ?? 0), 0)

  return {
    pet: { name: caseRow.pet_name ?? '반려동물', nameEn: caseRow.pet_name_en },
    trip: {
      fromCity: '한국',
      toCity: ctx.destinationToken ?? caseRow.destination ?? '—',
      departureDate: dep,
      daysLeft,
      tripType: ctx.tripType,
      prep,
      elapsedDays,
    },
    stages,
    nextStages,
    journeyComplete,
    journeyCompleteDate,
    totalFailedChecks,
    totalInfoChecks,
    caseAlerts,
  }
}
