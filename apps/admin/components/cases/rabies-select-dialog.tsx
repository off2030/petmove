'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { cn } from '@/lib/utils'

export { RABIES_SLOT_CAP } from '@/lib/rabies-slot-cap'

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

function normalize(rabiesDates: unknown, eligibleAfterDate?: string | null, includeOtherHospital?: boolean): SortedRabies[] {
  if (!Array.isArray(rabiesDates)) return []
  // 별지 25호/EX 는 타병원 접종을 자동 제외 (서버도 동일하게 strip).
  // FormRE 는 타병원도 후보에 포함 (서버 strip 안 함).
  // ascIndex 는 서버의 sortedAsc(rabies_dates) 와 동일 공간이어야 인덱스가 맞음.
  const recs: { date: string; validUntil: string | null; otherHospital: boolean }[] = []
  for (const r of rabiesDates) {
    if (!r) continue
    if (typeof r === 'string') {
      recs.push({ date: r, validUntil: null, otherHospital: false })
    } else if (typeof r === 'object') {
      const rec = r as RabiesRecord
      if (rec.other_hospital && !includeOtherHospital) continue
      if (typeof rec.date === 'string' && rec.date) {
        recs.push({
          date: rec.date,
          validUntil: typeof rec.valid_until === 'string' ? rec.valid_until : null,
          otherHospital: !!rec.other_hospital,
        })
      }
    }
  }
  recs.sort((a, b) => a.date.localeCompare(b.date))
  const indexed = recs.map((r, i) => ({ ...r, ascIndex: i }))
  if (eligibleAfterDate) return indexed.filter((r) => r.date > eligibleAfterDate)
  return indexed
}

interface Props {
  open: boolean
  formLabel: string
  /** dedicated 슬롯 수 — 별지 25호=3, 별지 25 EX=2, FormRE=2. */
  slotCount: number
  rabiesDates: unknown
  /** 표시할 접종을 이 날짜 이후 (>) 로 제한. FormRE 는 1차 항체검사일 전달. */
  eligibleAfterDate?: string | null
  /** 타병원 접종(`other_hospital: true`) 도 후보에 포함. FormRE 만 true. */
  includeOtherHospital?: boolean
  /** 모달이 닫히면 호출. cancel 은 null, confirm 은 number[] (0건 선택도 허용 — 빈 배열). */
  onClose: (indices: number[] | null) => void
}

export function RabiesSelectDialog({ open, formLabel, slotCount, rabiesDates, eligibleAfterDate, includeOtherHospital, onClose }: Props) {
  const sorted = useMemo(
    () => normalize(rabiesDates, eligibleAfterDate, includeOtherHospital),
    [rabiesDates, eligibleAfterDate, includeOtherHospital],
  )
  // 기본 — 모두 체크. 선택분 중 최근 slotCount 개는 dedicated 슬롯,
  // 그 이전은 "기타 예방접종" 칸으로 자동 분배. 사용자는 증명서에서
  // 제외할 항목만 해제하면 됨 (0 건도 허용).
  const defaultSelected = useMemo(
    () => new Set(sorted.map((r) => r.ascIndex)),
    [sorted],
  )

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

  // Portal — case 패널의 translateX 가 fixed containing block 을 만들어
  // 모달이 좌측으로 밀리는 문제 회피.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!open || !mounted) return null

  // 선택한 접종 중 최근 N개는 dedicated 슬롯, 나머지는 "기타" 슬롯으로.
  const dedicatedCount = Math.min(selected.size, slotCount)
  const otherCount = Math.max(0, selected.size - slotCount)

  function toggle(idx: number) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return createPortal(
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
            증명서에 기재할 광견병 접종을 선택하세요. 선택한 접종 중 최근 {slotCount}개는
            광견병 슬롯에, 그 이전은 "기타 예방접종" 칸에 기재됩니다. 선택하지 않은 접종은
            증명서에 나오지 않습니다.
          </p>
          <ul className="mt-2 divide-y divide-border/60 border border-border/80 rounded-md">
            {sorted.map((r) => {
              const checked = selected.has(r.ascIndex)
              return (
                <li key={r.ascIndex}>
                  <label className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors cursor-pointer',
                    checked ? 'bg-accent/40' : 'hover:bg-accent/20',
                  )}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r.ascIndex)}
                      className="cursor-pointer"
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
            선택 {selected.size}건 · 광견병 슬롯 {dedicatedCount}건 · 기타 슬롯 {otherCount}건
          </p>
        </div>

        <DialogFooter
          bordered
          onCancel={() => onClose(null)}
          onPrimary={() => onClose(Array.from(selected).sort((a, b) => a - b))}
          primaryLabel="이대로 발급"
        />
      </div>
    </div>,
    document.body,
  )
}

