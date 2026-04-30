'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useTransition } from 'react'
import { Calculator as CalculatorIcon, Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn, roundIconBtn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'
import { DateTextField } from '@/components/ui/date-text-field'
import { useCalculatorData } from '@/components/providers/calculator-data-provider'
import {
  CalculatorOutputModal,
  type EstimateSnapshot,
} from '@/components/calculator/calculator-output-modal'
import { useSectionEditMode } from './section-edit-mode-context'

interface PaymentRecord {
  amount: number
  method: string | null
  date: string | null
}

function firstDestination(raw: string | null): string | null {
  if (!raw) return null
  const tok = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return tok[0] ?? null
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cash_receipt', label: 'Cash Receipt' },
  { value: 'card', label: 'Card' },
]

export interface PaymentFieldHandle {
  triggerAdd: () => void
}

export const PaymentField = forwardRef<PaymentFieldHandle, { caseId: string; caseRow: CaseRow; hideAddButton?: boolean }>(function PaymentField({ caseId, caseRow, hideAddButton }, ref) {
  const { updateLocalCaseField, activeDestination } = useCases()
  const editMode = useSectionEditMode()
  const { items: calcItems } = useCalculatorData()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  const species: 'dog' | 'cat' = data.species === 'cat' ? 'cat' : 'dog'
  const country = activeDestination ?? firstDestination(caseRow.destination)
  const savedEstimate = (data.estimate as EstimateSnapshot | undefined) ?? null

  const [estimateOpen, setEstimateOpen] = useState(false)

  // Read payments array (backward compat: old flat keys → array)
  function readPayments(): PaymentRecord[] {
    if (Array.isArray(data.payments)) return data.payments as PaymentRecord[]
    if (data.payment_amount) {
      return [{
        amount: Number(data.payment_amount),
        method: (data.payment_method as string) || null,
        date: null,
      }]
    }
    return []
  }

  const payments = readPayments()

  const [saving, startSave] = useTransition()

  // Edit state
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<'amount' | 'method' | 'date' | null>(null)

  // New row being added (not yet saved)
  const [addingNew, setAddingNew] = useState(false)

  useImperativeHandle(ref, () => ({
    triggerAdd: () => setAddingNew(true),
  }))

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
  }, [caseId])

  async function savePayments(next: PaymentRecord[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prevSnapshot = payments
    updateLocalCaseField(caseId, 'data', 'payments', val)
    const r = await updateCaseField(caseId, 'data', 'payments', val)
    if (!r.ok) {
      updateLocalCaseField(caseId, 'data', 'payments', prevSnapshot.length > 0 ? prevSnapshot : null)
    }
  }

  function deletePayment(idx: number) {
    const next = payments.filter((_, i) => i !== idx)
    savePayments(next).catch(() => {})
  }

  function updatePayment(idx: number, field: keyof PaymentRecord, value: unknown) {
    const next = payments.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    savePayments(next).catch(() => {})
  }

  // New row: save only when amount is entered
  function saveNewPayment(amount: number | null) {
    if (!amount) {
      // Cancelled or empty — discard
      setAddingNew(false)
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const next = [...payments, { amount, method: 'cash', date: today }]
    setAddingNew(false)
    savePayments(next).catch(() => {})
  }

  function handleSaveEstimate({ amount, estimate }: { amount: number; estimate: EstimateSnapshot }) {
    const today = new Date().toISOString().slice(0, 10)
    const method = estimate.priceMode === 'cash' ? 'cash' : 'card'
    const next = [...payments, { amount, method, date: today }]
    // Optimistic — UI 즉시 반영.
    updateLocalCaseField(caseId, 'data', 'estimate', estimate)
    setEstimateOpen(false)
    savePayments(next).catch(() => {})
    void updateCaseField(caseId, 'data', 'estimate', estimate)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60 last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => setAddingNew(true) : undefined}
          title={editMode ? '결제 추가' : undefined}
        >
          결제
        </SectionLabel>
      </div>
      <div className="min-w-0 flex items-start gap-md">
        <div className="flex-1 min-w-0 space-y-0.5">
          {payments.map((p, i) => (
            <PaymentRow
              key={i}
              record={p}
              isEditing={editIdx === i ? editField : null}
              onStartEdit={(field) => { setEditIdx(i); setEditField(field) }}
              onStopEdit={() => { setEditIdx(null); setEditField(null) }}
              onUpdateField={(field, value) => updatePayment(i, field, value)}
              onDelete={() => deletePayment(i)}
              saving={saving}
            />
          ))}

          {/* New row being added — amount input only, not yet saved */}
          {addingNew && (
            <div className="flex items-baseline gap-[10px] min-w-0">
              <AmountInput
                initial={0}
                onSave={(v) => saveNewPayment(v)}
                onCancel={() => setAddingNew(false)}
                saving={saving}
              />
              {editMode && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setEstimateOpen(true)}
                  disabled={!country}
                  className={roundIconBtn}
                  title={country ? '비용 안내' : '목적지를 먼저 선택해주세요'}
                >
                  <CalculatorIcon size={15} />
                </button>
              )}
              <span className="text-muted-foreground/30 select-none">|</span>
              <span className="text-sm text-muted-foreground/60">미입력</span>
              <span className="text-muted-foreground/30 select-none">|</span>
              <span className="text-sm text-muted-foreground/60">미입력</span>
            </div>
          )}
        </div>
      </div>

      {estimateOpen && country && (
        <CalculatorOutputModal
          initialCountry={country}
          initialSpecies={species}
          allItems={calcItems}
          initialEstimate={savedEstimate}
          onSaveAsPayment={handleSaveEstimate}
          saving={saving}
          customerName={(caseRow as { customer_name?: string | null }).customer_name ?? null}
          petName={(caseRow as { pet_name?: string | null }).pet_name ?? null}
          onClose={() => setEstimateOpen(false)}
        />
      )}
    </div>
  )
})

