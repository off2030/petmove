'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { allLabOptions } from '@petmove/domain'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { cn } from '@/lib/utils'
import { useCases } from './cases-context'

/** 광견병 항체검사를 골라 RNATT 칸을 채우는 호주 서류(AU 계열). */
export type AuTiterFormKey = 'AU' | 'AU_2' | 'AU_Cat' | 'AU_Cat_2'
export const AU_TITER_PICK_FORMS: ReadonlySet<string> = new Set<AuTiterFormKey>(['AU', 'AU_2', 'AU_Cat', 'AU_Cat_2'])

interface TiterRecord {
  date?: string | null
  lab?: string | null
  value?: string | null
  received_date?: string | null
}

export interface SortedTiter {
  date: string
  lab: string | null
  value: string | null
  receivedDate: string | null
  /** 서버로 보낼 인덱스 — 채혈일 오름차순(날짜 있는 기록) 위치. */
  ascIndex: number
}

/**
 * 채혈일 있는 항체검사를 오래된 순으로. 서버 fillPdfCore 의 titerIndex 와 같은 공간이어야 한다 —
 * pdf-fill 의 sortedTiters(채혈일 내림차순)를 뒤집은 순서(titer_date_asc 와 동일)를 그대로 재현.
 */
export function sortTiterRecords(records: unknown): SortedTiter[] {
  if (!Array.isArray(records)) return []
  return (records as TiterRecord[])
    .filter((r) => r && typeof r.date === 'string' && r.date)
    .slice()
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .reverse()
    .map((r, i) => ({
      date: r.date as string,
      lab: r.lab ?? null,
      value: r.value ?? null,
      receivedDate: r.received_date ?? null,
      ascIndex: i,
    }))
}

interface Props {
  open: boolean
  formLabel: string
  records: unknown
  /** 취소 = null, 발급 = 고른 검사의 ascIndex. */
  onClose: (index: number | null) => void
}

/**
 * 호주 서류 — 광견병 항체검사가 2건 이상일 때 RNATT 칸(채혈일·검체 도착일·결과)에 쓸 검사 선택.
 * 호주용 KRSL + 프랑스용 APQA EU 처럼 여러 나라 검사가 한 케이스에 섞이면 어느 것을 쓸지
 * 코드로 정할 수 없어 사용자가 고른다(2026-09-11). 기본 선택은 가장 오래된 검사(종전 출력).
 */
export function TiterSelectDialog({ open, formLabel, records, onClose }: Props) {
  const { inspectionConfig } = useCases()
  const labs = useMemo(() => allLabOptions(inspectionConfig), [inspectionConfig])
  const sorted = useMemo(() => sortTiterRecords(records), [records])
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) setSelected(0)
  }, [open, records])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Portal — case 패널의 translateX 가 fixed containing block 을 만들어
  // 모달이 좌측으로 밀리는 문제 회피 (RabiesSelectDialog 와 동일).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!open || !mounted) return null

  const labLabel = (lab: string | null) =>
    lab ? (labs.find((l) => l.value === lab)?.label ?? lab.toUpperCase()) : '기관 미지정'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <h3 className="font-serif text-[17px]">{formLabel} — 광견병 항체검사 선택</h3>
          <button type="button" onClick={() => onClose(null)} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md space-y-2">
          <p className="font-serif text-[13px] text-muted-foreground">
            항체검사가 {sorted.length}건 있어요. 서류의 RNATT 칸(채혈일·검체 도착일·결과)에 기재할
            검사를 하나 선택하세요.
          </p>
          <ul className="mt-2 divide-y divide-border/60 border border-border/80 rounded-md">
            {sorted.map((r) => {
              const checked = selected === r.ascIndex
              return (
                <li key={r.ascIndex}>
                  <label className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors cursor-pointer',
                    checked ? 'bg-accent/40' : 'hover:bg-accent/20',
                  )}>
                    <input
                      type="radio"
                      name="titer-pick"
                      checked={checked}
                      onChange={() => setSelected(r.ascIndex)}
                      className="cursor-pointer"
                    />
                    <span className="font-mono text-[14px] tabular-nums">{r.date}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground">
                      {labLabel(r.lab)}
                    </span>
                    <span className="font-mono text-[13px] tabular-nums">
                      {r.value ? `${r.value} IU/ml` : '결과 없음'}
                    </span>
                    {r.receivedDate && (
                      <span className="ml-auto font-mono text-[12px] text-muted-foreground tabular-nums">
                        접수 {r.receivedDate}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        <DialogFooter
          bordered
          onCancel={() => onClose(null)}
          onPrimary={() => onClose(selected)}
          primaryLabel="이대로 발급"
        />
      </div>
    </div>,
    document.body,
  )
}
