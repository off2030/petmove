'use client'

import type { CaseRow } from '@/lib/supabase/types'
import type { FieldSpec } from '@/lib/fields'
import {
  buildFieldSpecs,
  groupFieldSpecs,
  HIDDEN_EN_KEYS,
  readCaseField,
} from '@/lib/fields'
import { getAllowedFields, getVaccineList, getEffectiveVaccineList, getDestinationOverride, TOGGLEABLE_FIELDS } from '@/lib/destination-config'
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { EditableField } from './editable-field'
import { PairedField } from './paired-field'
import { CustomerNameRow } from './customer-name-row'
import { AddressField } from './address-field'
import { BreedField } from './breed-field'
import { ColorField } from './color-field'
import { DestinationField } from './destination-field'
import { PaymentField } from './payment-field'
import { RabiesTiterField } from './rabies-titer-field'
import { RepeatableDateField } from './repeatable-date-field'
import { InfectiousDiseaseField } from './infectious-disease-field'
import { NotesField } from './notes-field'
import { JapanExtraField } from './japan-extra-field'
import { ThailandExtraField } from './thailand-extra-field'
import { PhilippinesExtraField } from './philippines-extra-field'
import { UsaExtraField } from './usa-extra-field'
import { AustraliaExtraField } from './australia-extra-field'
import { NewZealandExtraField } from './new-zealand-extra-field'
import { HawaiiExtraField } from './hawaii-extra-field'
import { OverseasAddressField } from './overseas-address-field'
import { useCases } from './cases-context'

/**
 * Right-pane detail. No top title — destination gets a standalone prominent
 * display at the top, then the three groups (고객정보 / 동물정보 / 절차정보),
 * then a footer with timestamps.
 */
