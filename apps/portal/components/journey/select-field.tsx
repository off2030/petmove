'use client'

import { useEffect, useRef, useState } from 'react'

export interface SelectOption {
  value: string
  label: string
}

/**
 * 펫무브(portal) Stone 톤 드롭다운 — 네이티브 <select> 대체. 펫무브워크 DropdownSelect
 * 의 동작 패턴(트리거 + 팝업 목록, 외부 탭·ESC 로 닫힘)을 portal 디자인 톤으로 옮긴 것.
 * 트리거는 다른 입력 박스(흰 배경 + 가는 테두리)와 동일한 모양.
 */
export function SelectField({
  value,
  options,
  onChange,
  placeholder = '선택하세요',
}: {
  value: string
  options: SelectOption[]
  onChange: (next: string) => void
  placeholder?: string
}) {
  const C = {
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
    ink3: '#9A9286',
    accent: '#B89968',
    accentSoft: 'rgba(184,153,104,.14)',
  } as const

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          border: `1px solid ${open ? C.accent : C.line}`,
          borderRadius: 10,
          background: '#fff',
          fontFamily: 'inherit',
          fontSize: 15,
          color: current ? C.ink : C.ink3,
          cursor: 'pointer',
          boxSizing: 'border-box',
          textAlign: 'left',
          transition: 'border-color .12s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.ink3}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s',
          }}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: '#fff',
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(42,38,32,.14)',
          }}
        >
          {options.map((o) => {
            const selected = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '10px 10px',
                    border: 0,
                    borderRadius: 8,
                    background: selected ? C.accentSoft : 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 15,
                    color: C.ink,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>{o.label}</span>
                  {selected && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.accent}
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
