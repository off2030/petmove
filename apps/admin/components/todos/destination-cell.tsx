'use client'

import { useEffect, useRef, useState } from 'react'
import { useConfirm } from '@petmove/ui'
import { destCode } from '@/lib/country-code'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { resolveTabActiveDest, type CaseRow } from '@petmove/domain'

/**
 * 다중 목적지 케이스에서 한 줄에 "활성" 목적지 한 개만 보여주는 chip + dropdown.
 *
 * overrideKey: case data 의 어느 키에 활성 목적지를 영속 저장할지.
 *  - 신고 탭: 'import_report_active_dest'
 *  - 서류 탭: 'export_doc_active_dest'
 *  - 검사 탭: 'inspection_active_dest'
 *
 * 첫 번째 목적지를 고르면 override 가 비워져 default 동작으로 돌아간다.
 *
 * dismissAction: 옵션. 드롭다운 하단에 "X 내리기" 항목 추가. 신고 탭에서 사용해
 * 케이스를 탭에서 명시적으로 제외하는 용도.
 *  - dismissKey: optimistic 로 즉시 true 로 박아 행을 숨김(로컬 반영용).
 *  - action: 옵션. 있으면 dismissKey 단순 patch 대신 이 서버 액션을 호출(예: 신고 취소 —
 *    숨김 + 수입·수출 필드 클리어를 원자적으로). 데이터를 비우는 파괴적 동작이라 confirm 권장.
 *  - confirm: 옵션. 있으면 실행 전 확인창을 띄운다.
 */
export function DestinationCell({
  row,
  overrideKey,
  onUpdate,
  dismissAction,
}: {
  row: CaseRow
  overrideKey: string
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
  dismissAction?: {
    label: string
    dismissKey: string
    action?: (caseId: string) => Promise<{ ok: boolean; error?: string }>
    confirm?: { message: string; description?: string; okLabel?: string }
  }
}) {
  const confirm = useConfirm()
  const dests = (row.destination ?? '').split(',').map(s => s.trim()).filter(Boolean)
  // 활성 목적지: override ?? 출국일 있는 목적지 ?? 첫 목적지. todos 탭의 날짜 flatten 과
  // 동일 기준(resolveTabActiveDest)이라 칩과 표시 데이터가 일치.
  const active = resolveTabActiveDest(row, overrideKey)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  if (!active) return <span className="text-muted-foreground/50">—</span>
  const isMulti = dests.length > 1
  const code = destCode(active)
  const hasDropdown = isMulti || !!dismissAction

  const chipInner = (
    <>
      {code && (
        <span className="font-mono text-[11px] uppercase tracking-[1px] text-pmw-code">{code}</span>
      )}
      <span className="font-serif text-[13px] text-pmw-tag-foreground">{active}</span>
    </>
  )

  if (!hasDropdown) {
    return (
      <span className="inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 bg-pmw-tag text-pmw-tag-foreground whitespace-nowrap">
        {chipInner}
      </span>
    )
  }

  async function pick(d: string) {
    setOpen(false)
    // 명시적으로 고른 목적지는 항상 override 로 저장. (기본 활성이 '출국일 있는 목적지'라
    // 첫 목적지 선택 시 override 를 비우면 다시 default 로 튕겨 선택이 안 남는다.)
    onUpdate(row.id, 'data', overrideKey, d)
    await updateCaseField(row.id, 'data', overrideKey, d)
  }

  async function dismiss() {
    if (!dismissAction) return
    setOpen(false)
    if (dismissAction.confirm) {
      const ok = await confirm(dismissAction.confirm)
      if (!ok) return
    }
    // optimistic 숨김 — 액션이 필드도 비우지만, 행은 dismissKey 만으로 즉시 사라진다.
    onUpdate(row.id, 'data', dismissAction.dismissKey, true)
    if (dismissAction.action) {
      await dismissAction.action(row.id)
    } else {
      await updateCaseField(row.id, 'data', dismissAction.dismissKey, true)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 bg-pmw-tag text-pmw-tag-foreground whitespace-nowrap hover:brightness-95 transition-all cursor-pointer"
        title={isMulti ? `다른 목적지로 변경 (총 ${dests.length}개)` : '메뉴'}
      >
        {chipInner}
        <span className="ml-0.5 text-[10px] text-pmw-tag-foreground/60">▾</span>
      </button>
      {open && (
        <ul
          className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-md border border-border/80 bg-background py-1 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {isMulti && dests.map(d => {
            const isCurrent = d === active
            const dCode = destCode(d)
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void pick(d) }}
                  className={cn(
                    'w-full text-left px-sm py-1.5 text-sm transition-colors flex items-center gap-1.5',
                    isCurrent ? 'bg-accent/40' : 'hover:bg-accent/60',
                  )}
                >
                  {dCode && (
                    <span className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground">{dCode}</span>
                  )}
                  <span className="font-serif text-[14px]">{d}</span>
                  {isCurrent && <span className="ml-auto text-pmw-tag-foreground/70">✓</span>}
                </button>
              </li>
            )
          })}
          {dismissAction && (
            <>
              {isMulti && <li><div className="my-1 border-t border-border/60" /></li>}
              <li>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void dismiss() }}
                  className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <span className="font-serif text-[14px]">{dismissAction.label}</span>
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  )
}