export function CaseDetail({ caseRow }: { caseRow: CaseRow }) {
  const { fieldDefs, updateLocalCaseField, activeDestination } = useCases()
  const allSpecs = buildFieldSpecs(fieldDefs)
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[]) ?? []

  // 다중 목적지 케이스는 활성 목적지 하나만 기준으로 필드·백신을 결정한다.
  // 활성값이 아직 비어있으면(초기 렌더) caseRow.destination 전체를 그대로 넘겨
  // 적어도 첫 매칭 오버라이드라도 적용되게 한다.
  const viewDestination = activeDestination ?? caseRow.destination

  const allowedFields = getAllowedFields(viewDestination, extraFields)
  const vaccineList = getEffectiveVaccineList(viewDestination, extraFields)
  const destOverride = getDestinationOverride(viewDestination)

  // Toggleable fields not in the base destination config (can be toggled on/off)
  const baseVaccines = getVaccineList(viewDestination) // destination default only
  const toggleableForDest = TOGGLEABLE_FIELDS.filter((t) => {
    if (t.key.startsWith('vaccine:')) {
      const v = t.key.slice('vaccine:'.length)
      return !baseVaccines.includes(v) // not in destination default → toggleable
    }
    return !allowedFields.has(t.key)
  })

  const sectionSpecs = allSpecs.filter((s) => {
    if (HIDDEN_EN_KEYS.has(s.key)) return false
    if (!allowedFields.has(s.key)) return false
    return true
  })
  const groups = groupFieldSpecs(sectionSpecs)

  async function toggleField(key: string) {
    const current = [...extraFields]
    const idx = current.indexOf(key)
    const next = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, key]
    const val = next.length > 0 ? next : null
    const r = await updateCaseField(caseRow.id, 'data', 'extra_visible_fields', val)
    if (r.ok) updateLocalCaseField(caseRow.id, 'data', 'extra_visible_fields', val)
  }

  return (
    <div>
      {/* ─── Sections ─── */}
      {groups.map((g) => (
        <React.Fragment key={g.group}>
        <section className="mb-7">
          <div className="mb-2 flex items-center gap-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.group}
            </h3>
            {g.group === '절차정보' && toggleableForDest.length > 0 && (
              <FieldToggleMenu
                items={toggleableForDest}
                activeKeys={extraFields}
                onToggle={toggleField}
              />
            )}
          </div>
          <div>
            {g.items.map((spec) => {
              // 기타정보 is handled specially — after all its items we append Attachments + Payment
              // (see below after the map)
              // Address: combined Korean + English with Daum Postcode search
              if (spec.key === 'phone') {
                // Insert AddressField AFTER phone (before email)
                const addrKrSpec = allSpecs.find((s) => s.key === 'address_kr')
                const addrEnSpec = allSpecs.find((s) => s.key === 'address_en')
                return (
                  <div key="phone+address">
                    <EditableField
                      caseId={caseRow.id}
                      spec={spec}
                      rawValue={readCaseField(caseRow, spec)}
                    />
                    {addrKrSpec && (
                      <AddressField
                        caseId={caseRow.id}
                        krSpec={addrKrSpec}
                        enSpec={addrEnSpec}
                        krRaw={readCaseField(caseRow, addrKrSpec)}
                        enRaw={addrEnSpec ? readCaseField(caseRow, addrEnSpec) : null}
                      />
                    )}
                  </div>
                )
              }

              // Memo → unified notes (text + files) + Payment rendered after the group loop
              if (spec.key === 'memo') {
                return (
                  <NotesField
                    key="notes"
                    caseId={caseRow.id}
                    caseRow={caseRow}
                  />
                )
              }

              // Microchip: implant date | check date on same row
              if (spec.key === 'microchip_implant_date') {
                return (
                  <MicrochipDatesRow key="microchip-dates" caseId={caseRow.id} caseRow={caseRow} />
                )
              }

              // Repeatable schedule fields: after comprehensive (종합백신),
              // insert all array-based schedule fields
              if (spec.key === 'general_vaccine') {
                return (
                  <div key="general_vaccine+schedule">
                    {vaccineList.includes('rabies') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="광견병" dataKey="rabies_dates" />}
                    {vaccineList.includes('rabies_titer') && <RabiesTiterField caseId={caseRow.id} caseRow={caseRow} destination={viewDestination} />}
                    {vaccineList.includes('general') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="종합백신" dataKey="general_vaccine_dates" legacyKey="general_vaccine" />}
                    {vaccineList.includes('civ') && data.species !== 'cat' && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="CIV" dataKey="civ_dates" />}
                    {vaccineList.includes('kennel') && data.species !== 'cat' && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="켄넬코프" dataKey="kennel_cough_dates" />}
                    {vaccineList.includes('infectious_disease') && <InfectiousDiseaseField caseId={caseRow.id} caseRow={caseRow} destination={viewDestination} />}
                    {vaccineList.includes('external_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="외부구충" dataKey="external_parasite_dates" hideValidUntil siblingKey="internal_parasite_dates" />}
                    {vaccineList.includes('internal_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="내부구충" dataKey="internal_parasite_dates" hideValidUntil siblingKey="external_parasite_dates" />}
                    {vaccineList.includes('heartworm') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="심장사상충" dataKey="heartworm_dates" hideValidUntil />}
                  </div>
                )
              }

              // 전염병검사: handled inside general_vaccine block above
              if (spec.key === 'infectious_disease_test') return null

              // Destination: searchable country selector
              if (spec.key === 'destination') {
                return (
                  <DestinationField
                    key="destination"
                    caseId={caseRow.id}
                    destination={caseRow.destination}
                  />
                )
              }

              // Microchip: main + optional secondary with + button
              if (spec.key === 'microchip') {
                return (
                  <MicrochipField key="microchip" caseId={caseRow.id} caseRow={caseRow} spec={spec} />
                )
              }

              // Breed: searchable breed selector with ko/en auto-fill
              if (spec.key === 'species') {
                // Insert BreedField + ColorField after species (종)
                return (
                  <div key="species+breed+color">
                    <EditableField
                      caseId={caseRow.id}
                      spec={spec}
                      rawValue={readCaseField(caseRow, spec)}
                    />
                    <BreedField caseId={caseRow.id} caseRow={caseRow} />
                    <ColorField caseId={caseRow.id} caseRow={caseRow} />
                  </div>
                )
              }

              // Customer name: special row with combined "First Last" English display
              if (spec.key === 'customer_name') {
                return (
                  <CustomerNameRow
                    key="customer_name"
                    caseId={caseRow.id}
                    caseRow={caseRow}
                  />
                )
              }
              // Paired text field: render ko + en on one row
              if (spec.pairEnKey) {
                const enSpec = allSpecs.find((s) => s.key === spec.pairEnKey)
                return (
                  <PairedField
                    key={`pair:${spec.storage}:${spec.key}`}
                    caseId={caseRow.id}
                    koSpec={spec}
                    enSpec={enSpec}
                    koRaw={readCaseField(caseRow, spec)}
                    enRaw={
                      enSpec ? readCaseField(caseRow, enSpec) : null
                    }
                  />
                )
              }
              const isClearable = g.group === '절차정보' || g.group === '기타정보'
              return (
                <EditableField
                  key={`${spec.storage}:${spec.key}`}
                  caseId={caseRow.id}
                  spec={spec}
                  rawValue={readCaseField(caseRow, spec)}
                  clearable={isClearable}
                />
              )
            })}
            {/* 기타정보: Payment (attachments now inside NotesField) */}
            {g.group === '기타정보' && (
              <PaymentField caseId={caseRow.id} caseRow={caseRow} />
            )}
          </div>
        </section>
        {/* ─── 추가정보 — 절차정보 바로 뒤 ─── */}
        {g.group === '절차정보' && destOverride?.extraSection === 'japan' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <JapanExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'thailand' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <ThailandExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'philippines' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <PhilippinesExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'usa' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <UsaExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'australia' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <AustraliaExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'new_zealand' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <NewZealandExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && destOverride?.extraSection === 'hawaii' && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              <HawaiiExtraField caseId={caseRow.id} caseRow={caseRow} />
            </div>
          </section>
        )}
        {g.group === '절차정보' && !destOverride?.extraSection && destOverride?.extraFields && destOverride.extraFields.length > 0 && (
          <section className="mb-7">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              추가정보
            </h3>
            <div>
              {destOverride.extraFields.includes('address_overseas') && (
                <OverseasAddressField caseId={caseRow.id} caseRow={caseRow} />
              )}
            </div>
          </section>
        )}
        </React.Fragment>
      ))}

    </div>
  )
}

/**
 * Microchip: main chip + optional secondary chip (+ button to add)
 */
function MicrochipField({ caseId, caseRow, spec }: { caseId: string; caseRow: CaseRow; spec: FieldSpec }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const secondary = (data.microchip_secondary as string) || ''
  const [showSecondary, setShowSecondary] = useState(!!secondary)
  const [editingSecondary, setEditingSecondary] = useState(false)
  const [secVal, setSecVal] = useState(secondary)
  const [secError, setSecError] = useState<string | null>(null)
  const secRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setShowSecondary(!!((caseRow.data as Record<string, unknown>)?.microchip_secondary))
    setEditingSecondary(false)
    setSecError(null)
  }, [caseId, caseRow.data])

  useEffect(() => {
    if (editingSecondary && secRef.current) secRef.current.focus()
  }, [editingSecondary])

  function formatChip(v: string) {
    const digits = v.replace(/\D/g, '')
    if (digits.length === 15) return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
    return v
  }

  async function saveSecondary() {
    const raw = secVal.trim()
    if (!raw) {
      const r = await updateCaseField(caseId, 'data', 'microchip_secondary', null)
      if (r.ok) updateLocalCaseField(caseId, 'data', 'microchip_secondary', null)
      setEditingSecondary(false)
      setShowSecondary(false)
      return
    }
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 15) {
      setSecError('유효한 번호가 아닙니다')
      return
    }
    const r = await updateCaseField(caseId, 'data', 'microchip_secondary', digits)
    if (r.ok) {
      updateLocalCaseField(caseId, 'data', 'microchip_secondary', digits)
      setSecError(null)
      setEditingSecondary(false)
    } else {
      setSecError(r.error)
    }
  }

  function handleSecChange(raw: string) {
    const filtered = raw.replace(/\D/g, '')
    setSecVal(filtered)
    if (raw !== filtered) {
      setSecError('숫자만 입력 가능합니다')
      setTimeout(() => setSecError(null), 2000)
    }
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40">
      <div className="flex items-center gap-1 pt-1">
        <span className="text-sm text-muted-foreground">{spec.label}</span>
        {!showSecondary && (
          <button type="button" onClick={() => { setShowSecondary(true); setEditingSecondary(true); setSecVal(''); setSecError(null) }}
            className="text-muted-foreground/40 hover:text-foreground text-sm font-medium leading-none transition-colors"
            title="보조 마이크로칩 추가">
            +
          </button>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-[30px]">
          {/* Main chip */}
          <div className="group/val relative w-fit">
            <EditableField caseId={caseId} spec={spec} rawValue={readCaseField(caseRow, spec)} inline />
            <CopyButton
              value={caseRow.microchip ? String(caseRow.microchip).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4 $5') : ''}
              className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
            />
          </div>

          {/* Secondary chip — pipe separated, same line */}
          {showSecondary && (
            <div className="group/item inline-flex items-baseline gap-[6px]">
              <span className="text-muted-foreground/30 select-none">|</span>
              {editingSecondary ? (
                <input ref={secRef} type="text" inputMode="numeric" value={secVal}
                  onChange={(e) => handleSecChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSecondary(); if (e.key === 'Escape') { setEditingSecondary(false); setSecError(null); if (!secondary) setShowSecondary(false) } }}
                  onBlur={() => setTimeout(() => saveSecondary(), 150)}
                  placeholder="보조칩 번호"
                  className="w-44 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
                />
              ) : (
                <button type="button" onClick={() => { setSecVal(secondary.replace(/\D/g, '')); setEditingSecondary(true); setSecError(null) }}
                  className="text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-text">
                  {formatChip(secondary)}
                </button>
              )}
              <CopyButton
                value={formatChip(secondary)}
                className="shrink-0 opacity-0 group-hover/item:opacity-100"
              />
              <button type="button" onClick={async () => {
                const r = await updateCaseField(caseId, 'data', 'microchip_secondary', null)
                if (r.ok) updateLocalCaseField(caseId, 'data', 'microchip_secondary', null)
                setShowSecondary(false)
                setSecError(null)
              }} className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100">
                ✕
              </button>
            </div>
          )}
        </div>
        {secError && <div className="mt-1 text-xs text-red-600">{secError}</div>}
      </div>
    </div>
  )
}

/**
 * Microchip implant date row.
 */
function MicrochipDatesRow({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const implantDate = (data.microchip_implant_date as string) || ''

  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setEditing(false)
  }, [caseId])

  async function saveDate(value: string | null) {
    const r = await updateCaseField(caseId, 'data', 'microchip_implant_date', value)
    if (r.ok) updateLocalCaseField(caseId, 'data', 'microchip_implant_date', value)
    setEditing(false)
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40">
      <div className="flex items-center gap-1 pt-1">
        <span className="text-sm text-muted-foreground">마이크로칩</span>
      </div>
      <div className="group/item flex items-baseline gap-[10px] min-w-0 flex-wrap">
        {editing ? (
          <MicrochipDateInput initial={implantDate} onSave={(v) => saveDate(v || null)} onCancel={() => setEditing(false)} />
        ) : (
          <span className="group/v relative inline-flex items-baseline">
            <button type="button" onClick={() => setEditing(true)}
              className={cn('text-left rounded-md px-2 py-1 -mx-2 text-sm transition-colors hover:bg-accent/60 cursor-pointer', !implantDate && 'text-muted-foreground/60 italic')}>
              {implantDate || '—'}
            </button>
            {implantDate && <CopyButton value={implantDate} className="ml-1 opacity-0 group-hover/v:opacity-100" />}
          </span>
        )}

        {implantDate && !editing && (
          <button type="button" onClick={() => saveDate(null)}
            className="text-xs text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover/item:opacity-100">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

function MicrochipDateInput({ initial, onSave, onCancel }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  function saveFromRef() {
    const raw = (ref.current?.value ?? '').trim()
    if (!raw) { onSave(''); return }
    onSave(raw)
  }

  return (
    <input ref={ref} type="date" min="1900-01-01" max="2100-12-31" defaultValue={initial}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveFromRef() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => setTimeout(() => {
        if (!(ref.current?.value ?? '').trim()) return
        saveFromRef()
      }, 150)}
      className="w-36 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

/**
 * Dropdown toggle for adding hidden fields to the section.
 */
function FieldToggleMenu({ items, activeKeys, onToggle }: {
  items: { key: string; label: string }[]
  activeKeys: string[]
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="text-muted-foreground/40 hover:text-foreground text-xs font-medium leading-none transition-colors"
        title="필드 추가/제거"
      >
        +
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md">
          {items.map((item) => {
            const active = activeKeys.includes(item.key)
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onToggle(item.key)}
                className={cn(
                  'w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2',
                  active && 'text-foreground',
                  !active && 'text-muted-foreground',
                )}
              >
                <span className="w-4 text-center text-xs">{active ? '✓' : ''}</span>
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Empty state when no case is selected.
 */
export function CaseDetailEmpty() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-2">📖</div>
        <p>왼쪽에서 케이스를 선택하세요.</p>
      </div>
    </div>
  )
}
