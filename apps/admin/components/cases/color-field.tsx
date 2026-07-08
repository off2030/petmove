'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import type { CaseRow } from '@petmove/domain'
import { SectionLabel } from '@/components/ui/section-label'
import colorsData from '@petmove/domain/data/colors.json'

interface ColorOption {
  ko: string
  en: string
  alias: string[]
}

const COLORS = colorsData as ColorOption[]

/**
 * Multi-select color field. Pick one or more base colors.
 * Saves both Korean and English as comma-separated values.
 */
export function ColorField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const { settings: detailViewSettings } = useDetailViewSettings()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const colorKo = (data.color as string) ?? ''
  const colorEn = (data.color_en as string) ?? ''

  const bilingual = detailViewSettings.color_bilingual && colorKo && colorEn
  // 한영 병기 OFF 의 디폴트는 "영문만" — 영문 우선, 영문 없을 때만 한글 폴백.
  const fallback = colorEn || colorKo || ''
  const isEmpty = !bilingual && !fallback
  const copyText = bilingual ? `${colorKo} | ${colorEn}` : (isEmpty ? '' : fallback)
  const display = bilingual ? (
    <>
      <span className="text-muted-foreground">{colorKo}</span>
      <span className="text-muted-foreground/30 mx-1.5 select-none">|</span>
      <span className="italic text-foreground">{colorEn}</span>
    </>
  ) : isEmpty ? (
    <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>
  ) : (
    fallback
  )

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  type PopupPos =
    | { left: number; top: number; maxHeight: number }
    | { left: number; bottom: number; maxHeight: number }
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null)

  // Parse current value into selected set on open
  useEffect(() => {
    if (open) {
      const current = new Set<string>()
      const combined = (colorKo + ' ' + colorEn).toLowerCase()
      for (const c of COLORS) {
        if (combined.includes(c.ko) || combined.includes(c.en.toLowerCase())) {
          current.add(c.en)
        }
        for (const a of c.alias) {
          if (combined.includes(a.toLowerCase())) {
            current.add(c.en)
          }
        }
      }
      setSelected(current)
    }
  }, [open, colorKo, colorEn])

  // Reset on case change
  useEffect(() => {
    setOpen(false)
  }, [caseId])

  // Close on click outside — trigger(containerRef) 또는 portal 팝업(popupRef) 안쪽이면 유지.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 팝업 위치 측정 — fixed 로 띄워 부모 overflow:auto 클리핑 우회.
  useEffect(() => {
    if (!open) return
    function measure() {
      const trigger = containerRef.current?.querySelector('button')
      const rect = trigger?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300 - 8))
      const gap = 4
      const above = rect.top - 8 - gap
      const below = window.innerHeight - rect.bottom - 8 - gap
      if (below >= above) {
        setPopupPos({ left, top: rect.bottom + gap, maxHeight: Math.max(220, below) })
      } else {
        setPopupPos({ left, bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(220, above) })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  function toggle(en: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(en)) {
        next.delete(en)
      } else if (next.size < 3) {
        next.add(en)
      }
      return next
    })
  }

  function save() {
    const selectedColors = COLORS.filter(c => selected.has(c.en))
    const ko = selectedColors.map(c => c.ko).join(', ')
    const en = selectedColors.map(c => c.en).join(', ')

    setOpen(false)

    // Optimistic — UI 즉시 반영.
    updateLocalCaseField(caseId, 'data', 'color', ko || null)
    updateLocalCaseField(caseId, 'data', 'color_en', en || null)
    void persistField('모색', async () => {
      const r1 = await updateCaseField(caseId, 'data', 'color', ko || null)
      if (!r1.ok) return r1
      return updateCaseField(caseId, 'data', 'color_en', en || null)
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <SectionLabel
        className="pt-1"
        onClick={() => setOpen(!open)}
        title={isEmpty ? '모색 추가' : '모색 변경'}
      >
        모색
      </SectionLabel>
      <div ref={containerRef} className="relative min-w-0">
        <div className="group/val relative w-fit">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(
              'text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
              isEmpty && 'text-muted-foreground/60',
            )}
          >
            {display}
          </button>
          <CopyButton
            value={copyText}
            className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
          />
        </div>

        {open && popupPos && typeof document !== 'undefined' && createPortal(
          <div
            ref={popupRef}
            style={{
              position: 'fixed',
              left: popupPos.left,
              top: 'top' in popupPos ? popupPos.top : undefined,
              bottom: 'bottom' in popupPos ? popupPos.bottom : undefined,
              maxHeight: popupPos.maxHeight,
              width: 300,
            }}
            className="z-50 flex flex-col rounded-md border border-border/80 bg-background shadow-md p-3 overflow-hidden"
          >
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal flex flex-wrap gap-sm mb-3">
              {COLORS.map((c) => {
                const isSelected = selected.has(c.en)
                return (
                  <button
                    key={c.en}
                    type="button"
                    onClick={() => toggle(c.en)}
                    className={cn(
                      'h-fit px-sm py-1.5 rounded-md text-sm transition-colors border',
                      isSelected
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-foreground border-border/80 hover:bg-accent/60',
                    )}
                  >
                    {c.ko}
                  </button>
                )
              })}
            </div>
            <div className="shrink-0 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selected.size > 0
                  ? COLORS.filter(c => selected.has(c.en)).map(c => c.ko).join(', ')
                  : '가장 가까운 색상을 1~3개 선택하세요'}
              </span>
              <button
                type="button"
                onClick={save}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                저장
              </button>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}
