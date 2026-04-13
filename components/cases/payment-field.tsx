'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { useCases } from './cases-context'
import type { CaseRow } from '@/lib/supabase/types'

interface PaymentRecord {
  amount: number
  method: string | null
  date: string | null
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
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

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
    const r = await updateCaseField(caseId, 'data', 'payments', val)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'payments', val)
  }

  function deletePayment(idx: number) {
    const next = payments.filter((_, i) => i !== idx)
    startSave(() => savePayments(next))
  }

  function updatePayment(idx: number, field: keyof PaymentRecord, value: unknown) {
    const next = payments.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    startSave(() => savePayments(next))
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
    startSave(async () => {
      await savePayments(next)
      setAddingNew(false)
    })
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-1 pt-1">
        <span className="text-sm text-muted-foreground">결제</span>
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          disabled={saving || addingNew}
          className="text-muted-foreground/40 hover:text-foreground text-sm font-medium leading-none transition-colors disabled:opacity-30"
          title="결제 추가"
        >
          +
        </button>
      </div>
      <div className="min-w-0 space-y-0.5">
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
            <span className="text-muted-foreground/30 select-none">|</span>
            <span className="text-sm text-muted-foreground/60 italic">—</span>
            <span className="text-muted-foreground/30 select-none">|</span>
            <span className="text-sm text-muted-foreground/60 italic">—</span>
          </div>
        )}

        {payments.length === 0 && !addingNew && (
          <button type="button" onClick={() => setAddingNew(true)}
            className="text-left rounded-md px-2 py-1 -mx-2 text-sm text-muted-foreground/60 italic transition-colors hover:bg-accent/60 cursor-pointer">
            —
          </button>
        )}
      </div>
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
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text', amountDisplay === '—' && 'text-muted-foreground/60 italic')}>
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
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', methodDisplay === '—' && 'text-muted-foreground/60 italic')}>
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
          saving={saving}
        />
      ) : (
        <button type="button" onClick={() => onStartEdit('date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'text-muted-foreground/60 italic')}>
          {dateDisplay}
        </button>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 ml-1 opacity-0 group-hover/item:opacity-100"
      >
        ✕
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
      className="w-28 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
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

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div ref={ref} className="relative">
      <ul className="absolute left-0 top-0 z-20 min-w-[140px] rounded-md border border-border/50 bg-background py-1 shadow-md">
        <li>
          <button type="button" onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors">—</button>
        </li>
        {METHODS.map(m => (
          <li key={m.value}>
            <button type="button" onClick={() => onSelect(m.value)}
              className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-accent/60 transition-colors', current === m.value && 'font-medium')}>
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Date input ── */

function DateInput({ initial, onSave, onCancel, saving }: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const dateTypedRef = useRef(false)

  useEffect(() => { ref.current?.focus() }, [])

  function saveFromRef() {
    const raw = (ref.current?.value ?? '').trim()
    if (!raw) { onSave(''); return }
    const digits = raw.replace(/\D/g, '')
    let dateStr = ''
    if (digits.length === 8) dateStr = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
    else if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw)) {
      const parts = raw.split(/[-./]/)
      dateStr = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`
    } else {
      dateStr = raw
    }
    const d = new Date(dateStr)
    const year = parseInt(dateStr.split('-')[0], 10)
    if (isNaN(d.getTime()) || year < 1900 || year > 2100) return
    onSave(dateStr)
  }

  return (
    <input
      ref={ref}
      type="date"
      min="1900-01-01"
      max="2100-12-31"
      defaultValue={initial}
      onChange={(e) => {
        const v = e.target.value
        if (!v) { dateTypedRef.current = false; return }
        const year = parseInt(v.split('-')[0], 10)
        if (year < 1900 || year > 2100) { dateTypedRef.current = false; return }
        if (dateTypedRef.current) {
          onSave(v)
          dateTypedRef.current = false
        } else {
          saveFromRef()
        }
      }}
      onKeyDown={(e) => {
        dateTypedRef.current = true
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => saveFromRef(), 150)}
      className="w-36 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}
