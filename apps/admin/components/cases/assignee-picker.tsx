'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setCaseAssignee } from '@/lib/actions/case-assignee'

interface Member {
  user_id: string
  name: string | null
  email: string
}

interface Props {
  caseId: string
  currentAssigneeId: string | null
  members: Member[]
  /** 변경 후 부모에게 알려 로컬 상태 동기화. */
  onChanged: (next: string | null) => void
}

function memberLabel(m: Member): string {
  return m.name?.trim() || m.email
}

export function AssigneePicker({ caseId, currentAssigneeId, members, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const current = members.find((m) => m.user_id === currentAssigneeId) ?? null
  const triggerLabel = current ? memberLabel(current) : '담당자 없음'

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function pick(userId: string | null) {
    setOpen(false)
    setError(null)
    if (userId === currentAssigneeId) return
    startTransition(async () => {
      const r = await setCaseAssignee(caseId, userId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      onChanged(userId)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1 h-7 px-2.5 rounded-full border transition-colors text-[12px] font-serif',
          current
            ? 'border-foreground/40 text-foreground hover:bg-muted/40'
            : 'border-dashed border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground',
          pending && 'opacity-50',
        )}
        title={error ?? '담당자 변경'}
      >
        <User size={12} className="shrink-0" />
        <span className="truncate max-w-[120px]">{triggerLabel}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-30 min-w-[200px] max-h-[280px] overflow-y-auto rounded-md border border-border/80 bg-popover py-1 shadow-md"
        >
          <li>
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                'w-full text-left px-sm py-1.5 font-serif text-[14px] hover:bg-accent/60 transition-colors flex items-center gap-sm',
                currentAssigneeId === null && 'bg-accent/40',
              )}
            >
              <span className="text-muted-foreground">— 담당자 없음</span>
            </button>
          </li>
          {members.length > 0 && <li className="border-t border-border/40 my-0.5" />}
          {members.map((m) => {
            const isCurrent = m.user_id === currentAssigneeId
            return (
              <li key={m.user_id} role="option" aria-selected={isCurrent}>
                <button
                  type="button"
                  onClick={() => pick(m.user_id)}
                  className={cn(
                    'w-full text-left px-sm py-1.5 font-serif text-[14px] hover:bg-accent/60 transition-colors',
                    isCurrent && 'bg-accent/40',
                  )}
                >
                  <span className="text-foreground">{memberLabel(m)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
