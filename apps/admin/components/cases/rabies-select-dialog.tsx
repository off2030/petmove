'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { cn } from '@/lib/utils'

interface RabiesRecord {
  date?: string | null
  valid_until?: string | null
  other_hospital?: boolean
}

/** sortedAsc 기준의 record + 원래 인덱스. */
interface SortedRabies {
  date: string
  validUntil: string | null
  otherHospital: boolean
  /** sortedAsc 위치 — 서버로 보낼 인덱스. */
  ascIndex: number
}

function normalize(rabiesDates: unknown): SortedRabies[] {
  if (!Array.isArray(rabiesDates)) return []
  // 별지 25호/EX 는 타병원 접종을 자동 제외 → 모달도 동일하게 필터.
  // 인덱스는 server 의 stripOtherHospitalRecords 후 sortedAsc 와 동일한 기준이어야 함.
  const recs: { date: string; validUntil: string | null; otherHospital: boolean }[] = []
  for (const r of rabiesDates) {
    if (!r) continue
    if (typeof r === 'string') {
      recs.push({ date: r, validUntil: null, otherHospital: false })
    } else if (typeof r === 'object') {
      const rec = r as RabiesRecord
      if (rec.other_hospital) continue
      if (typeof rec.date === 'string' && rec.date) {
        recs.push({
          date: rec.date,
          validUntil: typeof rec.valid_until === 'string' ? rec.valid_until : null,
          otherHospital: false,
        })
      }
    }
  }
  recs.sort((a, b) => a.date.localeCompare(b.date))
  return recs.map((r, i) => ({ ...r, ascIndex: i }))
}

interface Props {
  open: boolean
  formLabel: string
  /** dedicated 슬롯 수 — 별지 25호=3, 별지 25 EX=2. */
  slotCount: number
  rabiesDates: unknown
  /** 모달이 닫히면 호출 (cancel 또는 confirm). confirm 시 indices 비어있지 않음. */
  onClose: (indices: number[] | null) => void
}

export function RabiesSelectDialog({ open, formLabel, slotCount, rabiesDates, onClose }: Props) {
  const sorted = useMemo(() => normalize(rabiesDates), [rabiesDates])
  // 기본 — 가장 최신 N개. (Form25 의 경우 최근 부스터가 면역 증명에 가장 관련성 높음.)
  const defaultSelected = useMemo(() => {
    const n = sorted.length
    const start = Math.max(0, n - slotCount)
    return new Set(sorted.slice(start).map((r) => r.ascIndex))
  }, [sorted, slotCount])

  const [selected, setSelected] = useState<Set<number>>(defaultSelected)

  useEffect(() => {
    if (open) setSelected(defaultSelected)
  }, [open, defaultSelected])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const overflowCount = sorted.length - selected.size
  const canConfirm = selected.size > 0 && selected.size <= slotCount
  const atCap = selected.size >= slotCount

  function toggle(idx: number) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        if (next.size >= slotCount) return s
        next.add(idx)
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <h3 className="font-serif text-[17px]">{formLabel} — 광견병 접종 선택</h3>
          <button type="button" onClick={() => onClose(null)} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md space-y-2">
          <p className="font-serif text-[13px] text-muted-foreground">
            서식의 광견병 슬롯이 {slotCount}개 입니다. 인쇄할 접종 {slotCount}건을 골라주세요.
            나머지는 "기타 예방접종" 칸에 이어서 기재됩니다.
          </p>
          <ul className="mt-2 divide-y divide-border/60 border border-border/80 rounded-md">
            {sorted.map((r) => {
              const checked = selected.has(r.ascIndex)
              const disabled = !checked && atCap
              return (
                <li key={r.ascIndex}>
                  <label className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors',
                    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                    checked ? 'bg-accent/40' : !disabled && 'hover:bg-accent/20',
                  )}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r.ascIndex)}
                      disabled={disabled}
                      className="cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="font-mono text-[14px] tabular-nums">{r.date}</span>
                    {r.validUntil && (
                      <span className="font-mono text-[12px] text-muted-foreground">
                        → {r.validUntil}
                      </span>
                    )}
                    {r.otherHospital && (
                      <span className="font-serif text-[11px] text-muted-foreground italic">타병원</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="font-serif text-[12px] text-muted-foreground italic">
            선택 {selected.size}/{slotCount} · 기타 슬롯으로 이동 {overflowCount}건
          </p>
        </div>

        <DialogFooter
          bordered
          onCancel={() => onClose(null)}
          onPrimary={() => onClose(Array.from(selected).sort((a, b) => a - b))}
          primaryLabel="이대로 발급"
          primaryDisabled={!canConfirm}
        />
      </div>
    </div>
  )
}

/** Form key → dedicated 광견병 슬롯 수. 다른 form 은 unsupported (선택 불필요). */
export const RABIES_SLOT_CAP: Record<string, number> = {
  Form25: 3,
  Form25AuNz: 2,
}
