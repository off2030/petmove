'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
}

interface DropdownSelectProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  /** 트리거 버튼 내용 — 미지정 시 현재 옵션 label */
  renderTrigger?: (current: DropdownOption | null) => ReactNode
  /** 옵션 항목 커스텀 렌더 (status pill, lab tone 등) */
  renderOption?: (option: DropdownOption, isCurrent: boolean) => ReactNode
  /** 트리거 버튼 className (h, padding, font 등) */
  triggerClassName?: string
  /** 메뉴 ul className (min-width, position 등) */
  menuClassName?: string
  /** 메뉴 위치 — 'left' (default) / 'right' */
  align?: 'left' | 'right'
  disabled?: boolean
  /** data-* 속성 등 트리거 버튼에 추가할 attribute */
  triggerProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  /** Portal 사용 (모바일 스크롤·overflow:hidden 부모 회피용) */
  portal?: boolean
}

/**
 * 통일 드롭다운 — StatusPicker / SelectCell / LabDropdown / SelectInput 등 모두 흡수.
 *
 * 패턴:
 * - 닫혔을 때: 트리거 버튼만 (사용자가 renderTrigger 로 자유 정의)
 * - 열렸을 때: 메뉴 ul, 옵션 클릭 → onChange + close
 * - 외부 클릭 / ESC 로 닫힘
 *
 * 핵심: 각 use-case 의 특수 styling (italic serif, lab chip 등) 은 renderTrigger /
 * renderOption 으로 주입. 컴포넌트는 동작·레이아웃·접근성만 책임.
 */
export function DropdownSelect({
  value,
  options,
  onChange,
  renderTrigger,
  renderOption,
  triggerClassName,
  menuClassName,
  align = 'left',
  disabled,
  triggerProps,
  portal,
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false)
  const [popPos, setPopPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const current = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
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

  // Portal mode: compute fixed position from trigger rect, flip up if no room.
  useLayoutEffect(() => {
    if (!portal || !open || !ref.current) return
    function reposition() {
      const trigger = ref.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const menuH = menuRef.current?.offsetHeight ?? 200
      const menuW = menuRef.current?.offsetWidth ?? 120
      const margin = 8
      let top = rect.bottom + 4
      if (top + menuH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - menuH - 4)
      }
      let left = align === 'right' ? rect.right - menuW : rect.left
      if (left + menuW > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - menuW - margin)
      }
      if (left < margin) left = margin
      setPopPos({ top, left, minWidth: rect.width })
    }
    reposition()
    const id = window.requestAnimationFrame(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [portal, open, align])

  const pick = (v: string) => {
    setOpen(false)
    if (v !== value) onChange(v)
  }

  const menu = open ? (
    <ul
      ref={menuRef}
      role="listbox"
      style={
        portal
          ? {
              position: 'fixed',
              top: popPos?.top ?? -9999,
              left: popPos?.left ?? -9999,
              minWidth: popPos?.minWidth,
              visibility: popPos ? 'visible' : 'hidden',
            }
          : undefined
      }
      className={cn(
        'min-w-[120px] rounded-md border border-border/80 bg-popover py-1 shadow-md',
        portal
          ? 'z-50'
          : cn('absolute top-full mt-1 z-30', align === 'right' ? 'right-0' : 'left-0'),
        menuClassName,
      )}
    >
      {options.map((o) => {
        const isCurrent = value === o.value
        return (
          <li key={o.value} role="option" aria-selected={isCurrent}>
            <button
              type="button"
              onClick={() => !o.disabled && pick(o.value)}
              disabled={o.disabled}
              className={cn(
                'w-full text-left px-sm py-1.5 hover:bg-accent/60 transition-colors flex items-center gap-sm',
                isCurrent && 'bg-accent/40',
                o.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {renderOption ? renderOption(o, isCurrent) : (
                <span className="text-[14px]">{o.label}</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  ) : null

  return (
    <div ref={ref} className="relative inline-block">
      <button
        {...triggerProps}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'cursor-pointer rounded-md transition-colors hover:bg-accent/60',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          triggerClassName,
        )}
      >
        {renderTrigger ? renderTrigger(current) : (
          <span className="text-[14px]">{current?.label ?? '—'}</span>
        )}
      </button>
      {portal && open && typeof document !== 'undefined'
        ? createPortal(menu, document.body)
        : menu}
    </div>
  )
}
