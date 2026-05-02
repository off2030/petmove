'use client'

import { useEffect, useRef, useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { useSkin, setSkin, SKIN_LIST, SKIN_LABELS, type Skin } from '@/lib/use-skin'

// 스킨 비교 위해 cycle 대신 popover picker. 4개 이상 되면 cycle 은 비교 불편.
// 각 항목에 mini swatch (배경 + 액센트 2-tone) 로 한눈에 톤 구분.
const SKIN_PREVIEW: Record<Skin, { bg: string; accent: string }> = {
  editorial: { bg: '#F5F4ED', accent: '#9B4A2D' },
  flat: { bg: '#FFFFFF', accent: '#18181B' },
  neumorphism: { bg: '#E8ECF1', accent: '#4A5568' },
}

export function SkinPicker() {
  const { skin, mounted } = useSkin()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (!mounted) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`스킨: ${SKIN_LABELS[skin]}`}
        aria-label="스킨 선택"
        aria-expanded={open}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Palette size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-border bg-popover shadow-md p-1"
        >
          {SKIN_LIST.map((s) => {
            const preview = SKIN_PREVIEW[s]
            const active = s === skin
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setSkin(s)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-sm px-sm py-1.5 rounded-sm font-serif text-[13px] text-foreground hover:bg-accent"
              >
                <span className="w-6 h-6 rounded-sm border border-border/60 overflow-hidden flex shrink-0">
                  <span className="flex-1" style={{ background: preview.bg }} />
                  <span className="flex-1" style={{ background: preview.accent }} />
                </span>
                <span className="flex-1 text-left">{SKIN_LABELS[s]}</span>
                {active && <Check size={13} className="text-foreground/60" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
