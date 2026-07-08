'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { isDestinationScopedKey, readEffectiveExtraValue, resolveActiveDestination } from '@petmove/domain'
import { CopyButton } from './copy-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@petmove/ui'

const DATA_KEY = 'address_overseas'

export function OverseasAddressField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField, activeDestination } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  async function handleDelete() {
    const ok = await confirm({
      message: '해외주소 정보를 삭제하시겠습니까?',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (ok) save(null)
  }
  // 활성 목적지 + scoped 키 → by_dest 경로 read/write. 단일 목적지도 resolveActiveDestination
  // 이 유일 토큰을 돌려줘 by_dest 로 저장/삭제한다(B: 단일도 by_dest 통일 — 서버 useByDest·다른
  // scoped 필드와 동일 패턴). read 도 by_dest 우선이므로 읽기/쓰기 경로가 일치해야 한다.
  // isMultiDest 게이트를 두면 값은 by_dest 에 있는데 삭제는 top-level 로 가 삭제가 안 먹혔다(버그).
  const activeDest = resolveActiveDestination(caseRow.destination, activeDestination)
  const destArg: string | null | undefined =
    activeDest && isDestinationScopedKey(DATA_KEY) ? activeDest : undefined
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const raw = readEffectiveExtraValue(data, DATA_KEY, activeDest)
  const value: string | null = typeof raw === 'string' ? raw : null

  const [editing, setEditing] = useState(false)

  useEffect(() => { setEditing(false) }, [caseId])

  function save(v: string | null) {
    const val = v?.trim() || null
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, 'data', DATA_KEY, val, destArg)
    setEditing(false)
    void persistField('해외주소', () => updateCaseField(caseId, 'data', DATA_KEY, val, destArg))
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0">
      <SectionLabel className="pt-1">해외주소</SectionLabel>
      {editMode && editing ? (
        <AddressInput
          initial={value ?? ''}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="group/val inline-flex items-baseline">
          {editMode ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 font-serif italic text-[17px] text-muted-foreground transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-text',
                !value && 'font-sans not-italic text-base text-muted-foreground/60',
              )}
            >
              {value || <span className="inline-block min-w-[6rem] select-none text-muted-foreground/40" aria-hidden>—</span>}
            </button>
          ) : (
            <span
              className={cn(
                'inline-block rounded-md px-2 py-0.5 -mx-2 font-serif italic text-[17px] text-muted-foreground',
                !value && 'font-sans not-italic text-base text-muted-foreground/40',
              )}
            >
              {value || <span className="inline-block min-w-[2.5rem] select-none text-muted-foreground/40" aria-hidden>—</span>}
            </span>
          )}
          {value && (
            <>
              <CopyButton value={value} className="ml-1 opacity-0 group-hover/val:opacity-100" />
              {editMode && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="ml-0.5 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/val:opacity-70 hover:!opacity-100 transition-colors"
                  title="삭제"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AddressInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="flex items-start gap-sm">
      <input
        ref={ref}
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(val) }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => setTimeout(() => onSave(val), 150)}
        placeholder="Destination address"
        className="flex-1 h-8 max-w-[400px] rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSave(val)}
        className="inline-flex h-7 items-center justify-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        저장
      </button>
    </div>
  )
}
