import type { CaseRow } from '@petmove/domain'
import {
  JOURNEY_STEP_CATALOG,
  SINGLE_DOSE_RABIES_DESTINATIONS,
  buildCaseJourneyContext,
  findStepForCheck,
  getStepsForCase,
  resolveCompletedDate,
  resolveDone,
  runChecksForCase,
  todayKst,
  type StepDefinition,
} from '@petmove/domain'
import { activeDestinationView } from '@/lib/cases/active-destination'

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
  pet: { name: string }
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
 * 'departure' 는 출국일 — 미입력 시 항공편 입국일(entry_date)로 폴백 (한일 노선은 출국=입국 당일).
 */
function deadlineAnchorDate(step: StepDefinition, caseRow: CaseRow): string | null {
  const dl = step.deadline
  if (!dl) return null
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const entry = typeof data.entry_date === 'string' ? data.entry_date : ''
  let base = ''
  if (dl.anchor === 'departure') base = caseRow.departure_date || entry
  else if (dl.anchor === 'entry') base = entry
  else if (dl.anchor === 'created') base = caseRow.created_at ?? ''
  return base.length >= 10 ? base.slice(0, 10) : null
}

/** step 의 deadline 표시일 — 기준일에서 daysBefore 만큼 당김. window 면 구간 시작일. */
function deadlineDate(step: StepDefinition, caseRow: CaseRow): string | null {
  if (!step.deadline) return null
  const base = deadlineAnchorDate(step, caseRow)
  if (!base) return null
  const d = new Date(base + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() - step.deadline.daysBefore)
  return d.toISOString().slice(0, 10)
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
  // 1회 접종국의 광견병 만료 룰 — '추가 백신' 카드 situational 이 같은 조건을 안내 (일본 모델).
  'th.rabies-not-expired-on-arrival',
  'ph.rabies-not-expired-on-arrival',
  'eu.rabies-valid-until-on-departure',
])

