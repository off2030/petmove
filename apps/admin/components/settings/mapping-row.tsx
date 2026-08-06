'use client'

/**
 * 여행지 → X 매핑 목록의 공용 행 (2026-08-06 재설계).
 *
 * 목록은 **읽기 전용 한 줄**: 여행지 3개 미리보기 + "+N개국", 오른쪽에 결과 칩, 끝에 편집 버튼.
 * 그룹(유럽연합 등) 개념은 없다 — 어떤 행이든 여행지 목록일 뿐이다.
 * 편집·삭제는 팝업(MappingEditModal)에서만 — 목록에 ✕ 를 두지 않아 스치는 클릭으로
 * 매핑이 사라지는 사고를 구조적으로 막는다(사용자가 스위스 매핑을 실수로 지운 사건).
 *
 * 사용처: 증명서(documents-section) · 광견병항체/전염병(inspection-section).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { SettingsActionButton } from './settings-layout'
import { DestinationPill, OverflowPill } from './destination-pills'

/** 한 줄에 보여줄 여행지 칩 수 — 넘치면 "+N개국". */
const PREVIEW_MAX = 3

export function MappingRow({
  countries,
  children,
  onEdit,
}: {
  countries: string[]
  /** 오른쪽 결과 칩(검사기관·증명서 등) — 읽기 전용 렌더. */
  children: React.ReactNode
  onEdit: () => void
}) {
  const visible = countries.slice(0, PREVIEW_MAX)
  const overflow = countries.length - visible.length

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-md py-2 border-b border-dotted border-border/80">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {visible.map((c) => (
          <DestinationPill key={c} name={c} />
        ))}
        {overflow > 0 && <OverflowPill count={overflow} />}
      </div>
      <div className="flex items-center gap-1.5">{children}</div>
      <SettingsActionButton onClick={onEdit}>편집</SettingsActionButton>
    </div>
  )
}

/**
 * 팝업 안 여행지 편집 — 칩 ✕ 로 삭제, '＋ 추가' 를 눌러야 검색창이 열린다.
 * 신고 탭 '적용 국가' 와 같은 패턴 (추가 진입점을 눈에 보이게).
 */
function CountryChipEditor({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const addWrapRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px] whitespace-nowrap"
          style={{ borderColor: 'var(--pmw-border-warm)', color: 'var(--pmw-near-black)' }}
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={`${v} 제거`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      {adding ? (
        <div
          ref={addWrapRef}
          className="flex-1 min-w-[200px]"
          onBlur={(e) => {
            if (!addWrapRef.current?.contains(e.relatedTarget as Node)) setAdding(false)
          }}
        >
          <DestinationPicker
            values={values}
            onChange={onChange}
            hideSelectedChips
            autoFocus
            variant="underline"
            placeholder="여행지 검색"
            aria-label="여행지 추가"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-sm border border-dashed px-2 py-0.5 font-sans text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          style={{ borderColor: 'var(--pmw-border-warm)' }}
        >
          ＋ 추가
        </button>
      )}
    </div>
  )
}

/**
 * 매핑 편집·추가 팝업 — 여행지(복수) + 결과(복수). 삭제는 여기서만.
 * 결과 선택 UI 는 화면마다 다르므로(증명서 multi-select / 검사기관 pill) children 슬롯.
 */
export function MappingEditModal({
  title,
  countries,
  onCountriesChange,
  resultLabel,
  children,
  canSubmit,
  onSubmit,
  onDelete,
  onClose,
}: {
  title: string
  countries: string[]
  onCountriesChange: (next: string[]) => void
  /** 오른쪽 선택 영역의 라벨 (예: '검사기관', '추가 증명서'). */
  resultLabel: string
  children: React.ReactNode
  canSubmit: boolean
  onSubmit: () => void
  /** 기존 매핑 편집일 때만 — 없으면 추가 모드. */
  onDelete?: () => void
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-sm border border-border/80 shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <span className="font-serif text-[16px] text-foreground">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-lg py-md space-y-md">
          <div>
            <p className="mb-1.5 font-serif text-[13px] text-muted-foreground">여행지</p>
            <CountryChipEditor values={countries} onChange={onCountriesChange} />
          </div>
          <div>
            <p className="mb-1.5 font-serif text-[13px] text-muted-foreground">{resultLabel}</p>
            {children}
          </div>
        </div>

        <DialogFooter
          bordered
          onCancel={onClose}
          onPrimary={onSubmit}
          primaryLabel="저장"
          primaryDisabled={!canSubmit}
          destructive={onDelete ? { onClick: onDelete, label: '매핑 삭제' } : undefined}
        />
      </div>
    </div>,
    document.body,
  )
}
