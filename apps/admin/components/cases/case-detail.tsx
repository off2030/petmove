'use client'

import type { CaseRow } from '@/lib/supabase/types'
import type { FieldSpec } from '@/lib/fields'
import {
  buildFieldSpecs,
  groupFieldSpecs,
  HIDDEN_EN_KEYS,
  readCaseField,
} from '@/lib/fields'
import { getAllowedFields, getVaccineList, getEffectiveVaccineEntries, getEffectiveExtraFieldEntries, getDestinationOverride, TOGGLEABLE_FIELDS, vaccineMatchesSpecies, extraFieldMatchesSpecies, findCustomDestination, EXTRA_FIELD_DEFS, EXTRA_FIELD_KEY_LABELS, readEffectiveExtraValue, SWISS_ENTRY_AIRPORT_OPTIONS, THAILAND_ENTRY_AIRPORT_OPTIONS, type ExtraFieldDef } from '@petmove/domain'
import { useDestinationOverrides } from '@/components/providers/destination-overrides-provider'
import React, { useEffect, useRef, useState } from 'react'
import { Paperclip, Trash2 } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { DateTextField } from '@/components/ui/date-text-field'
import { SectionLabel } from '@/components/ui/section-label'
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
// 통합 리팩터: country-specific extra section 컴포넌트들은 더 이상 라우팅 안 됨.
// 모든 destination 이 SimpleExtraSection 으로 일반 렌더링됨. 컴포넌트 파일은 보관 (file extraction 로직 등 향후 통합 가능).
import { OverseasAddressField } from './overseas-address-field'
import { useCases } from './cases-context'
import { VerificationProvider, severityTextClass, tooltipText, useFieldVerification } from './verification-context'
import { SectionEditModeProvider, useSectionEditMode } from './section-edit-mode-context'
import { extractExtra, type Country } from '@/lib/actions/extract-extra'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'

// EXTRA_SECTION_COMPONENTS 라우팅은 통합 리팩터로 제거됨 — 모든 destination 이 SimpleExtraSection 사용.

/**
 * Right-pane detail. No top title — destination gets a standalone prominent
 * display at the top, then the three groups (고객정보 / 동물정보 / 절차정보),
 * then a footer with timestamps.
 */