export function buildJourney(
  caseRowInput: CaseRow,
  activeDestination?: string | null,
): JourneyData {
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
    const all = runChecksForCase(ctx.destinationKey, { caseRow, destination: caseRow.destination })
    for (const { check, result } of all) {
      if (result.ok) continue
      let stepId = findStepForCheck(check.id)
      if (!stepId) {
        // advisory step(추가 백신·추가 검사)이 같은 조건을 안내로 처리 — 상단 주의로 중복 노출 안 함.
        if (ADVISORY_DEFERRED_CHECKS.has(check.id)) continue
        // step 에 매핑되지 않은 non-info = case-level 결격. 별도 영역에 모은다.
        if (check.severity !== 'info') {
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
    // 수입검역(= departure 의 목적지 override — 일본 'has-jp-import-quarantine' 또는 그 외
    // 나라 quarantine: 시그널)은 검역일로 완료·날짜를 잡으므로 departure 의 '출국일'
    // shortcut 에서 제외 — 일반 경로(done→완료일)를 탄다.
    const isJpImportQuarantine =
      isDeparture &&
      ((step.inputs ?? []).some((i) => i.key === 'jp_import_quarantine_date') ||
        quarantineField !== null)
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
    const vetVisitDate =
      typeof caseData.vet_visit_date === 'string' && caseData.vet_visit_date.length >= 10
        ? caseData.vet_visit_date.slice(0, 10)
        : null
    // 마이크로칩 시술일이 미래로 입력된 경우 — done 시그널이 '오늘 이전'만 완료로 인정하므로
    // 미완료지만 보호자가 예약해둔 셈이라 '예정 [날짜]' 칩으로 노출(임상검사와 동일 패턴).
    const microchipImplantDate =
      typeof caseData.microchip_implant_date === 'string' &&
      caseData.microchip_implant_date.length >= 10
        ? caseData.microchip_implant_date.slice(0, 10)
        : null
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
            caseData.rabies_dates,
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
    // 추가 검사 — 입국일 이전에 예약한(미래) 채혈이 있으면 '예정 [날짜]' 칩. 입국 후 채혈은
    // 그 입국을 보증 못 하므로 제외(무의미한 미래 채혈을 예정으로 오인 노출하지 않음).
    const titerExtraUpcomingDate = (() => {
      if (step.id !== 'rabies-titer-extra' || !Array.isArray(caseData.rabies_titer_records))
        return null
      const entryBound =
        (typeof caseData.entry_date === 'string' && caseData.entry_date.length >= 10
          ? caseData.entry_date.slice(0, 10)
          : '') ||
        (typeof dep === 'string' && dep.length >= 10 ? dep.slice(0, 10) : '')
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
    // 자기 검진일이 비어 있으면 항공편 기준 예정일(일본 도착=입국, 귀국=return, 수출검역
    // 예약일)을 fallback 으로. 그래야 검역일을 아직 저장 안 했어도 그 예정일이 지나면
    // '예정 [지난 날짜]' 가 아니라 '지났어요, 저장하세요' 안내로 전환된다.
    const ownConfirmDate =
      step.id === 'certificate-issue'
        ? krExportQuarantineDate
        : isJpImportQuarantine
          ? (jpImportOwnDate ?? quarantineOwnDate ?? flightEntryDate)
          : step.id === 'jp-export-quarantine-visit'
            ? (jpExportVisitOwnDate ?? jpExportReservationDate)
            : step.id === 'kr-import-quarantine'
              ? (krImportOwnDate ?? flightReturnDate)
              // 나라별 출국(수출) 검역(태국 등) — 자기 검역일만 (예약 fallback 앵커 없음).
              : quarantineField
                ? quarantineOwnDate
                : null
    // 예정일이 지났는데(예정일 다음날부터 — 당일은 제외) 아직 확인(done) 전 — '예정 [지난 날짜]'
    // 대신 안내 문구로 표시. 당일(예정일 == 오늘)엔 아직 '지났다'가 아니라 정상 안내로 둔다.
    const passedUnconfirmed = !done && !!ownConfirmDate && ownConfirmDate < today
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
        // 1회 접종국 단일카드(rabies-vaccine-1)는 1·2·n차 목록 — 최신일 기준(general-vaccine 동일).
        if (
          step.id === 'rabies-vaccine-1' &&
          SINGLE_DOSE_RABIES_DESTINATIONS.includes(ctx.destinationKey ?? '')
        ) {
          const max = latestEntryDate(caseData.rabies_dates, 0)
          return max && max > today ? max : null
        }
        const i = step.id === 'rabies-vaccine-2' ? 1 : 0
        const arr = Array.isArray(caseData.rabies_dates) ? caseData.rabies_dates : []
        const slot = arr[i] as Record<string, unknown> | undefined
        const d = slot && typeof slot.date === 'string' ? slot.date.slice(0, 10) : ''
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
    const date = passedUnconfirmed
      ? null
      : isDeparture && !isJpImportQuarantine
      ? dep
      : isJpImportQuarantine
        ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? flightEntryDate
        : step.id === 'kr-import-quarantine'
          ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? flightReturnDate
          : step.id === 'jp-export-quarantine-visit'
            ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? jpExportReservationDate
            : step.id === 'vet-visit'
              ? done
                ? resolveCompletedDate(step.done, caseRow)
                // 검진일 도래 + 미완료 = '받았습니다, 서류 확인' 안내 상태 → 칩 숨김(date=null),
                // situational desc 로 표현. 미래 검진일이면 그대로 '예정 [날짜]'.
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
    //  - 미완료: situational.desc 가 있으면 우선, 없으면 description 첫 문장(현재형 안내문).
    const isFutureDate = date != null && date > today
    const desc = passedUnconfirmed
      ? PASSED_UNCONFIRMED_MSG
      : done && !isFutureDate
        ? (step.doneSummary ?? sit?.desc ?? summary)
        : (sit?.desc ?? summary)
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
    // 액션-완료 두 단계 step (사전 신고·일본 수출검역 신청·출국 전 임상검사) — 신청/검진은
    // 됐지만 완료는 아직(situational 활성, !done) 상태에선 우측 칩이 '안내' 톤으로 바뀌도록
    // infoChecks 1 추가. 이미 액션 한 번을 마친 셈이라 '마감 …' / '예정' 만 보이면 어색.
    // vet-visit: 검진일 도래 + 서류 미완(= situational '받았습니다. 서류 확인') 상태에만 해당 —
    // 미래 검진일이면 situational 이 undefined 라 그대로 '예정 [날짜]' 칩 유지.
    const isAwaitingStep =
      (step.id === 'advance-notification' ||
        step.id === 'jp-export-quarantine' ||
        step.id === 'import-permit' ||
        step.id === 'vet-visit' ||
        step.id === 'rabies-titer') &&
      !done &&
      !!sit
    const infoChecks = (infoByStep.get(step.id) ?? 0) + (isAwaitingStep ? 1 : 0)
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
      (isAwaitingStep ? sit?.desc : undefined)
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
      desc: failedMsg ?? desc,
      cardDesc,
      failedChecks: failedChecks > 0 ? failedChecks : undefined,
      infoChecks: infoChecks > 0 ? infoChecks : undefined,
      advisory: isAdvisory ? true : undefined,
      infoMessage,
      inProgress: titerInProgress ? true : undefined,
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
  // 수출검역 신청은 귀국 항공편이 정해진 뒤에야 예약 가능 — 기준은 '항공권 구매 완료'(has-flight-date).
  // 왕복의 has-flight-date 는 출국편(entry/departure) + 귀국일(return_date)을 모두 요구한다.
  // return_date 단독으로 판정하면, 출국편 없이 귀국일만 남은 잔재(과거 여정에서 안 지워진
  // return_date 등 — 논리적으로 불가능한 상태)에도 수출검역이 '예정'으로 떠버린다(누수 버그).
  // 출국편까지 갖춰진 정상 예약일 때만 노출하도록 has-flight-date 로 게이트한다.
  const RETURN_LANE_READY: Record<string, (c: typeof caseRow) => boolean> = {
    'jp-export-quarantine': (c) => resolveDone('has-flight-date', c),
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
  // desc 가 예약 안내(situational)일 때만 승격 — 예약일이 지나 미확인(passedUnconfirmed)이면
  // desc 가 '지났어요, 저장' 안내로 바뀌므로 그땐 승격하지 않는다(지난 예약을 안내로 띄우지 않음).
  if (jpExportVisitStage?.desc && jpExportVisitStage.desc !== PASSED_UNCONFIRMED_MSG) {
    const d = (caseRow.data ?? {}) as Record<string, unknown>
    const hasReservation =
      typeof d.jp_export_quarantine_date === 'string' && d.jp_export_quarantine_date.length >= 10
    if (hasReservation) {
      jpExportVisitStage.infoMessage = jpExportVisitStage.desc
      jpExportVisitStage.infoChecks = (jpExportVisitStage.infoChecks ?? 0) + 1
    }
  }
  const totalFailedChecks = stages.reduce((sum, s) => sum + (s.failedChecks ?? 0), 0)
  const totalInfoChecks = stages.reduce((sum, s) => sum + (s.infoChecks ?? 0), 0)

  return {
    pet: { name: caseRow.pet_name ?? '반려동물' },
    trip: {
      fromCity: '한국',
      toCity: ctx.destinationToken ?? caseRow.destination ?? '—',
      departureDate: dep,
      daysLeft,
      tripType: ctx.tripType,
      prep,
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