/* ── Single payment row ── */

function PaymentRow({
  record,
  isEditing,
  onStartEdit,
  onStopEdit,
  onUpdateField,
  onDelete,
  saving,
}: {
  record: PaymentRecord
  isEditing: 'amount' | 'method' | 'date' | null
  onStartEdit: (field: 'amount' | 'method' | 'date') => void
  onStopEdit: () => void
  onUpdateField: (field: keyof PaymentRecord, value: unknown) => void
  onDelete: () => void
  saving: boolean
}) {
  const amountDisplay = record.amount ? `₩${Number(record.amount).toLocaleString()}` : '—'
  const methodObj = METHODS.find(m => m.value === record.method)
  const methodDisplay = methodObj?.label ?? '—'
  const dateDisplay = record.date || '—'

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0">
      {/* Amount */}
      {isEditing === 'amount' ? (
        <AmountInput
          initial={record.amount || 0}
          onSave={(v) => { onUpdateField('amount', v); onStopEdit() }}
          onCancel={onStopEdit}
          saving={saving}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('amount')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text', amountDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {amountDisplay}
        </button>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Method */}
      {isEditing === 'method' ? (
        <MethodDropdown
          current={record.method}
          onSelect={(v) => { onUpdateField('method', v); onStopEdit() }}
          onClose={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('method')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer', methodDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {methodDisplay}
        </button>
      )}

      <span className="text-muted-foreground/30 select-none">|</span>

      {/* Date */}
      {isEditing === 'date' ? (
        <DateInput
          initial={record.date || ''}
          onSave={(v) => { onUpdateField('date', v || null); onStopEdit() }}
          onCancel={onStopEdit}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {dateDisplay}
        </button>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        title="삭제"
        className="shrink-0 inline-flex items-center justify-center rounded-md p-1 ml-1 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

/* ── Amount input ── */

function AmountInput({ initial, onSave, onCancel, saving }: {
  initial: number
  onSave: (v: number | null) => void
  onCancel: () => void
  saving: boolean
}) {
  const [val, setVal] = useState(initial ? String(initial) : '')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  function save() {
    const digits = val.replace(/\D/g, '')
    onSave(digits ? Number(digits) : null)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={val}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => setTimeout(() => { if (!saving) save() }, 150)}
      placeholder="금액"
      className="w-28 h-8 rounded-md border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

/* ── Method dropdown ── */

function MethodDropdown({ current, onSelect, onClose }: {
  current: string | null
  onSelect: (v: string | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [openUp, setOpenUp] = useState(false)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  // 아래 공간이 부족하면 위로 펼침 — 스크롤 컨테이너 끝에서 잘림 방지.
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const dropdownHeight = (METHODS.length + 1) * 36 + 16
    if (rect.bottom + dropdownHeight > window.innerHeight - 16) setOpenUp(true)
  }, [])

  return (
    <div ref={ref} className="relative">
      <ul
        className={cn(
          'absolute left-0 z-20 min-w-[140px] rounded-md border border-border/80 bg-background py-1 shadow-md',
          openUp ? 'bottom-full mb-1' : 'top-0',
        )}
      >
        <li>
          <button type="button" onClick={() => onSelect(null)}
            className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors">—</button>
        </li>
        {METHODS.map(m => (
          <li key={m.value}>
            <button type="button" onClick={() => onSelect(m.value)}
              className={cn('w-full text-left px-sm py-1.5 text-sm hover:bg-accent/60 transition-colors', current === m.value && 'font-medium')}>
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Date input ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  return (
    <DateTextField
      autoFocus
      value={initial}
      onChange={(v) => onSave(v)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
