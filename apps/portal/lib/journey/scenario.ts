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
  state: StageState
  /** 전체 일정 리스트 보조 줄. done→완료 문구, 그 외→행동 문구. */
  desc?: string
  /** 다음 할 일 카드 본문 — 날짜 구문 + 행동 문구. 미완료 step 에만 채워짐. */
  cardDesc?: string
  /** 이 step 의 ok=false 체크 중 '주의'(severity 'info' 제외) 개수. */
  failedChecks?: number
  /** 이 step 의 ok=false 체크 중 '안내'(severity 'info') 개수. */
  infoChecks?: number
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
  /** state==='current' 인 첫 스테이지. 없으면 null (= 전체 완료). */
  nextStage: JourneyStage | null
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

/** step 의 deadline 으로부터 표시용 date 문자열 계산 (없으면 null). */
function deadlineDate(step: StepDefinition, caseRow: CaseRow): string | null {
  if (!step.deadline) return null
  const dep = caseRow.departure_date
  if (step.deadline.anchor === 'departure' && dep) {
    const d = new Date(dep + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - step.deadline.daysBefore)
    return d.toISOString().slice(0, 10)
  }
  if (step.deadline.anchor === 'entry') {
    // 일본 입국일 = 항공편 entry_date. 출국일과 별개 — '입국 N일 전' 마감 계산에 사용.
    const data = (caseRow.data ?? {}) as Record<string, unknown>
    const entry = typeof data.entry_date === 'string' ? data.entry_date : null
    if (entry && entry.length >= 10) {
      const d = new Date(entry.slice(0, 10) + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - step.deadline.daysBefore)
      return d.toISOString().slice(0, 10)
    }
  }
  if (step.deadline.anchor === 'created') {
    const d = new Date(caseRow.created_at)
    d.setUTCDate(d.getUTCDate() - step.deadline.daysBefore)
    return d.toISOString().slice(0, 10)
  }
  return null
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
  if (ctx.destinationKey) {
    const all = runChecksForCase(ctx.destinationKey, { caseRow })
    for (const { check, result } of all) {
      if (result.ok) continue
      const stepId = findStepForCheck(check.id)
      if (!stepId) continue
      const bucket = check.severity === 'info' ? infoByStep : failedByStep
      bucket.set(stepId, (bucket.get(stepId) ?? 0) + 1)
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
    const deadline = deadlineDate(step, caseRow)
    const earliest = earliestDate(step, caseRow)
    const date = isDeparture
      ? dep
      : done
        ? resolveCompletedDate(step.done, caseRow)
        : (deadline ?? earliest)
    // 보조 문구의 기본값은 description 첫 문장(절차 설명).
    const summary = firstSentence(step.description)
    // 전체 일정 리스트 보조 문구 — 미완료 step 만. 완료 step 은 체크 표시로 충분.
    const desc = done ? undefined : summary
    // 다음 할 일 카드 본문 — 날짜(earliest/deadline)가 있으면 step.cardLine
    // (미지정 시 설명 첫 문장)에 날짜 구문을 붙이고, 날짜가 없으면 설명 첫 문장만.
    // earliest("이후")가 deadline("까지")보다 우선: 보호자가 먼저 알아야 할 제약.
    const cardDesc = done
      ? undefined
      : earliest
        ? `${formatKoreanDate(earliest)} 이후 ${step.cardLine ?? summary}`
        : deadline
          ? `${formatKoreanDate(deadline)}까지 ${step.cardLine ?? summary}`
          : summary
    const failedChecks = failedByStep.get(step.id) ?? 0
    const infoChecks = infoByStep.get(step.id) ?? 0
    return {
      id: step.id,
      label: step.title,
      short: step.shortLabel,
      date,
      state: done ? 'done' : 'upcoming',
      desc,
      cardDesc,
      failedChecks: failedChecks > 0 ? failedChecks : undefined,
      infoChecks: infoChecks > 0 ? infoChecks : undefined,
    }
  })

  // 첫 upcoming → current 로 승격
  const firstUpcomingIdx = stages.findIndex((s) => s.state === 'upcoming')
  if (firstUpcomingIdx >= 0) {
    stages[firstUpcomingIdx].state = 'current'
  }
  const nextStage = stages.find((s) => s.state === 'current') ?? null
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
    nextStage,
    totalFailedChecks,
    totalInfoChecks,
  }
}
