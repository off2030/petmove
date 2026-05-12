import type { CaseRow } from '@petmove/domain'
import {
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  getStepsForCase,
  resolveDone,
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

  const stages: JourneyStage[] = applicableSteps.map((step) => {
    const done = resolveDone(step.done, caseRow)
    // departure step 은 출국일 자체를 date 로 표시 — 다른 step 은 deadline 권장일
    const isDeparture = step.id === 'departure'
    const date = isDeparture ? dep : done ? null : deadlineDate(step, caseRow)
    return {
      id: step.id,
      label: step.title,
      short: step.shortLabel,
      date,
      state: done ? 'done' : 'upcoming',
      desc: step.description.split('\n')[0],
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
      fromCity: '서울',
      toCity: ctx.destinationToken ?? caseRow.destination ?? '—',
      departureDate: dep,
      daysLeft,
      tripType: ctx.tripType,
    },
    stages,
    nextStage,
  }
}
