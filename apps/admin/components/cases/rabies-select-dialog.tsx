'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { cn } from '@/lib/utils'

export { RABIES_SLOT_CAP, rabiesPickMin, hasRabiesOverflowSlot } from '@/lib/rabies-slot-cap'

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
  /**
   * 선택분이 슬롯을 넘칠 때 "기타 예방접종" 칸으로 흘릴 수 있는지.
   * false(Form AC — 그 칸 없음)면 안내 문구·집계에서 기타 슬롯을 빼고, 슬롯 수를 상한으로 안내.
   */
  hasOverflowSlot?: boolean
  /** 표시할 접종을 이 날짜 이후 (>) 로 제한. FormRE 는 1차 항체검사일 전달. */
  eligibleAfterDate?: string | null
  /** 타병원 접종(`other_hospital: true`) 도 후보에 포함. FormRE 만 true. */
  includeOtherHospital?: boolean
  /**
   * 국가 검증 규칙으로 산출한 추천 선택 (ascIndex 배열). 주어지면 기본 체크가
   * "전체"가 아니라 이 집합 — 1회 접종 필수 국가에서 규정 충족에 필요한 최소
   * 접종(기본 최근 1건, 미달 시 anchor 까지)만 미리 선택. 사용자는 조정 가능.
   */
  recommendedIndices?: number[] | null
  /** 모달이 닫히면 호출. cancel 은 null, confirm 은 number[] (0건 선택도 허용 — 빈 배열). */
  onClose: (indices: number[] | null) => void
}

export function RabiesSelectDialog({ open, formLabel, slotCount, rabiesDates, eligibleAfterDate, includeOtherHospital, recommendedIndices, hasOverflowSlot = true, onClose }: Props) {
  const sorted = useMemo(
    () => normalize(rabiesDates, eligibleAfterDate, includeOtherHospital),
    [rabiesDates, eligibleAfterDate, includeOtherHospital],
  )
  // 추천 선택(recommendedIndices)이 있으면 그 집합을 기본으로 — 1회 접종 필수
  // 국가에서 규정 충족에 필요한 최소 접종만 자동 선택. 후보(sorted) 안에 있는
  // 인덱스로만 제한. 추천이 없으면 기존대로 모두 체크(사용자가 뺄 것만 해제).
  // 선택분 중 최근 slotCount 개는 dedicated 슬롯, 그 이전은 "기타 예방접종" 칸으로 분배.
  const autoSelected = !!recommendedIndices && recommendedIndices.length > 0
  const defaultSelected = useMemo(() => {
    const valid = new Set(sorted.map((r) => r.ascIndex))
    if (recommendedIndices && recommendedIndices.length > 0) {
      const picked = recommendedIndices.filter((i) => valid.has(i))
      if (picked.length > 0) return new Set(picked)
    }
    return valid
  }, [sorted, recommendedIndices])

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
            {hasOverflowSlot ? (
              <>
                증명서에 기재할 광견병 접종을 선택하세요. 선택한 접종 중 최근 {slotCount}개는
                광견병 슬롯에, 그 이전은 &quot;기타 예방접종&quot; 칸에 기재됩니다. 선택하지 않은
                접종은 증명서에 나오지 않습니다.
              </>
            ) : (
              <>
                증명서에 기재할 광견병 접종을 선택하세요. 광견병 칸은 {slotCount}개이고, 이
                서식에는 &quot;기타 예방접종&quot; 칸이 없습니다. 선택하지 않은 접종은 증명서에
                나오지 않습니다.
              </>
            )}
          </p>
          {autoSelected && (
            <p className="font-serif text-[12px] text-pmw-info">
              이 나라는 광견병 접종 1회면 충분합니다. 규정(항체검사 시점 등) 충족에 필요한
              최소 접종만 자동 선택했어요. 필요하면 조정하세요.
            </p>
          )}
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
            {hasOverflowSlot
              ? `선택 ${selected.size}건 · 광견병 슬롯 ${dedicatedCount}건 · 기타 슬롯 ${otherCount}건`
              : `선택 ${selected.size}건 · 광견병 칸 ${slotCount}개`}
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

