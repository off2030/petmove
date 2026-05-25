import type { CaseRow } from '@petmove/domain'
import {
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  findStepForCheck,
  getStepsForCase,
  resolveCompletedDate,
  resolveDone,
  resolveStepForDestination,
  runChecksForCase,
  type StepDefinition,
} from '@petmove/domain'

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
}

export interface JourneyData {
  pet: { name: string }
  trip: {
    fromCity: string
    toCity: string
    departureDate: string | null
    daysLeft: number | null
    tripType: 'round' | 'one_way'
  }
  stages: JourneyStage[]
  /**
   * state==='current' 인 스테이지들 — '다음 할 일' 카드로 노출.
   * 보통 1개지만, non-blocking step(예: 수출검역) 뒤엔 후속 step 도 동시에 current 가 되어 2개 이상.
   * 빈 배열이면 전체 완료.
   */
  nextStages: JourneyStage[]
  /** 전체 stage 의 failedChecks 합 — 상단 '주의' 배너에 사용. */
  totalFailedChecks: number
  /** 전체 stage 의 infoChecks 합 — 상단 '안내' 배너에 사용. */
  totalInfoChecks: number
}

function todayKst(): string {
  return new Date().toISOString().slice(0, 10)
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

export function buildJourney(caseRow: CaseRow): JourneyData {
  const ctx = buildCaseJourneyContext(caseRow)
  const today = todayKst()
  const dep = caseRow.departure_date
  const daysLeft = dep ? daysBetween(today, dep) : null

  const applicableSteps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)

  // procedure-check 결과를 step 단위로 집계. severity 'info' 는 차분한 '안내'
  // 톤으로 분리, 그 외(blocker/warning)는 '주의'. destinationKey 없으면 빈 맵.
  const failedByStep = new Map<string, number>()
  const infoByStep = new Map<string, number>()
  const infoMessageByStep = new Map<string, string>()
  if (ctx.destinationKey) {
    const all = runChecksForCase(ctx.destinationKey, { caseRow })
    for (const { check, result } of all) {
      if (result.ok) continue
      let stepId = findStepForCheck(check.id)
      if (!stepId) continue
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
    }
  }

  const stages: JourneyStage[] = applicableSteps.map((rawStep) => {
    // 목적지별 override(주로 description/title) 적용 — base catalog 는 그대로,
    // ctx.destinationKey 가 STEP_DESTINATION_OVERRIDES 에 매칭되면 머지.
    const step = resolveStepForDestination(rawStep, ctx.destinationKey)
    const done = resolveDone(step.done, caseRow)
    // departure step 은 출국일 자체. 그 외에는:
    //  - done → resolveCompletedDate (없으면 dash 로 fallback)
    //  - upcoming → deadline 권장일, 없으면 earliest 가능일
    const isDeparture = step.id === 'departure'
    // 일본 수입검역(= departure 의 일본 override)은 검역일로 완료·날짜를 잡으므로
    // departure 의 '출국일' shortcut 에서 제외 — 일반 경로(done→완료일)를 탄다.
    const isJpImportQuarantine =
      isDeparture && (step.inputs ?? []).some((i) => i.key === 'jp_import_quarantine_date')
    const deadline = deadlineDate(step, caseRow)
    const earliest = earliestDate(step, caseRow)
    // window 마감이면 구간 끝(기준일) — 카드에 'A ~ B' 구간으로 표시.
    const deadlineEnd = step.deadline?.window ? deadlineAnchorDate(step, caseRow) : null
    // 항공권 dates → 검역 step 표시일. 한일 노선은 도착·검역이 같은 날이라
    // entry_date(출국 항공편) = 일본 수입검역, return_date(귀국 항공편) = 한국 수입검역.
    // (일본 수출 동물검역은 예약일이 따로 잡혀 항공편 날짜와 분리 — 반영 제외.)
    const caseData = (caseRow.data ?? {}) as Record<string, unknown>
    const flightEntryDate =
      typeof caseData.entry_date === 'string' && caseData.entry_date.length >= 10
        ? caseData.entry_date.slice(0, 10)
        : null
    const flightReturnDate =
      typeof caseData.return_date === 'string' && caseData.return_date.length >= 10
        ? caseData.return_date.slice(0, 10)
        : null
    // 미완 step 의 타임라인 표시일 — step 의 직접 입력 필드(advance_notification_date 등)는
    // 비어있는데 earliest(다른 step 완료일 기준 계산값)만으로 '예정 [날짜]' 칩을 띄우면
    // 일정이 정해진 것처럼 오해됨. 따라서:
    //  - window 마감(출국 10일 이내 등): 구간 시작일을 박으면 그날 해야 할 것처럼 읽혀서 제외.
    //  - earliest 단독: '예정' 의미상 어긋나 제외 — '다음 할 일' 카드 본문(cardDesc)에서만 안내.
    // deadline 이 있고 window 가 아니면 그게 마감일 — '마감' 칩으로 표시.
    const fallbackDate = step.deadline && !step.deadline.window ? deadline : null
    const date = isDeparture && !isJpImportQuarantine
      ? dep
      : isJpImportQuarantine
        ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? flightEntryDate
        : step.id === 'kr-import-quarantine'
          ? (done ? resolveCompletedDate(step.done, caseRow) : null) ?? flightReturnDate
          : done
            ? resolveCompletedDate(step.done, caseRow)
            : fallbackDate
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
    const desc = done && !isFutureDate
      ? (step.doneSummary ?? sit?.desc ?? summary)
      : (sit?.desc ?? summary)
    // 다음 할 일 카드 본문 — 날짜(earliest/deadline)가 있으면 step.cardLine
    // (미지정 시 설명 첫 문장)에 날짜 구문을 붙이고, 날짜가 없으면 설명 첫 문장만.
    // earliest("이후")가 deadline("까지"/window 구간)보다 우선: 보호자가 먼저 알아야 할 제약.
    // situational.cardDesc 가 있으면 모든 날짜 로직을 덮어쓴다.
    // (참고: recommended 는 일정 row 표시일만 영향 — 카드 본문은 마감 기준 유지.)
    const cardLine = step.cardLine ?? summary
    const cardDesc = done
      ? undefined
      : (sit?.cardDesc
          ?? (earliest
            ? `${formatKoreanDate(earliest)} 이후 ${cardLine}`
            : deadline && deadlineEnd
              ? `${formatKoreanDate(deadline)} ~ ${formatRangeEnd(deadline, deadlineEnd)}에 ${cardLine}`
              : deadline
                ? `${formatKoreanDate(deadline)}까지 ${cardLine}`
                : summary))
    const failedChecks = failedByStep.get(step.id) ?? 0
    const infoChecks = infoByStep.get(step.id) ?? 0
    const isAdvisory = step.advisoryOnly === true
    // 안내 카드 본문 — info check 메시지가 있으면 그걸, 없으면 advisory step 의 desc(상황별).
    const infoMessage =
      infoMessageByStep.get(step.id) ?? (isAdvisory && !done ? desc : undefined)
    return {
      id: step.id,
      label: step.title,
      short: step.shortLabel,
      date,
      dateLabel,
      state: done ? 'done' : 'upcoming',
      desc,
      cardDesc,
      failedChecks: failedChecks > 0 ? failedChecks : undefined,
      infoChecks: infoChecks > 0 ? infoChecks : undefined,
      advisory: isAdvisory ? true : undefined,
      infoMessage,
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
  const advisoryOnlyIds = new Set(applicableSteps.filter((s) => s.advisoryOnly).map((s) => s.id))
  const mainIdx = stages.findIndex(
    (s) => s.state === 'upcoming' && !nonBlockingIds.has(s.id) && !advisoryOnlyIds.has(s.id),
  )
  if (mainIdx >= 0) stages[mainIdx].state = 'current'
  // return lane step 별 노출 조건 — 충족돼야 다음 할 일에 올림.
  // 수출검역 신청은 귀국 항공편이 정해진 뒤에야 예약 가능 — return_date 입력 시점부터 노출.
  // (entry_date 만 입력된 출국편 단독 상태에선 step 자체는 applicable 하지만 다음 할 일은 X.)
  const RETURN_LANE_READY: Record<string, (c: typeof caseRow) => boolean> = {
    'jp-export-quarantine': (c) => {
      const data = (c.data ?? {}) as Record<string, unknown>
      return typeof data.return_date === 'string' && (data.return_date as string).length >= 10
    },
  }
  const returnIdx = stages.findIndex(
    (s) => s.state === 'upcoming' && nonBlockingIds.has(s.id),
  )
  if (returnIdx >= 0) {
    const check = RETURN_LANE_READY[stages[returnIdx].id]
    const ready = !check || check(caseRow)
    if (ready) stages[returnIdx].state = 'current'
  }
  // 폴백 — 두 lane 모두 비어 있고 advisory 만 남았다면 (예: 항체검사도 끝났는데
  // 추가 백신만 만료 임박) 가장 앞의 advisory 를 다음 할 일로 노출. 보호자가 행동할 게
  // 그것뿐일 때까지 가려두면 화면이 공백처럼 보인다.
  if (stages.every((s) => s.state !== 'current')) {
    const firstAdvisory = stages.findIndex(
      (s) => s.state === 'upcoming' && advisoryOnlyIds.has(s.id),
    )
    if (firstAdvisory >= 0) stages[firstAdvisory].state = 'current'
  }
  const nextStages = stages.filter((s) => s.state === 'current')
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
    },
    stages,
    nextStages,
    totalFailedChecks,
    totalInfoChecks,
  }
}
