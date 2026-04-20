'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import colorsData from '@/data/colors.json'

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
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const colorKo = (data.color as string) ?? ''
  const colorEn = (data.color_en as string) ?? ''

  const display = colorEn || colorKo || '—'
  const isEmpty = display === '—'

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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

  async function save() {
    const selectedColors = COLORS.filter(c => selected.has(c.en))
    const ko = selectedColors.map(c => c.ko).join(', ')
    const en = selectedColors.map(c => c.en).join(', ')

    setOpen(false)

    const r1 = await updateCaseField(caseId, 'data', 'color', ko || null)
    if (r1.ok) updateLocalCaseField(caseId, 'data', 'color', ko || null)
    const r2 = await updateCaseField(caseId, 'data', 'color_en', en || null)
    if (r2.ok) updateLocalCaseField(caseId, 'data', 'color_en', en || null)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
      <div className="pt-1 text-base text-primary">모색</div>
      <div ref={containerRef} className="relative min-w-0">
        <div className="group/val relative w-fit">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn(
              'text-left rounded-md px-2 py-1 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-pointer',
              isEmpty && 'text-muted-foreground/60',
            )}
          >
            {display}
          </button>
          <CopyButton
            value={isEmpty ? '' : display}
            className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
          />
        </div>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-20 rounded-md border border-border/50 bg-background shadow-md p-3">
            <div className="flex flex-wrap gap-sm mb-3">
              {COLORS.map((c) => {
                const isSelected = selected.has(c.en)
                return (
                  <button
                    key={c.en}
                    type="button"
                    onClick={() => toggle(c.en)}
                    className={cn(
                      'px-sm py-1.5 rounded-md text-sm transition-colors border',
                      isSelected
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-foreground border-border/50 hover:bg-accent/60',
                    )}
                  >
                    {c.en}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selected.size > 0
                  ? COLORS.filter(c => selected.has(c.en)).map(c => c.en).join(', ')
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
          </div>
        )}
      </div>
    </div>
  )
}
