import type { CaseRow } from '@petmove/domain'
import {
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getStepsForCase,
  resolveCompletedDate,
  resolveDone,
  resolveStepForDestination,
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
  desc?: string
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
}

function todayKst(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * description 의 첫 문장만 추출 — 일정 row 의 sub-line 용.
 * 마침표/물음표/느낌표 의 첫 등장까지 (그 부호 포함) 반환. 없으면 원문 그대로.
 */
function firstSentence(text: string): string {
  const idx = text.search(/[.!?]/)
  if (idx === -1) return text.trim()
  return text.slice(0, idx + 1).trim()
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
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
  if (step.deadline.anchor === 'created') {
    const d = new Date(caseRow.created_at)
    d.setUTCDate(d.getUTCDate() - step.deadline.daysBefore)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function buildJourney(caseRow: CaseRow): JourneyData {
  const ctx = buildCaseJourneyContext(caseRow)
  const today = todayKst()
  const dep = caseRow.departure_date
  const daysLeft = dep ? daysBetween(today, dep) : null

  const applicableSteps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)

  const stages: JourneyStage[] = applicableSteps.map((rawStep) => {
    // 목적지별 override(주로 description/title) 적용 — base catalog 는 그대로,
    // ctx.destinationKey 가 STEP_DESTINATION_OVERRIDES 에 매칭되면 머지.
    const step = resolveStepForDestination(rawStep, ctx.destinationKey)
    const done = resolveDone(step.done, caseRow)
    // departure step 은 출국일 자체. 그 외에는:
    //  - done → resolveCompletedDate (없으면 dash 로 fallback)
    //  - upcoming → deadline 권장일
    const isDeparture = step.id === 'departure'
    const date = isDeparture
      ? dep
      : done
        ? resolveCompletedDate(step.done, caseRow)
        : deadlineDate(step, caseRow)
    return {
      id: step.id,
      label: step.title,
      short: step.shortLabel,
      date,
      state: done ? 'done' : 'upcoming',
      desc: firstSentence(step.description),
    }
  })

  // 첫 upcoming → current 로 승격
  const firstUpcomingIdx = stages.findIndex((s) => s.state === 'upcoming')
  if (firstUpcomingIdx >= 0) {
    stages[firstUpcomingIdx].state = 'current'
  }
  const nextStage = stages.find((s) => s.state === 'current') ?? null

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
  }
}
