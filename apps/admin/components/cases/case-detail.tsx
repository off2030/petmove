'use client'

import type { CaseRow } from '@/lib/supabase/types'
import type { FieldSpec } from '@/lib/fields'
import {
  buildFieldSpecs,
  groupFieldSpecs,
  HIDDEN_EN_KEYS,
  readCaseField,
} from '@/lib/fields'
import { getAllowedFields, getVaccineList, getEffectiveVaccineList, getDestinationOverride, TOGGLEABLE_FIELDS } from '@petmove/domain'
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { DateTextField } from '@/components/ui/date-text-field'
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
import { SwissExtraField } from './switzerland-extra-field'
import { UKExtraField } from './uk-extra-field'
import { OverseasAddressField } from './overseas-address-field'
import { useCases } from './cases-context'
import { VerificationProvider, severityTextClass, tooltipText, useFieldVerification } from './verification-context'

type ExtraFieldProps = { caseId: string; caseRow: CaseRow }

/** destOverride.extraSection 값 → 해당 국가 추가정보 컴포넌트. */
const EXTRA_SECTION_COMPONENTS: Record<string, React.ComponentType<ExtraFieldProps>> = {
  japan: JapanExtraField,
  thailand: ThailandExtraField,
  philippines: PhilippinesExtraField,
  usa: UsaExtraField,
  australia: AustraliaExtraField,
  new_zealand: NewZealandExtraField,
  hawaii: HawaiiExtraField,
  switzerland: SwissExtraField,
  uk: UKExtraField,
}

/**
 * Right-pane detail. No top title — destination gets a standalone prominent
 * display at the top, then the three groups (고객정보 / 동물정보 / 절차정보),
 * then a footer with timestamps.
 */
export function CaseDetail({ caseRow, scrollRef }: { caseRow: CaseRow; scrollRef?: React.Ref<HTMLDivElement> }) {
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
    <VerificationProvider caseRow={caseRow} destination={viewDestination}>
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 flex flex-col px-lg py-md overflow-y-auto overflow-x-hidden scrollbar-minimal"
    >
      {/* ─── Sections ─── */}
      {groups.map((g, groupIdx) => (
        <React.Fragment key={g.group}>
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-[10px]">
            <span className="font-mono text-[12px] tracking-[1px] text-muted-foreground">
              {String(groupIdx + 1).padStart(2, '0')}
            </span>
            <h3 className="font-serif text-[15px] font-medium uppercase tracking-[0.4px] text-foreground">
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
                        zipcode={(data.address_zipcode as string | null) ?? null}
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
                    {vaccineList.includes('infectious_disease') && data.species !== 'cat' && <InfectiousDiseaseField caseId={caseRow.id} caseRow={caseRow} destination={viewDestination} />}
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
              // Status 는 항상 값을 가져야 하므로 삭제 버튼 제외.
              const isClearable = (g.group === '절차정보' || g.group === '기타정보') && spec.key !== 'status'
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
        {g.group === '절차정보' && (() => {
          const ExtraComp = destOverride?.extraSection ? EXTRA_SECTION_COMPONENTS[destOverride.extraSection] : null
          const extraFieldsOnly = !destOverride?.extraSection && (destOverride?.extraFields?.length ?? 0) > 0
          if (!ExtraComp && !extraFieldsOnly) return null
          return (
            <section className="mb-7">
              <div className="mb-3 flex items-center gap-[10px]">
                <span className="font-mono text-[12px] tracking-[1px] text-muted-foreground">
                  {String(groups.length + 1).padStart(2, '0')}
                </span>
                <h3 className="font-serif text-[15px] font-medium uppercase tracking-[0.4px] text-foreground">
                  추가정보
                </h3>
              </div>
              <div>
                {ExtraComp && <ExtraComp caseId={caseRow.id} caseRow={caseRow} />}
                {extraFieldsOnly && destOverride!.extraFields!.includes('address_overseas') && (
                  <OverseasAddressField caseId={caseRow.id} caseRow={caseRow} />
                )}
              </div>
            </section>
          )
        })()}
        </React.Fragment>
      ))}

    </div>
    </VerificationProvider>
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
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60">
      <div className="flex items-center gap-[6px] pt-1">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">{spec.label}</span>
        {!showSecondary && (
          <button type="button" onClick={() => { setShowSecondary(true); setEditingSecondary(true); setSecVal(''); setSecError(null) }}
            className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
            title="보조 마이크로칩 추가">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
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
                  className="text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text">
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
  const implantInfo = useFieldVerification('microchip_implant_date')
  const implantColorCls = implantInfo ? severityTextClass(implantInfo.severity) : ''
  const implantTitle = implantInfo ? tooltipText(implantInfo) : undefined

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
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60">
      <div className="flex items-center gap-[6px] pt-1">
        <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">마이크로칩</span>
      </div>
      <div className="group/item flex items-baseline gap-[10px] min-w-0 flex-wrap">
        {editing ? (
          <MicrochipDateInput initial={implantDate} onSave={(v) => saveDate(v || null)} onCancel={() => setEditing(false)} />
        ) : (
          <span className="group/v relative inline-flex items-baseline">
            <button type="button" onClick={() => setEditing(true)} title={implantTitle}
              className={cn(
                'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
                !implantDate && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                implantColorCls,
              )}>
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
  return (
    <DateTextField
      autoFocus
      value={initial}
      onChange={(v) => onSave(v)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className="w-36 bg-transparent border-0 border-b border-primary text-sm py-1 focus:outline-none"
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
        className="shrink-0 translate-y-[2px] text-muted-foreground/60 hover:text-foreground transition-colors"
        title="필드 추가/제거"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
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
                  'w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-sm',
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
