'use client'

import type { CaseRow, PastJourneySummary } from '@petmove/domain'
import { formatDepartureYmd } from '@petmove/domain'
import { cn } from '@/lib/utils'

/**
 * 스태프용 지난 여정 표시(읽기) — case.data.past_journeys 요약. design journey-lifecycle §5.
 * case-detail 맨 아래 섹션. 완료/취소 처리(전환 버튼)는 별도(destination-field) — 추후.
 */

function readPast(caseRow: CaseRow): PastJourneySummary[] {
  const raw = (caseRow.data as Record<string, unknown> | null | undefined)?.past_journeys
  if (!Array.isArray(raw)) return []
  return [...(raw as PastJourneySummary[])].sort((a, b) => {
    const x = a.completedDate ?? ''
    const y = b.completedDate ?? ''
    return x > y ? -1 : x < y ? 1 : 0
  })
}

export function PastJourneysAdminSection({ caseRow }: { caseRow: CaseRow }) {
  const list = readPast(caseRow)
  if (list.length === 0) return null

  return (
    <section className="mb-10 pt-10 border-t border-border/60">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[14px] tracking-[1.2px] text-muted-foreground/80">··</span>
        <h3 className="font-serif text-[20px] font-medium tracking-tight text-foreground">지난 여정</h3>
      </div>
      <div>
        {list.map((j, i) => {
          const arrow = j.tripType === 'round' ? '⇄' : '→'
          const done = j.outcome === 'done'
          return (
            <div
              key={`${j.destination}-${j.completedDate ?? ''}-${i}`}
              className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0"
            >
              <span
                className={cn(
                  'text-[12px] font-medium px-2 py-0.5 rounded shrink-0',
                  done
                    ? 'text-[hsl(var(--pmw-positive))] bg-[hsl(var(--pmw-positive)/0.1)]'
                    : 'text-muted-foreground bg-muted',
                )}
              >
                {done ? '완료' : '취소'}
              </span>
              <span className="text-[15px] text-foreground truncate">
                한국 <span className="text-muted-foreground">{arrow}</span> {j.destination}
              </span>
              <span className="ml-auto font-mono text-[13px] text-muted-foreground tabular-nums shrink-0">
                {j.departureDate ? `${formatDepartureYmd(j.departureDate)} 출국` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