export function CaseDetail({ caseRow, scrollRef }: { caseRow: CaseRow; scrollRef?: React.Ref<HTMLDivElement> }) {
  const { fieldDefs, updateLocalCaseField, activeDestination } = useCases()
  const { config: destOverridesConfig } = useDestinationOverrides()
  const allSpecs = buildFieldSpecs(fieldDefs)
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[]) ?? []
  const speciesValue = (data.species as string) ?? ''

  // 다중 목적지 케이스는 활성 목적지 하나만 기준으로 필드·백신을 결정한다.
  // 활성값이 아직 비어있으면(초기 렌더) caseRow.destination 전체를 그대로 넘겨
  // 적어도 첫 매칭 오버라이드라도 적용되게 한다.
  const viewDestination = activeDestination ?? caseRow.destination

  const allowedFields = getAllowedFields(viewDestination, extraFields)
  const vaccineEntries = getEffectiveVaccineEntries(viewDestination, extraFields, destOverridesConfig)
  const destOverride = getDestinationOverride(viewDestination)
  // 커스텀 목적지가 매칭되면 baseVaccines = 커스텀의 entries — 토글 메뉴는 이미 들어간 키 제외하고 노출.
  const customDest = findCustomDestination(viewDestination, destOverridesConfig)
  const baseVaccineKeys = customDest
    ? customDest.vaccines.map(v => v.key)
    : getVaccineList(viewDestination)

  /** vaccineEntries 중 해당 키가 현재 케이스 종에 적용되는지. */
  function showVaccine(key: string): boolean {
    const e = vaccineEntries.find(v => v.key === key)
    return !!e && vaccineMatchesSpecies(e, speciesValue)
  }

  // Toggleable fields not in the base destination config (can be toggled on/off)
  const toggleableForDest = TOGGLEABLE_FIELDS.filter((t) => {
    if (t.key.startsWith('vaccine:')) {
      const v = t.key.slice('vaccine:'.length)
      return !baseVaccineKeys.includes(v) // not in destination default → toggleable
    }
    return !allowedFields.has(t.key)
  })

  const sectionSpecs = allSpecs.filter((s) => {
    if (HIDDEN_EN_KEYS.has(s.key)) return false
    if (!allowedFields.has(s.key)) return false
    return true
  })
  const groups = groupFieldSpecs(sectionSpecs)

  function toggleField(key: string) {
    const current = [...extraFields]
    const idx = current.indexOf(key)
    const next = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, key]
    const val = next.length > 0 ? next : null
    // Optimistic — UI 즉시 반영. 실패 시 rollback.
    const prev = current.length > 0 ? current : null
    updateLocalCaseField(caseRow.id, 'data', 'extra_visible_fields', val)
    void (async () => {
      const r = await updateCaseField(caseRow.id, 'data', 'extra_visible_fields', val)
      if (!r.ok) updateLocalCaseField(caseRow.id, 'data', 'extra_visible_fields', prev)
    })()
  }

  return (
    <VerificationProvider caseRow={caseRow} destination={viewDestination}>
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 flex flex-col px-lg py-md overflow-y-auto overflow-x-hidden scrollbar-minimal"
    >
      {/* ─── Sections ─── */}
      {groups.map((g, groupIdx) => {
        const isProcedure = g.group === '절차정보'
        return (
        <React.Fragment key={g.group}>
        <section
          className={cn(
            'mb-10',
            groupIdx > 0 && 'pt-10 border-t border-border/60',
          )}
        >
          <div className="mb-4 flex items-baseline gap-3">
            <span className="font-mono text-[14px] tracking-[1.2px] text-muted-foreground/80">
              {String(groupIdx + 1).padStart(2, '0')}
            </span>
            {isProcedure && toggleableForDest.length > 0 ? (
              <SectionTitleWithMenu
                title={g.group}
                items={toggleableForDest}
                activeKeys={extraFields}
                onToggle={toggleField}
              />
            ) : (
              <h3 className="font-serif text-[20px] font-medium tracking-tight text-foreground">
                {g.group}
              </h3>
            )}
          </div>
          <SectionEditModeProvider value={true}>
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
                    {showVaccine('rabies') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="광견병" dataKey="rabies_dates" />}
                    {showVaccine('rabies_titer') && <RabiesTiterField caseId={caseRow.id} caseRow={caseRow} destination={viewDestination} />}
                    {showVaccine('general') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="종합백신" dataKey="general_vaccine_dates" legacyKey="general_vaccine" lockOneYearValidity />}
                    {showVaccine('civ') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="독감" dataKey="civ_dates" lockOneYearValidity />}
                    {showVaccine('kennel') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="켄넬코프" dataKey="kennel_cough_dates" lockOneYearValidity />}
                    {showVaccine('covid') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="코로나" dataKey="covid_dates" lockOneYearValidity />}
                    {showVaccine('infectious_disease') && <InfectiousDiseaseField caseId={caseRow.id} caseRow={caseRow} destination={viewDestination} />}
                    {showVaccine('external_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="외부구충" dataKey="external_parasite_dates" hideValidUntil siblingKey="internal_parasite_dates" />}
                    {showVaccine('internal_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="내부구충" dataKey="internal_parasite_dates" hideValidUntil siblingKey="external_parasite_dates" />}
                    {showVaccine('heartworm') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="심장사상충" dataKey="heartworm_dates" hideValidUntil />}
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
          </SectionEditModeProvider>
        </section>
        {/* ─── 추가정보 — 절차정보 바로 뒤. 모든 destination 이 일반 SimpleExtraSection 사용. ─── */}
        {g.group === '절차정보' && (() => {
          // extraFields entries — 커스텀 우선, 폴백 하드코딩. 종 필터 적용.
          const extraEntries = getEffectiveExtraFieldEntries(viewDestination, destOverridesConfig)
            .filter((e) => extraFieldMatchesSpecies(e, speciesValue))
          if (extraEntries.length === 0) return null
          const sectionNumber = String(groups.length + 1).padStart(2, '0')
          return (
            <SimpleExtraSection
              caseId={caseRow.id}
              caseRow={caseRow}
              sectionNumber={sectionNumber}
              entries={extraEntries
                .map((e) => EXTRA_FIELD_DEFS[e.key])
                .filter((d): d is ExtraFieldDef => !!d)
                .map((d) => applyDestinationFieldOverride(d, viewDestination))}
              destination={viewDestination}
            />
          )
        })()}
        </React.Fragment>
        )
      })}

    </div>
    </VerificationProvider>
  )
}

/**
 * 추가정보 — extraSection 컴포넌트가 없는 케이스용 일반 wrapper.
 * 커스텀 목적지 설정의 extraFields 토글에 따라 EditableField 행이 동적으로 렌더된다.
 * `address_overseas` 만 전용 OverseasAddressField, 나머지는 일반 EditableField 로 처리.
 */
/**
 * 같은 group 메타데이터를 가진 항목들을 묶어 표시.
 * 그룹 순서는 array 안의 첫 등장 위치, 그룹 안 항목 순서는 array 순서.
 */
type ExtraSegment =
  | { type: 'group'; name: string; items: ExtraFieldDef[] }
  | { type: 'flat'; entry: ExtraFieldDef }

function groupExtraEntries(entries: ExtraFieldDef[]): ExtraSegment[] {
  const result: ExtraSegment[] = []
  const groupMap = new Map<string, { type: 'group'; name: string; items: ExtraFieldDef[] }>()
  for (const e of entries) {
    if (e.group) {
      let g = groupMap.get(e.group)
      if (!g) {
        g = { type: 'group', name: e.group, items: [] }
        result.push(g)
        groupMap.set(e.group, g)
      }
      g.items.push(e)
    } else {
      result.push({ type: 'flat', entry: e })
    }
  }
  // 그룹 안 항목이 1개뿐이면 그룹 헤더 없이 평면(전체 라벨)으로 표시.
  return result.map((seg) => (
    seg.type === 'group' && seg.items.length === 1
      ? { type: 'flat' as const, entry: seg.items[0] }
      : seg
  ))
}

/** 목적지별 ExtraFieldDef 오버라이드 — 같은 키라도 국가별로 type/options 가 달라질 때 적용. */
function applyDestinationFieldOverride(def: ExtraFieldDef, destination: string | null | undefined): ExtraFieldDef {
  if (!destination) return def
  const override = getDestinationOverride(destination)
  if (override?.extraSection === 'switzerland' && def.key === 'entry_airport') {
    return { ...def, type: 'select', options: SWISS_ENTRY_AIRPORT_OPTIONS, placeholder: undefined }
  }
  if (override?.extraSection === 'thailand' && def.key === 'entry_airport') {
    return { ...def, type: 'select', options: THAILAND_ENTRY_AIRPORT_OPTIONS, placeholder: undefined }
  }
  return def
}

function buildSpecForExtra(def: ExtraFieldDef, useShortLabel: boolean): FieldSpec {
  const isSelect = def.type === 'select' && def.options
  const specType: FieldSpec['type'] =
    isSelect ? 'select'
    : def.type === 'time' || def.type === 'email' ? 'text'
    : def.type
  return {
    key: def.key,
    storage: 'data',
    label: useShortLabel && def.shortLabel ? def.shortLabel : def.label,
    type: specType,
    group: '추가정보',
    groupOrder: 4,
    order: 0,
    ...(isSelect ? { options: def.options!.map((o) => ({ value: o.value, label_ko: o.label })) } : {}),
  }
}

/** destination → extractExtra Country 코드. extraSection 이 없으면 null. */
function destinationToCountry(destination: string | null | undefined): Country | null {
  const override = getDestinationOverride(destination)
  const sec = override?.extraSection
  if (!sec) return null
  if (sec === 'new_zealand') return 'new-zealand'
  return sec as Country
}

/** AI 추출 결과(레거시 country-specific schema)를 통합 키로 매핑. */
function mapExtractResultToUnified(country: Country, result: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  const set = (k: string, v: unknown) => {
    if (typeof v === 'string' && v) out[k] = v
  }
  if (country === 'japan') {
    const inb = (result.inbound ?? {}) as Record<string, unknown>
    const outb = (result.outbound ?? {}) as Record<string, unknown>
    set('entry_date', inb.date)
    set('entry_departure_airport', inb.departure_airport)
    set('entry_airport', inb.arrival_airport)
    set('entry_transport', inb.transport)
    set('entry_flight_number', inb.flight_number)
    set('return_date', outb.date)
    set('return_departure_airport', outb.departure_airport)
    set('return_arrival_airport', outb.arrival_airport)
    set('return_transport', outb.transport)
    set('return_flight_number', outb.flight_number)
    set('email', result.email)
    set('address_overseas', result.address_overseas)
    set('certificate_no', result.certificate_no)
  } else if (country === 'usa') {
    set('passport_number', result.passport_number)
    set('holder_birth_date', result.birth_date)
    set('overseas_phone', result.us_phone)
    set('entry_date', result.arrival_date)
  } else if (country === 'thailand') {
    set('address_overseas', result.address_overseas)
    set('passport_number', result.passport_number)
    set('passport_expiry_date', result.passport_expiry_date)
    set('passport_issuer', result.passport_issuer)
    set('entry_flight_number', result.arrival_flight_number)
    set('entry_date', result.arrival_date)
    set('entry_time', result.arrival_time)
    // 태국은 검역소·도착지 = 입국공항. AI 가 추출한 quarantine_location(Bangkok/Phuket/Chiang Mai) 도 entry_airport 로 매핑.
    set('entry_airport', result.quarantine_location)
  } else if (country === 'philippines') {
    set('email', result.email)
    set('address_overseas', result.address_overseas)
    set('postal_code', result.postal_code)
    set('passport_number', result.passport_number)
    set('passport_expiry_date', result.passport_expiry_date)
    set('entry_airport', result.arrival_airport)
  } else if (country === 'hawaii') {
    set('passport_number', result.passport_number)
    set('passport_issuing_country', result.passport_issuing_country)
    set('passport_expiry_date', result.passport_expiry_date)
    set('holder_birth_date', result.date_of_birth)
    set('email', result.email_address)
    set('address_overseas', result.address_overseas)
    set('postal_code', result.postal_code)
    set('overseas_phone', result.phone)
    set('entry_date', result.entry_date)
  } else if (country === 'switzerland') {
    set('entry_date', result.entry_date)
    set('entry_airport', result.entry_airport)
    set('email', result.email)
    set('entry_purpose', result.entry_purpose)
    set('cropped', result.cropped)
  } else if (country === 'australia') {
    set('permit_no', result.permit_no)
    set('id_date', result.id_date)
    set('sample_received_date', result.sample_received_date)
  } else if (country === 'new-zealand') {
    set('permit_no', result.permit_no)
  } else if (country === 'uk') {
    set('address_overseas', result.address_overseas)
  }
  return out
}

function SimpleExtraSection({ caseId, caseRow, sectionNumber, entries, destination }: {
  caseId: string
  caseRow: CaseRow
  sectionNumber: string
  entries: ExtraFieldDef[]
  destination: string | null | undefined
}) {
  const { updateLocalCaseField } = useCases()
  const confirm = useConfirm()
  const segments = groupExtraEntries(entries)
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // 타이틀 클릭 시 토글 — 노출되면 "전체 삭제" 버튼 등장.
  const [showActions, setShowActions] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const country = destinationToCountry(destination)

  // 이 섹션이 차지하는 모든 데이터 키 — 그룹 항목까지 평탄화.
  const allKeys = (() => {
    const keys: string[] = []
    for (const seg of segments) {
      if (seg.type === 'flat') keys.push(seg.entry.key)
      else for (const item of seg.items) keys.push(item.key)
    }
    return keys
  })()
  const hasAnyValue = allKeys.some((k) => {
    const v = data[k]
    return v !== null && v !== undefined && v !== ''
  })

  async function clearAllFields() {
    if (!await confirm({
      message: '추가정보의 모든 필드를 비웁니다.',
      description: '되돌리려면 Ctrl+Z',
      okLabel: '전체 삭제',
      variant: 'destructive',
    })) return
    for (const k of allKeys) {
      updateLocalCaseField(caseId, 'data', k, null)
    }
    void (async () => {
      for (const k of allKeys) await updateCaseField(caseId, 'data', k, null)
    })()
  }

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    if (!country) { setExtractMsg('이 목적지는 자동 추출 미지원'); setTimeout(() => setExtractMsg(null), 3000); return }
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractExtra({ country, ...input })
      if (!result.ok) { setExtractMsg('추출 실패: ' + result.error); return }
      console.log('[extract]', country, 'raw:', result.data)
      const unified = mapExtractResultToUnified(country, result.data as unknown as Record<string, unknown>)
      console.log('[extract] unified:', unified)
      const keys = Object.keys(unified)
      if (keys.length === 0) { setExtractMsg('관련 정보를 찾지 못했습니다'); return }
      // Optimistic — 모든 키 일괄 로컬 반영 후 백그라운드 저장.
      for (const k of keys) updateLocalCaseField(caseId, 'data', k, unified[k])
      // entry_date 가 추출되면 케이스의 출국일(departure_date) 컬럼도 동기화.
      if (unified.entry_date) {
        updateLocalCaseField(caseId, 'column', 'departure_date', unified.entry_date)
        void updateCaseField(caseId, 'column', 'departure_date', unified.entry_date)
      }
      void (async () => {
        for (const k of keys) await updateCaseField(caseId, 'data', k, unified[k])
      })()
      const labels = keys.map(k => EXTRA_FIELD_KEY_LABELS[k] ?? k)
      const shown = labels.slice(0, 4).join(', ')
      setExtractMsg(`입력됨: ${shown}${labels.length > 4 ? ` 외 ${labels.length - 4}` : ''}`)
    } catch (err) {
      setExtractMsg('오류: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setExtracting(false)
      setTimeout(() => setExtractMsg(null), 4000)
    }
  }

  async function handleFiles(files: File[]) {
    const extractable = files.filter(isExtractableFile)
    if (extractable.length === 0) return
    for (const file of extractable) {
      uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField).catch(() => {})
    }
    const images = await filesToBase64(extractable)
    if (images.length > 0) tryExtract({ images })
  }

  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(isExtractableFile)
    if (files.length > 0) handleFiles(files)
  }

  // Ctrl+V 붙여넣기.
  // - 이미지: 섹션 hover 중일 때만 (다른 섹션과 충돌 방지)
  // - 텍스트: 케이스 페이지 어디서든 fallback (input/textarea 포커스 아닐 때)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!sectionRef.current) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const items = e.clipboardData?.items
      if (!items) return
      const isHovered = sectionRef.current.matches(':hover')
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        if (!isHovered) return
        e.preventDefault()
        handleFiles(imageFiles)
        return
      }
      // 텍스트: 다른 섹션이 hover 중이면 그쪽이 처리하도록 양보.
      const otherHovered = document.querySelector('[data-paste-section]:hover')
      if (otherHovered && otherHovered !== sectionRef.current) return
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && text.length > 10) {
        e.preventDefault()
        tryExtract({ text })
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, country])

  return (
    <section
      ref={sectionRef}
      data-paste-section="extra"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'mb-10 pt-10 border-t border-border/60 rounded-md transition-colors',
        dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        onChange={(e) => {
          if (e.target.files) handleFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
        className="hidden"
      />
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[14px] tracking-[1.2px] text-muted-foreground/80">
          {sectionNumber}
        </span>
        <button
          type="button"
          onClick={() => setShowActions((v) => !v)}
          title="섹션 액션 토글"
          className="font-serif text-[20px] font-medium tracking-tight text-foreground hover:text-muted-foreground cursor-pointer transition-colors"
        >
          추가정보
        </button>
        {/* 둘 중 하나만 — 값 있으면 삭제, 없으면 추출. 타이틀 클릭으로 토글. */}
        {showActions && (hasAnyValue ? (
          <button
            type="button"
            onClick={clearAllFields}
            title="이 섹션의 모든 필드 비우기"
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-serif text-[12px] text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            전체 삭제
          </button>
        ) : country ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={extracting}
            title="이미지·PDF 첨부하여 자동 추출"
            className="shrink-0 translate-y-[2px] text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        ) : null)}
        {extracting && (
          <span className="font-sans text-[12px] italic text-muted-foreground">추출 중...</span>
        )}
        {extractMsg && (
          <span className={cn(
            'font-sans text-[12px]',
            extractMsg.includes('실패') || extractMsg.includes('오류') || extractMsg.includes('미지원') || extractMsg.includes('찾지') ? 'text-red-600' : 'text-green-600',
          )}>{extractMsg}</span>
        )}
      </div>
      {dragOver && (
        <div className="mb-2 text-xs text-muted-foreground">놓으면 자동 입력</div>
      )}
      <SectionEditModeProvider value={true}>
        <div>
          {segments.map((seg) => {
            if (seg.type === 'group') {
              return (
                <ExtraGroupRow
                  key={`group:${seg.name}`}
                  caseId={caseId}
                  caseRow={caseRow}
                  groupName={seg.name}
                  items={seg.items}
                />
              )
            }
            const def = seg.entry
            if (def.key === 'address_overseas') {
              return <OverseasAddressField key={def.key} caseId={caseId} caseRow={caseRow} />
            }
            const spec = buildSpecForExtra(def, false)
            const rawValue = readEffectiveExtraValue(data, def.key)
            return (
              <EditableField
                key={def.key}
                caseId={caseId}
                spec={spec}
                rawValue={rawValue}
                clearable
              />
            )
          })}
        </div>
      </SectionEditModeProvider>
    </section>
  )
}

/** group 메타데이터로 묶인 추가정보 항목들 — 좌측 그룹명 + 우측 sub-row 스택. */
function ExtraGroupRow({ caseId, caseRow, groupName, items }: {
  caseId: string
  caseRow: CaseRow
  groupName: string
  items: ExtraFieldDef[]
}) {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 transition-colors hover:bg-accent/60">
      <SectionLabel className="pt-1">{groupName}</SectionLabel>
      <div className="min-w-0">
        {items.map((def) => {
          const spec = buildSpecForExtra(def, true)
          const rawValue = readEffectiveExtraValue(data, def.key)
          return (
            <EditableField
              key={def.key}
              caseId={caseId}
              spec={spec}
              rawValue={rawValue}
              compact
              clearable
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Microchip: main + optional secondary (max 2). 라벨 클릭마다 새 입력 칸 추가.
 * - 빈 상태 → 라벨 클릭 → 주칩 입력
 * - 주칩 저장 후 라벨 클릭 → 우측에 보조칩 입력
 * - 둘 다 저장 → 라벨 비활성
 */
function MicrochipField({ caseId, caseRow, spec }: { caseId: string; caseRow: CaseRow; spec: FieldSpec }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const mainRaw = String(caseRow.microchip ?? '').trim()
  const secRaw = String((data.microchip_secondary as string | undefined) ?? '').trim()

  const [editingMain, setEditingMain] = useState(false)
  const [editingSec, setEditingSec] = useState(false)
  const [mainVal, setMainVal] = useState(mainRaw)
  const [secVal, setSecVal] = useState(secRaw)
  const [error, setError] = useState<string | null>(null)
  const [flashed, setFlashed] = useState<'main' | 'sec' | null>(null)
  const mainRef = useRef<HTMLInputElement>(null)
  const secRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditingMain(false)
    setEditingSec(false)
    setError(null)
  }, [caseId])

  useEffect(() => { if (!editingMain) setMainVal(mainRaw) }, [mainRaw, editingMain])
  useEffect(() => { if (!editingSec) setSecVal(secRaw) }, [secRaw, editingSec])
  useEffect(() => { if (editingMain) mainRef.current?.focus() }, [editingMain])
  useEffect(() => { if (editingSec) secRef.current?.focus() }, [editingSec])

  function formatChip(v: string) {
    const digits = v.replace(/\D/g, '')
    if (digits.length === 15) return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
    return v
  }
  // 입력 시 3자리마다 공백 — "123 456 789 012 345" 형식.
  function filterDigits(raw: string) {
    const hadNonDigit = /[^\d\s]/.test(raw)
    const digits = raw.replace(/\D/g, '').slice(0, 15)
    if (hadNonDigit) {
      setError('숫자만 입력 가능합니다')
      setTimeout(() => setError(null), 2000)
    }
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ')
  }

  function saveChip(which: 'main' | 'sec') {
    const isMain = which === 'main'
    const stateVal = isMain ? mainVal : secVal
    const digits = stateVal.replace(/\D/g, '')
    const storage = isMain ? 'column' : 'data'
    const key = isMain ? 'microchip' : 'microchip_secondary'
    const setEditing = isMain ? setEditingMain : setEditingSec
    const prevRaw = isMain ? mainRaw : secRaw
    if (!digits) {
      // Optimistic clear.
      updateLocalCaseField(caseId, storage, key, null)
      setEditing(false)
      void (async () => {
        const r = await updateCaseField(caseId, storage, key, null)
        if (!r.ok) updateLocalCaseField(caseId, storage, key, prevRaw || null)
      })()
      return
    }
    if (digits.length !== 15) { setError('유효한 번호가 아닙니다'); return }
    const otherDigits = (isMain ? secRaw : mainRaw).replace(/\D/g, '')
    if (otherDigits && digits === otherDigits) {
      setError(isMain ? '보조칩과 같은 번호입니다' : '주칩과 같은 번호입니다')
      return
    }
    const formatted = `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,9)} ${digits.slice(9,12)} ${digits.slice(12)}`
    // Optimistic save.
    updateLocalCaseField(caseId, storage, key, formatted)
    setError(null)
    setEditing(false)
    setFlashed(which)
    setTimeout(() => setFlashed(null), 1500)
    void (async () => {
      const r = await updateCaseField(caseId, storage, key, formatted)
      if (!r.ok) {
        updateLocalCaseField(caseId, storage, key, prevRaw || null)
        setError(r.error)
      }
    })()
  }

  // 라벨 클릭 동작: 주칩 비어있으면 주칩 / 주칩 있고 보조칩 비어있으면 보조칩 / 둘 다 있으면 비활성.
  const canAdd = !mainRaw || !secRaw
  function addNew() {
    if (!mainRaw) { setMainVal(''); setEditingMain(true); setError(null) }
    else if (!secRaw) { setSecVal(''); setEditingSec(true); setError(null) }
  }

  const inputCls = 'w-52 h-8 rounded-md border border-border/80 bg-background px-2 text-sm font-mono tracking-[0.3px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'
  const showMain = editingMain || !!mainRaw
  const showSec = editingSec || !!secRaw

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode && canAdd ? addNew : undefined}
          title={editMode ? (canAdd ? '마이크로칩 추가 (최대 2개)' : '최대 2개까지 추가 가능') : undefined}
        >
          {spec.label}
        </SectionLabel>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[20px] flex-wrap">
          {/* Main chip */}
          {showMain && (
            <div className="group/main inline-flex items-baseline gap-[6px]">
              {editingMain ? (
                <input
                  ref={mainRef}
                  type="text"
                  inputMode="numeric"
                  value={mainVal}
                  onChange={(e) => setMainVal(filterDigits(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveChip('main')
                    if (e.key === 'Escape') { setEditingMain(false); setError(null) }
                  }}
                  onBlur={() => setTimeout(() => saveChip('main'), 150)}
                  placeholder="마이크로칩 번호"
                  className={inputCls}
                />
              ) : editMode ? (
                <button type="button" onClick={() => { setMainVal(mainRaw); setEditingMain(true); setError(null) }}
                  className="text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text">
                  {formatChip(mainRaw)}
                </button>
              ) : (
                <span className="rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground">
                  {formatChip(mainRaw)}
                </span>
              )}
              {!editingMain && mainRaw && (
                <CopyButton value={formatChip(mainRaw)} className="shrink-0 opacity-0 group-hover/main:opacity-100" />
              )}
              {flashed === 'main' && !editingMain && (
                <span className="text-emerald-600 text-sm select-none" aria-label="저장됨">✓</span>
              )}
            </div>
          )}

          {/* Secondary chip — pipe separated */}
          {showSec && (
            <div className="group/sec inline-flex items-baseline gap-[6px]">
              {showMain && <span className="text-muted-foreground/30 select-none">|</span>}
              {editingSec ? (
                <input
                  ref={secRef}
                  type="text"
                  inputMode="numeric"
                  value={secVal}
                  onChange={(e) => setSecVal(filterDigits(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveChip('sec')
                    if (e.key === 'Escape') { setEditingSec(false); setError(null) }
                  }}
                  onBlur={() => setTimeout(() => saveChip('sec'), 150)}
                  placeholder="보조칩 번호"
                  className={inputCls}
                />
              ) : editMode ? (
                <button type="button" onClick={() => { setSecVal(secRaw); setEditingSec(true); setError(null) }}
                  className="text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-text">
                  {formatChip(secRaw)}
                </button>
              ) : (
                <span className="rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground">
                  {formatChip(secRaw)}
                </span>
              )}
              {!editingSec && secRaw && (
                <CopyButton value={formatChip(secRaw)} className="shrink-0 opacity-0 group-hover/sec:opacity-100" />
              )}
              {flashed === 'sec' && !editingSec && (
                <span className="text-emerald-600 text-sm select-none" aria-label="저장됨">✓</span>
              )}
              {editMode && secRaw && !editingSec && (
                <button
                  type="button"
                  onClick={() => {
                    const prev = secRaw
                    updateLocalCaseField(caseId, 'data', 'microchip_secondary', null)
                    setError(null)
                    void (async () => {
                      const r = await updateCaseField(caseId, 'data', 'microchip_secondary', null)
                      if (!r.ok) updateLocalCaseField(caseId, 'data', 'microchip_secondary', prev || null)
                    })()
                  }}
                  title="보조칩 삭제"
                  className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover/sec:opacity-70 hover:!opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </div>
    </div>
  )
}

/**
 * Microchip implant date row.
 */
function MicrochipDatesRow({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const editMode = useSectionEditMode()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const implantDate = (data.microchip_implant_date as string) || ''
  const implantInfo = useFieldVerification('microchip_implant_date')
  const implantColorCls = implantInfo ? severityTextClass(implantInfo.severity) : ''
  const implantTitle = implantInfo ? tooltipText(implantInfo) : undefined

  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setEditing(false)
  }, [caseId])

  function saveDate(value: string | null) {
    const prev = implantDate
    // Optimistic.
    updateLocalCaseField(caseId, 'data', 'microchip_implant_date', value)
    setEditing(false)
    void (async () => {
      const r = await updateCaseField(caseId, 'data', 'microchip_implant_date', value)
      if (!r.ok) updateLocalCaseField(caseId, 'data', 'microchip_implant_date', prev || null)
    })()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors hover:bg-accent/60">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode && !editing ? () => setEditing(true) : undefined}
          title={editMode ? (implantDate ? '삽입일 수정' : '삽입일 추가') : undefined}
        >
          마이크로칩
        </SectionLabel>
      </div>
      <div className="group/item flex items-baseline gap-[10px] min-w-0 flex-wrap">
        {editing ? (
          <MicrochipDateInput initial={implantDate} onSave={(v) => saveDate(v || null)} onCancel={() => setEditing(false)} />
        ) : (
          <span className="group/v relative inline-flex items-baseline">
            {editMode ? (
              <button type="button" onClick={() => setEditing(true)} title={implantTitle}
                className={cn(
                  'text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
                  !implantDate && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                  implantColorCls,
                )}>
                {implantDate || <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>}
              </button>
            ) : (
              <span title={implantTitle}
                className={cn(
                  'rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground',
                  !implantDate && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60',
                  implantColorCls,
                )}>
                {implantDate || <span className="inline-block min-w-[2.5rem] select-none" aria-hidden>&nbsp;</span>}
              </span>
            )}
          </span>
        )}

        {editMode && implantDate && !editing && (
          <button
            type="button"
            onClick={() => saveDate(null)}
            title="삭제"
            className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
          >
            <Trash2 size={13} />
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
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
    />
  )
}

/**
 * Section title h3 that opens a popover for managing toggleable fields.
 */
function SectionTitleWithMenu({ title, items, activeKeys, onToggle }: {
  title: string
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
        className="font-serif text-[20px] font-medium tracking-tight text-foreground hover:text-muted-foreground transition-colors cursor-pointer"
        title="항목 추가"
      >
        {title}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
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
