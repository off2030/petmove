'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Palette, Check } from 'lucide-react'
import { useSkin, setSkin, SKIN_LIST, SKIN_LABELS, type Skin } from '@/lib/use-skin'

// 스킨 비교 위해 cycle 대신 popover picker. 4개 이상 되면 cycle 은 비교 불편.
// 각 항목에 mini swatch (배경 + 액센트 2-tone) 로 한눈에 톤 구분.
const SKIN_PREVIEW: Record<Skin, { bg: string; accent: string }> = {
  editorial: { bg: '#F5F4ED', accent: '#9B4A2D' },
  flat: { bg: '#FFFFFF', accent: '#18181B' },
  glassmorphism: { bg: 'linear-gradient(135deg,#C7D2FE,#A78BFA)', accent: '#4F46E5' },
  'art-deco': { bg: '#0F1B30', accent: '#C9A961' },
  'foggy-pastel': { bg: '#D5DBE0', accent: '#5C6B7C' },
  hygge: { bg: '#EFE6D6', accent: '#B89070' },
  'scandi-minimal': { bg: '#E8E5DD', accent: '#1F1F1B' },
  sakura: { bg: 'linear-gradient(180deg,#FCE4EC,#F8D0DA)', accent: 'linear-gradient(180deg,#F5C0CB,#E8A0B0)' },
  'baby-blue': { bg: '#DCE7F2', accent: '#4A7AB8' },
  aurora: { bg: 'linear-gradient(135deg,#D9DBF0,#F0DDC9)', accent: '#8A7DC5' },
}

export function SkinPicker() {
  const { skin, mounted } = useSkin()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // 드롭다운 위치 — 트리거 버튼 기준 viewport 좌표.
  useEffect(() => {
    if (!open) return
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    const onResize = () => {
      const rr = t.getBoundingClientRect()
      setPos({ top: rr.bottom + 4, right: window.innerWidth - rr.right })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open])

  if (!mounted) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`스킨: ${SKIN_LABELS[skin]}`}
        aria-label="스킨 선택"
        aria-expanded={open}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Palette size={18} />
      </button>
      {open && pos && createPortal(
        <>
          {/* Backdrop — 메뉴 외부 클릭 시 닫힘. 메뉴 자체보다 z-index 낮음. */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100]"
            aria-hidden="true"
          />
          <div
            role="menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 101 }}
            className="w-44 rounded-md border border-border bg-popover shadow-md p-1"
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
        </>,
        document.body,
      )}
    </>
  )
}
