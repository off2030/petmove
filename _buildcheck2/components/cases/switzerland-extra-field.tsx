'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { CopyButton } from './copy-button'

interface SwissExtra {
  entry_purpose: 'temporary' | 'relocation' | 'reentry' | null
  entry_date: string | null
  entry_airport: 'zurich' | 'geneva' | 'basel' | null
  /** §3 E-Mail — 고객 이메일 */
  email: string | null
  /** Dog only. `null` = unspecified, 'no' = 단미/단이 없음, 'tail'/'ears'/'both' = 해당 부위 */
  cropped: 'no' | 'tail' | 'ears' | 'both' | null
}

const EMPTY: SwissExtra = {
  entry_purpose: null,
  entry_date: null,
  entry_airport: null,
  email: null,
  cropped: null,
}

const DATA_KEY = 'switzerland_extra'

const PURPOSE_OPTIONS = [
  { value: 'temporary', label: 'Temporary (단기 체류)' },
  { value: 'relocation', label: 'Relocation (이주)' },
  { value: 'reentry', label: 'Re-entry (재입국)' },
]

const AIRPORT_OPTIONS = [
  { value: 'zurich', label: 'Zürich' },
  { value: 'geneva', label: 'Geneva' },
  { value: 'basel', label: 'Basel' },
]

const CROPPED_OPTIONS = [
  { value: 'no', label: '없음' },
  { value: 'tail', label: '꼬리' },
  { value: 'ears', label: '귀' },
  { value: 'both', label: '꼬리+귀' },
]

export function SwissExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extra: SwissExtra = { ...EMPTY, ...((data[DATA_KEY] as Partial<SwissExtra>) ?? {}) }

  // Crop 필드는 강아지 전용이지만, species 가 아직 비어있거나 'cat' 이 아니면 노출.
  const species = String(data.species ?? '').toLowerCase()
  const showCropped = species !== 'cat'

  const [editingField, setEditingField] = useState<string | null>(null)

  useEffect(() => { setEditingField(null) }, [caseId])

  // 해외주소는 top-level data.address_overseas 에 단일 문자열로 저장.
  // PDF 생성 시 parse 해서 street / postcode / city 로 분리 출력.
  const addressValue = (data.address_overseas as string | null) ?? null

  async function saveExtra(next: SwissExtra) {
    const hasAny = Object.values(next).some(v => v !== null)
    const val = hasAny ? next : null
    const r = await updateCaseField(caseId, 'data', DATA_KEY, val)
    if (r.ok) updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    setEditingField(null)
  }

  function saveField<K extends keyof SwissExtra>(key: K, value: SwissExtra[K]) {
    saveExtra({ ...extra, [key]: value })
  }

  async function saveAddress(value: string | null) {
    const v = value?.trim() || null
    const r = await updateCaseField(caseId, 'data', 'address_overseas', v)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'address_overseas', v)
    setEditingField(null)
  }

  function renderSelect(key: keyof SwissExtra, label: string, options: { value: string; label: string }[]) {
    const val = extra[key] as string | null
    const isEditing = editingField === key
    const display = val ? options.find(o => o.value === val)?.label ?? val : null
    return (
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
        <span className="text-base text-primary pt-1">{label}</span>
        {isEditing ? (
          <SelectInput
            options={options}
            initial={val ?? ''}
            onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField(key as string)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-text',
                !val && 'text-muted-foreground/60',
              )}
            >
              {display || '—'}
            </button>
            {display && (
              <>
                <CopyButton value={display} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <ClearButton onClick={() => saveField(key, null as SwissExtra[typeof key])} />
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderDate(key: keyof SwissExtra, label: string) {
    const val = extra[key] as string | null
    const isEditing = editingField === key
    return (
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
        <span className="text-base text-primary pt-1">{label}</span>
        {isEditing ? (
          <InlineInput
            type="date"
            initial={val ?? ''}
            placeholder=""
            onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField(key as string)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-text',
                !val && 'text-muted-foreground/60',
              )}
            >
              {val || '—'}
            </button>
            {val && (
              <>
                <CopyButton value={val} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <ClearButton onClick={() => saveField(key, null as SwissExtra[typeof key])} />
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
      {renderSelect('entry_purpose', '입국목적', PURPOSE_OPTIONS)}
      {renderDate('entry_date', '입국일')}
      {renderSelect('entry_airport', '입국공항', AIRPORT_OPTIONS)}

      {/* 해외주소 — 단일 문자열. "Rue du Lac 12, 1800 Vevey, Switzerland" 포맷.
          PDF 생성 시 자동 파싱해 Address/Postcode/City 로 분리 출력. */}
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
        <span className="text-base text-primary pt-1">해외주소</span>
        {editingField === 'address_overseas' ? (
          <InlineInput
            type="text"
            initial={addressValue ?? ''}
            placeholder="Rue du Lac 12, 1800 Vevey, Switzerland"
            onSave={(v) => saveAddress(v)}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField('address_overseas')}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-text',
                !addressValue && 'text-muted-foreground/60',
              )}
            >
              {addressValue || '—'}
            </button>
            {addressValue && (
              <>
                <CopyButton value={addressValue} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <ClearButton onClick={() => saveAddress(null)} />
              </>
            )}
          </div>
        )}
      </div>
      {renderText('email', '이메일', 'owner@example.com')}

      {showCropped && renderSelect('cropped', '단미·단이', CROPPED_OPTIONS)}
    </div>
  )

  function renderText(key: keyof SwissExtra, label: string, placeholder: string) {
    const val = extra[key] as string | null
    const isEditing = editingField === key
    return (
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-muted/60 last:border-0">
        <span className="text-base text-primary pt-1">{label}</span>
        {isEditing ? (
          <InlineInput
            type="text"
            initial={val ?? ''}
            placeholder={placeholder}
            onSave={(v) => saveField(key, (v as SwissExtra[typeof key]))}
            onCancel={() => setEditingField(null)}
          />
        ) : (
          <div className="group/val inline-flex items-baseline">
            <button
              type="button"
              onClick={() => setEditingField(key as string)}
              className={cn(
                'text-left rounded-md px-2 py-0.5 -mx-2 text-base transition-colors hover:bg-accent/60 cursor-text',
                !val && 'text-muted-foreground/60',
              )}
            >
              {val || '—'}
            </button>
            {val && (
              <>
                <CopyButton value={val} className="ml-1 opacity-0 group-hover/val:opacity-100" />
                <ClearButton onClick={() => saveField(key, null as SwissExtra[typeof key])} />
              </>
            )}
          </div>
        )}
      </div>
    )
  }
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="삭제"
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover/val:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )
}

function InlineInput({ type, initial, placeholder, onSave, onCancel }: {
  type: 'text' | 'date'
  initial: string
  placeholder: string
  onSave: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initial)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <input
      ref={ref}
      type={type}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(val.trim() || null) }
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => onSave(val.trim() || null), 150)}
      placeholder={placeholder}
      className="h-7 w-full max-w-[320px] rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

function SelectInput({ options, initial, onSave, onCancel }: {
  options: { value: string; label: string }[]
  initial: string
  onSave: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <select
      ref={ref}
      defaultValue={initial}
      onChange={(e) => onSave(e.target.value || null)}
      onBlur={() => setTimeout(onCancel, 150)}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="h-7 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    >
      <option value="">선택</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
