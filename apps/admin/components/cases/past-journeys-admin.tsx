'use client'

import { useState, useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import type { CaseRow, PastJourneySummary } from '@petmove/domain'
import { formatDepartureYmd } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { restoreJourneyFromPastAdmin } from '@/lib/actions/journey-complete'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import { cn } from '@/lib/utils'

/**
 * 스태프용 지난 여정 — case.data.past_journeys 요약. design journey-lifecycle §5.
 * case-detail 맨 아래 섹션. 완료/취소 처리(내리기)는 destination-field 의 칩 메뉴가 담당하고,
 * 여기서는 **되돌리기**(다시 진행 중으로)를 제공한다.
 *
 * 되돌리기는 내릴 때 담아 둔 스냅샷이 있어야 가능하다 — 없는 옛 기록은 버튼을 감추고
 * 이유를 툴팁으로 알린다(눌렀다가 실패 메시지를 보는 것보다 낫다).
 */

interface PastRow extends PastJourneySummary {
  /** 정렬 전 data.past_journeys 원본 인덱스 — 서버 액션이 이 인덱스로 찾는다. */
  idx: number
}

function readPast(caseRow: CaseRow): PastRow[] {
  const raw = (caseRow.data as Record<string, unknown> | null | undefined)?.past_journeys
  if (!Array.isArray(raw)) return []
  return (raw as PastJourneySummary[])
    .map((j, idx) => ({ ...j, idx }))
    .sort((a, b) => {
      const x = a.completedDate ?? ''
      const y = b.completedDate ?? ''
      return x > y ? -1 : x < y ? 1 : 0
    })
}

export function PastJourneysAdminSection({ caseRow }: { caseRow: CaseRow }) {
  const list = readPast(caseRow)
  const confirm = useConfirm()
  const { updateLocalCaseField, replaceLocalCaseData } = useCases()
  const [busyIdx, setBusyIdx] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  if (list.length === 0) return null

  function restore(j: PastRow) {
    startTransition(async () => {
      const ok = await confirm({
        message: `"${j.destination}" 여정을 다시 진행 중으로 되돌릴까요?`,
        description:
          '보관할 때 저장해 둔 일정·항공편·검역 기록이 그대로 복원되고, 지난 여정 목록에서 사라집니다.',
        okLabel: '되돌리기',
      })
      if (!ok) return
      setBusyIdx(j.idx)
      // 실패는 '다시 시도' 토스트로 — admin 의 다른 저장과 같은 처리(persistField).
      const res = await persistField('지난 여정 되돌리기', () =>
        restoreJourneyFromPastAdmin(caseRow.id, j.idx),
      )
      setBusyIdx(null)
      if (!res?.ok) return
      // 낙관적 반영 — realtime 도 곧 따라오지만 화면이 먼저 움직이게.
      updateLocalCaseField(caseRow.id, 'column', 'destination', res.destination)
      updateLocalCaseField(caseRow.id, 'column', 'departure_date', res.departureDate)
      replaceLocalCaseData(caseRow.id, res.data)
    })
  }

  return (
    <section className="mb-10 pt-10 border-t border-border/60">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[14px] tracking-[1.2px] text-muted-foreground/80">··</span>
        <h3 className="font-serif text-[20px] font-medium tracking-tight text-foreground">지난 여정</h3>
      </div>
      <div>
        {list.map((j) => {
          const arrow = j.tripType === 'round' ? '⇄' : '→'
          const done = j.outcome === 'done'
          const restorable = !!j.snapshot
          return (
            <div
              key={`${j.destination}-${j.completedDate ?? ''}-${j.idx}`}
              className="group/past flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0"
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
              {restorable ? (
                <button
                  type="button"
                  onClick={() => restore(j)}
                  disabled={pending && busyIdx === j.idx}
                  title="다시 진행 중으로 되돌리기"
                  aria-label={`${j.destination} 여정 되돌리기`}
                  className={cn(
                    'shrink-0 inline-flex items-center justify-center rounded-md p-1.5 transition-all',
                    'text-muted-foreground/60 hover:text-foreground hover:bg-accent',
                    'opacity-0 group-hover/past:opacity-100 focus-visible:opacity-100',
                    'disabled:opacity-40',
                  )}
                >
                  <Undo2 size={14} />
                </button>
              ) : (
                <span
                  title="되돌리기가 생기기 전에 보관된 여정이라 복원 정보가 없어요."
                  className="shrink-0 w-[26px]"
                  aria-hidden
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
