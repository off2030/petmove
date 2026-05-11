import type { CaseRow } from '@petmove/domain'

/**
 * Portal 여정(/journey) 화면 데이터 모델.
 *
 * docs/portal-preview/data.jsx 의 `SCENARIO.stages` 와 동일 shape — Calm 디자인
 * (TimelineCalm) 이 그대로 소비. 실제 데이터는 `cases.data` jsonb 에서 추출.
 *
 * MVP 정책 (Phase 11.0.7):
 *   - 8-단계 표준 템플릿 (의뢰→칩→백신→항체→검역신청→증명서→항공→출국)
 *   - admin 진행상황 시그널 없는 단계(s5/s6/s7) 는 upcoming 고정 — 추후 admin
 *     쪽에서 cases.data 에 명시적 마일스톤 키를 적재하면 매핑 추가.
 *   - 단일 케이스만 표시 (다묘다견·동시 출국은 Phase 11.4 가족 계정에서).
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
  trip: { fromCity: string; toCity: string; departureDate: string | null; daysLeft: number | null }
  stages: JourneyStage[]
  /** state==='current' 인 첫 스테이지. 없으면 null (= 전체 완료). */
  nextStage: JourneyStage | null
}

// ── caseRow.data 최소 리더 (procedure-checks/utils 미러) ────────────────
// domain package 가 procedure-checks/utils 를 외부에 노출 안 해서, 같은 패턴을
// 여기에 인라인. 검증이 아니라 "존재 여부"만 보면 되므로 shape 만 맞춤.

function hasRabiesEntry(caseRow: CaseRow): boolean {
  const raw = (caseRow.data as Record<string, unknown> | null)?.rabies_dates
  if (!Array.isArray(raw)) return false
  return raw.some((r) => {
    const date = typeof r === 'string' ? r : (r as { date?: string })?.date
    return typeof date === 'string' && date.length >= 10
  })
}

function hasTiterEntry(caseRow: CaseRow): boolean {
  const raw = (caseRow.data as Record<string, unknown> | null)?.rabies_titer_records
  if (!Array.isArray(raw)) return false
  return raw.some((r) => {
    const date = (r as { date?: string })?.date
    return typeof date === 'string' && date.length >= 10
  })
}

function todayKst(): string {
  // Asia/Seoul 기준 YYYY-MM-DD — 단순 ISO slice (Vercel/Capacitor 둘 다 UTC 기준이지만
  // 출국 D-day 는 한국 보호자 관점 1일 정도 오차 허용).
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

// ── 어댑터 ──────────────────────────────────────────────────────────────

export function buildJourney(caseRow: CaseRow): JourneyData {
  const today = todayKst()
  const dep = caseRow.departure_date
  const daysLeft = dep ? daysBetween(today, dep) : null

  const microchipDone = !!caseRow.microchip
  const rabiesDone = hasRabiesEntry(caseRow)
  const titerDone = hasTiterEntry(caseRow)
  const departed = dep ? dep < today : false

  // upcoming → current 마킹은 stages 빌드 후 일괄 처리.
  const stages: JourneyStage[] = [
    { id: 's1', label: '의뢰 접수',         short: '접수',     date: caseRow.created_at.slice(0, 10), state: 'done', desc: '상담·견적 등록 완료' },
    { id: 's2', label: '마이크로칩 확인',    short: '칩',       date: null, state: microchipDone ? 'done' : 'upcoming', desc: 'ISO 11784 규격 확인' },
    { id: 's3', label: '광견병 백신 접종',   short: '백신',     date: null, state: rabiesDone ? 'done' : 'upcoming',     desc: '항체 형성 대기' },
    { id: 's4', label: '광견병 항체가 검사', short: '항체 검사', date: null, state: titerDone ? 'done' : 'upcoming',       desc: '채혈 → 지정 검사기관 송부' },
    { id: 's5', label: '검역 신청',          short: '신청',     date: null, state: 'upcoming', desc: '검역본부 사전신고' },
    { id: 's6', label: '검역증 발급',        short: '증명서',    date: null, state: 'upcoming', desc: '출국 7일 이내 발급' },
    { id: 's7', label: '항공 예약 확정',     short: '항공',     date: null, state: 'upcoming', desc: '항공권·켄넬 위탁 확정' },
    { id: 's8', label: '출국 · 도착',        short: '출국',     date: dep,  state: departed ? 'done' : 'upcoming', desc: '입국 검역소 도착' },
  ]

  // 첫 upcoming → current 로 승격. 전부 done 이면 nextStage = null.
  const firstUpcomingIdx = stages.findIndex((s) => s.state === 'upcoming')
  if (firstUpcomingIdx >= 0) {
    stages[firstUpcomingIdx].state = 'current'
  }
  const nextStage = stages.find((s) => s.state === 'current') ?? null

  return {
    pet: { name: caseRow.pet_name ?? '반려동물' },
    trip: {
      fromCity: '서울',
      toCity: caseRow.destination ?? '—',
      departureDate: dep,
      daysLeft,
    },
    stages,
    nextStage,
  }
}
