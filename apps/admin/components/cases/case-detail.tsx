'use client'

import type { CaseRow } from '@petmove/domain'
import type { FieldSpec } from '@petmove/domain'
import {
  buildFieldSpecs,
  groupFieldSpecs,
  HIDDEN_EN_KEYS,
  readCaseField,
} from '@petmove/domain'
import { getAllowedFields, getVaccineList, getEffectiveVaccineEntries, getEffectiveExtraFieldEntries, getDestinationOverride, matchesDestinationKey, TOGGLEABLE_FIELDS, vaccineMatchesSpecies, findCustomDestination, EXTRA_FIELD_KEY_LABELS, readEffectiveExtraValue, resolveActiveDestination, getTripType, isRabiesTiterHiddenForOneWay, isDestinationScopedKey, applyDestinationFieldOverride, type ExtraFieldDef } from '@petmove/domain'
import { buildShareFieldDescriptors } from '@petmove/domain'
import { useDestinationOverrides } from '@/components/providers/destination-overrides-provider'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, ChevronDown, Check } from 'lucide-react'
import { useConfirm } from '@petmove/ui'
import { AttachButton } from '@/components/ui/attach-button'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { uploadStepDocumentAdmin } from '@/lib/actions/step-documents'
import { CopyButton } from './copy-button'
import { DateTextField } from '@petmove/ui'
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
import { PastJourneysAdminSection } from './past-journeys-admin'
import { useCases } from './cases-context'
import { VerificationProvider, severityTextClass, tooltipText, useFieldVerification } from './verification-context'
import { SectionEditModeProvider, useSectionEditMode } from './section-edit-mode-context'
import { extractExtra, type Country } from '@/lib/actions/extract-extra'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'

// EXTRA_SECTION_COMPONENTS 라우팅은 통합 리팩터로 제거됨 — 모든 destination 이 SimpleExtraSection 사용.

// 모바일 collapse 펼침 상태 — 모든 케이스 공유 (사용자 선호도 유지). 케이스별이 아닌 섹션 그룹별 키.
const COLLAPSED_KEY = 'petmove:case-detail:collapsed-sections'

/**
 * Right-pane detail. No top title — destination gets a standalone prominent
 * display at the top, then the three groups (고객정보 / 동물정보 / 절차정보),
 * then a footer with timestamps.
 */
export function CaseDetail({ caseRow, scrollRef }: { caseRow: CaseRow; scrollRef?: React.Ref<HTMLDivElement> }) {
  const { fieldDefs, updateLocalCaseField, activeDestination } = useCases()
  const { config: destOverridesConfig } = useDestinationOverrides()
  // fieldDefs 는 컨텍스트에서 stable — 매 렌더마다 buildFieldSpecs 호출 회피.
  // 입력마다 case-detail 가 재렌더되는데 fieldDefs 자체는 안 바뀌므로 큰 절약.
  const allSpecs = useMemo(() => buildFieldSpecs(fieldDefs), [fieldDefs])
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[]) ?? []
  const speciesValue = (data.species as string) ?? ''

  // 모바일 — 섹션 collapse. 데스크톱은 항상 펼침(`md:block` 으로 hidden 무시).
  // localStorage 에 펼침 상태 영속 — 사용자가 매번 같은 섹션 다시 접지 않아도 됨.
  // 저장은 토글 시점에 동기적으로 (useEffect 로 하면 마운트 시 빈 Set 으로 덮어쓰는 race 발생).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    // 마운트 시 1회 로드만. 저장은 toggleCollapsed 안에서.
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY)
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) setCollapsed(new Set(arr))
    } catch {}
  }, [])
  const toggleCollapsed = (group: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  // 다중 목적지 케이스는 활성 목적지 하나만 기준으로 필드·백신을 결정한다.
  // 활성값이 아직 비어있으면(초기 렌더) caseRow.destination 전체를 그대로 넘겨
  // 적어도 첫 매칭 오버라이드라도 적용되게 한다.
  const viewDestination = activeDestination ?? caseRow.destination

  // 활성 목적지 단일 토큰 — trip_type map 키 + 광견병항체 필터 게이트 기준.
  const activeDestToken = resolveActiveDestination(caseRow.destination, activeDestination)
  const tripType = getTripType(caseRow.data, activeDestToken)
  const hideRabiesTiterOneWay = tripType === 'one_way' && isRabiesTiterHiddenForOneWay(activeDestToken)

  const allowedFields = getAllowedFields(viewDestination, extraFields)
  const vaccineEntries = getEffectiveVaccineEntries(viewDestination, extraFields, destOverridesConfig)
  // 커스텀 목적지가 매칭되면 baseVaccines = 커스텀의 entries — 토글 메뉴는 이미 들어간 키 제외하고 노출.
  const customDest = findCustomDestination(viewDestination, destOverridesConfig)
  const baseVaccineKeys = customDest
    ? customDest.vaccines.map(v => v.key)
    : getVaccineList(viewDestination)

  /** vaccineEntries 중 해당 키가 현재 케이스 종에 적용되는지. */
  function showVaccine(key: string): boolean {
    // 편도 + 입국국이 RNATT 비요구이면 광견병항체검사 숨김 (한국 귀국 시는 필요하므로 왕복은 그대로).
    if (key === 'rabies_titer' && hideRabiesTiterOneWay) return false
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
    if (s.key === 'age') return false // birth_date 옆에 인라인 표시
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
      className="flex-1 min-h-0 flex flex-col px-md md:px-lg py-md overflow-y-auto overflow-x-hidden scrollbar-minimal"
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
            {/* 모바일 — 섹션 collapse 토글. 데스크톱에선 숨김(항상 펼침). */}
            <button
              type="button"
              onClick={() => toggleCollapsed(g.group)}
              aria-expanded={!collapsed.has(g.group)}
              aria-label={collapsed.has(g.group) ? `${g.group} 펼치기` : `${g.group} 접기`}
              className="md:hidden ml-auto self-center -mr-1 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ChevronDown
                size={18}
                className={cn('transition-transform', collapsed.has(g.group) && '-rotate-90')}
              />
            </button>
          </div>
          <SectionEditModeProvider value={true}>
          <div className={cn(collapsed.has(g.group) && 'hidden md:block')}>
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
                      rawValue={readCaseField(caseRow, spec, activeDestToken)}
                    />
                    {addrKrSpec && (
                      <AddressField
                        caseId={caseRow.id}
                        krSpec={addrKrSpec}
                        enSpec={addrEnSpec}
                        krRaw={readCaseField(caseRow, addrKrSpec, activeDestToken)}
                        enRaw={addrEnSpec ? readCaseField(caseRow, addrEnSpec, activeDestToken) : null}
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
                    {showVaccine('external_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="외부구충" dataKey="external_parasite_dates" hideValidUntil />}
                    {showVaccine('internal_parasite') && <RepeatableDateField caseId={caseRow.id} caseRow={caseRow} label="내부구충" dataKey="internal_parasite_dates" hideValidUntil />}
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
                      rawValue={readCaseField(caseRow, spec, activeDestToken)}
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
                    koRaw={readCaseField(caseRow, spec, activeDestToken)}
                    enRaw={
                      enSpec ? readCaseField(caseRow, enSpec, activeDestToken) : null
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
                  rawValue={readCaseField(caseRow, spec, activeDestToken)}
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
        {/* ─── 추가정보 — 절차정보 바로 뒤. 좌표는 buildShareFieldDescriptors 가 산출 (다이얼로그·프리셋·수신자 폼과 동일 권위). ─── */}
        {g.group === '절차정보' && (() => {
          // 추가정보 카테고리만 추출 — 절차/고객/동물 카테고리는 case-detail 가 자체 렌더 (buildAllFieldSpecs + EditableField 라우팅).
          // descriptor.subgroup 이 그대로 SimpleExtraSection 의 group/flat 분기 입력. species·email 필터는 빌더가 처리.
          // 편도 시 'return_*'(귀국편 항공권)·'jp_export_quarantine_*'(수출검역 예약) 제외 — 왕복 전용.
          const rawExtraEntries = getEffectiveExtraFieldEntries(viewDestination, destOverridesConfig)
          const extraEntriesFiltered = tripType === 'one_way'
            ? rawExtraEntries.filter(e => !e.key.startsWith('return_') && !e.key.startsWith('jp_export_quarantine_'))
            : rawExtraEntries
          const extraDescriptors = buildShareFieldDescriptors({
            fieldDefs,
            destinationScope: viewDestination,
            extraFieldEntries: extraEntriesFiltered,
            caseScoped: { allowedFields, vaccineApplies: () => false, speciesValue },
          }).filter((d) => d.category === '추가정보')
          if (extraDescriptors.length === 0) return null
          const sectionNumber = String(groups.length + 1).padStart(2, '0')
          // descriptor.subgroup 으로 인접 그룹화 — 빌더가 이미 ≥2 일 때만 subgroup 을 박았으므로 1개짜리는 자동 평면.
          const segments: ExtraSegment[] = []
          for (const d of extraDescriptors) {
            if (d.source.kind !== 'extra') continue
            const def = applyDestinationFieldOverride(d.source.def, viewDestination, getDestinationOverride)
            // useShortLabel 은 빌더가 destination 별로 결정한 값을 그대로 신뢰
            // (일본만 'shortLabel' — 날짜/시간/항공편명, 그 외는 풀라벨 — 도착일/도착시간).
            const groupUseShortLabel = d.source.useShortLabel
            if (d.subgroup) {
              const last = segments[segments.length - 1]
              if (last && last.type === 'group' && last.name === d.subgroup) {
                last.items.push(def)
              } else {
                segments.push({ type: 'group', name: d.subgroup, items: [def], useShortLabel: groupUseShortLabel })
              }
            } else {
              segments.push({ type: 'flat', entry: def })
            }
          }
          // 사전신고 허가서 첨부 — 활성 목적지가 일본일 때만 추가정보 마지막 row 로 표시.
          // 케이스가 다중 목적지(예: '일본, 필리핀')이고 활성이 일본 외이면 안 노출.
          // portal 보호자·admin 운영자 모두 업로드 가능, case.data.documents 배열 공유
          // (stepId='advance-notification'). 첨부 = 완료 시그널이라 업로드 시점에
          // admin_demoted_at 자동 해제됨 (step-documents 액션 내부).
          const showNaccsRow = matchesDestinationKey(viewDestination, 'japan')
          // 태국·필리핀 왕복 — 귀국 항공편 날짜 + '미정' 행. 편도 항공권만 끊은 경우 운영자가
          // '미정' 체크로 출국편만으로 항공권 step 완료 처리(펫무브앱 미정 토글의 admin 짝).
          const showReturnFlightRow =
            tripType === 'round' &&
            (matchesDestinationKey(viewDestination, 'thailand') ||
              matchesDestinationKey(viewDestination, 'philippines'))
          return (
            <SimpleExtraSection
              caseId={caseRow.id}
              caseRow={caseRow}
              sectionNumber={sectionNumber}
              segments={segments}
              destination={viewDestination}
              isCollapsed={collapsed.has('추가정보')}
              onToggleCollapsed={() => toggleCollapsed('추가정보')}
              trailing={
                showNaccsRow
                  ? (({ onTakeoverDrag }) => (
                      <AdvanceNotificationAttachmentsRow caseId={caseRow.id} caseRow={caseRow} onTakeoverDrag={onTakeoverDrag} />
                    ))
                  : showReturnFlightRow
                    ? (() => (
                        <ReturnFlightRow caseId={caseRow.id} caseRow={caseRow} activeDest={activeDestToken} />
                      ))
                    : undefined
              }
            />
          )
        })()}
        </React.Fragment>
        )
      })}
      <PastJourneysAdminSection caseRow={caseRow} />
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
 * 추가정보 영역 segment — group 헤더 + sub-rows vs flat 단일 row.
 * 좌표/그룹화 결정은 buildShareFieldDescriptors 가 책임 (subgroup 이 이미 ≥2 일 때만 박힘).
 * case-detail 은 descriptor.subgroup 인접 묶음으로 ExtraSegment 를 구성한다.
 */
type ExtraSegment =
  | { type: 'group'; name: string; items: ExtraFieldDef[]; useShortLabel: boolean }
  | { type: 'flat'; entry: ExtraFieldDef }

function buildSpecForExtra(def: ExtraFieldDef, useShortLabel: boolean): FieldSpec {
  const isSelect = def.type === 'select' && def.options
  const specType: FieldSpec['type'] =
    isSelect ? 'select'
    : def.type === 'email' ? 'text'
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
    // 일본 한일 노선: 출국일=도착일(같은 날) → inbound.date 는 departure_flight_date 로.
    // entry_date 는 일본에서 미사용. inbound.time(출발시간)은 일본에서 불필요 → 미사용.
    set('departure_flight_date', inb.date)
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
    set('departure_flight_date', result.departure_date)
    set('entry_date', result.entry_date)
    set('entry_flight_number', result.flight_number)
    set('entry_time', result.arrival_time)
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

function SimpleExtraSection({ caseId, caseRow, sectionNumber, segments, destination, isCollapsed, onToggleCollapsed, trailing }: {
  caseId: string
  caseRow: CaseRow
  sectionNumber: string
  segments: ExtraSegment[]
  destination: string | null | undefined
  isCollapsed: boolean
  onToggleCollapsed: () => void
  /**
   * 추가정보 마지막에 끼워 넣을 임의 노드 (예: 일본 사전신고 허가서 첨부 행). 별도 섹션 X.
   * 함수 형태: 자식이 자체 drag/drop 을 가로챘을 때 부모 ring 을 끄도록 onTakeoverDrag 콜백 전달.
   */
  trailing?: (helpers: { onTakeoverDrag: () => void }) => React.ReactNode
}) {
  const { updateLocalCaseField, activeDestination } = useCases()
  const confirm = useConfirm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  // scoped 키 입력은 by_dest 경로로 라우팅 (B: 단일도 by_dest 통일).
  // 단일 목적지면 resolveActiveDestination 이 유일 토큰을 돌려줘 그 칸으로 저장된다.
  const activeDest = resolveActiveDestination(caseRow.destination, activeDestination)
  const destArgFor = (key: string): string | null | undefined =>
    activeDest && isDestinationScopedKey(key) ? activeDest : undefined
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // 값 있을 때만 의미있음 — 타이틀 클릭으로 삭제 버튼 노출 토글.
  const [showDelete, setShowDelete] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const attachTriggerRef = useRef<(() => void) | null>(null)

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
      updateLocalCaseField(caseId, 'data', k, null, destArgFor(k))
    }
    void (async () => {
      for (const k of allKeys) await updateCaseField(caseId, 'data', k, null, destArgFor(k))
    })()
  }

  async function tryExtract(input: { images?: { base64: string; mediaType: string }[]; text?: string }) {
    if (!country) { setExtractMsg('이 목적지는 자동 추출 미지원'); setTimeout(() => setExtractMsg(null), 3000); return }
    setExtracting(true)
    setExtractMsg(null)
    try {
      const result = await extractExtra({ country, ...input })
      if (!result.ok) { setExtractMsg('추출 실패: ' + result.error); return }
      const unified = mapExtractResultToUnified(country, result.data as unknown as Record<string, unknown>)
      const keys = Object.keys(unified)
      if (keys.length === 0) { setExtractMsg('관련 정보를 찾지 못했습니다'); return }
      // Optimistic — 모든 키 일괄 로컬 반영 후 백그라운드 저장.
      for (const k of keys) updateLocalCaseField(caseId, 'data', k, unified[k], destArgFor(k))
      // entry_date 가 추출되면 케이스의 출국일(departure_date) 컬럼도 동기화.
      if (unified.entry_date) {
        updateLocalCaseField(caseId, 'column', 'departure_date', unified.entry_date, destArgFor('departure_date'))
        void updateCaseField(caseId, 'column', 'departure_date', unified.entry_date, destArgFor('departure_date'))
      }
      void (async () => {
        for (const k of keys) await updateCaseField(caseId, 'data', k, unified[k], destArgFor(k))
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
    // SimpleExtraSection 은 dedicated 컴포넌트 없는 목적지의 폴백 — country 가 결정되면
    // '${country} 추가정보' 라벨, 아니면 generic '추가정보' 로 명명.
    const label = country ? `${country} 추가정보` : '추가정보'
    for (const file of extractable) {
      uploadFileToNotes(caseId, caseRow, file, updateLocalCaseField, { label }).catch(() => {})
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
    // 자식 row(예: 허가서) 가 자체 onDrop 으로 stopPropagation 하면 여기 안 옴.
    // 도달했다면 row 외 추가정보 영역에 드롭된 거 → AI 추출 흐름 진행.
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(isExtractableFile)
    if (files.length > 0) handleFiles(files)
  }

  // Ctrl+V 붙여넣기.
  // - 이미지: 섹션 hover 중일 때만 (다른 섹션과 충돌 방지)
  // - 텍스트: 케이스 페이지 어디서든 fallback (input/textarea 포커스 아닐 때)
  // - 자식 row(허가서 등) hover 시 양보 — 그쪽이 자체 paste 핸들러로 처리.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!sectionRef.current) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const items = e.clipboardData?.items
      if (!items) return
      // 허가서 row hover 시 양보 — defaultPrevented 검사로는 핸들러 등록 순서에
      // 의존하게 되므로 hover 위치를 직접 확인하는 게 안전.
      const naccsHovered = sectionRef.current.querySelector('[data-naccs-row]:hover')
      if (naccsHovered) return
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
      <AttachButton
        accept="image/*,.pdf"
        multiple
        hidden
        triggerRef={attachTriggerRef}
        onFile={(f) => handleFiles([f])}
      />
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[14px] tracking-[1.2px] text-muted-foreground/80">
          {sectionNumber}
        </span>
        {/* 타이틀 클릭 — 값 있으면 삭제 버튼 노출, 없으면 바로 파일 선택창. */}
        <button
          type="button"
          onClick={() => {
            if (hasAnyValue) setShowDelete((v) => !v)
            else if (country) attachTriggerRef.current?.()
          }}
          disabled={!hasAnyValue && (!country || extracting)}
          title={hasAnyValue ? '클릭하여 삭제 버튼 표시' : country ? '클릭하여 이미지·PDF 자동 추출' : undefined}
          className="font-serif text-[20px] font-medium tracking-tight text-foreground hover:text-muted-foreground cursor-pointer transition-colors disabled:cursor-default disabled:hover:text-foreground"
        >
          추가정보
        </button>
        {hasAnyValue && showDelete && (
          <button
            type="button"
            onClick={async () => {
              await clearAllFields()
              setShowDelete(false)
            }}
            title="이 섹션의 모든 필드 비우기"
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-serif text-[12px] text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            전체 삭제
          </button>
        )}
        {extracting && (
          <span className="font-sans text-[12px] italic text-muted-foreground">추출 중...</span>
        )}
        {extractMsg && (
          <span className={cn(
            'font-sans text-[12px]',
            extractMsg.includes('실패') || extractMsg.includes('오류') || extractMsg.includes('미지원') || extractMsg.includes('찾지') ? 'text-destructive' : 'text-pmw-positive',
          )}>{extractMsg}</span>
        )}
        {/* 모바일 — 섹션 collapse 토글. 데스크톱에선 숨김(항상 펼침). */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? '추가정보 펼치기' : '추가정보 접기'}
          className="md:hidden ml-auto self-center -mr-1 p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronDown
            size={18}
            className={cn('transition-transform', isCollapsed && '-rotate-90')}
          />
        </button>
      </div>
      {dragOver && !isCollapsed && (
        <div className="mb-2 text-xs text-muted-foreground">놓으면 자동 입력</div>
      )}
      <SectionEditModeProvider value={true}>
        <div className={cn(isCollapsed && 'hidden md:block')}>
          {segments.map((seg) => {
            if (seg.type === 'group') {
              return (
                <ExtraGroupRow
                  key={`group:${seg.name}`}
                  caseId={caseId}
                  caseRow={caseRow}
                  groupName={seg.name}
                  items={seg.items}
                  useShortLabel={seg.useShortLabel}
                  activeDest={activeDest}
                />
              )
            }
            const def = seg.entry
            if (def.key === 'address_overseas') {
              return <OverseasAddressField key={def.key} caseId={caseId} caseRow={caseRow} />
            }
            const spec = buildSpecForExtra(def, false)
            const rawValue = readEffectiveExtraValue(data, def.key, activeDest)
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
          {trailing?.({ onTakeoverDrag: () => setDragOver(false) })}
        </div>
      </SectionEditModeProvider>
    </section>
  )
}

/** group 메타데이터로 묶인 추가정보 항목들 — 좌측 그룹명 + 우측 sub-row 스택. */
function ExtraGroupRow({ caseId, caseRow, groupName, items, useShortLabel, activeDest }: {
  caseId: string
  caseRow: CaseRow
  groupName: string
  items: ExtraFieldDef[]
  /** 빌더가 destination 별로 결정한 라벨 모드 — 일본만 true(날짜/시간), 그 외 false(도착일/도착시간). */
  useShortLabel: boolean
  /** 활성 목적지 토큰 — by_dest 경로 읽기용. 다중 목적지 케이스에서만 의미 있음. */
  activeDest: string | null
}) {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 transition-colors hover:bg-accent/60">
      {/* 그룹명 — 우측 항목 라벨(mono muted)과 톤 차이 두기 위해 serif + semibold + foreground. */}
      <span className="pt-1 font-serif text-[14px] font-semibold text-foreground">
        {groupName}
      </span>
      <div className="min-w-0">
        {items.map((def) => {
          const spec = buildSpecForExtra(def, useShortLabel)
          const rawValue = readEffectiveExtraValue(data, def.key, activeDest)
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
 * 사전신고 허가서 첨부 row — 일본 목적지 한정.
 * 추가정보 섹션 마지막 행으로 통합 (별도 카테고리 X). 좌측 라벨 + 우측 파일 리스트·첨부 버튼.
 * case.data.documents 배열에서 stepId='advance-notification' 만 필터해 표시.
 * portal 보호자가 올린 파일도 같은 자리에 보이고, 운영자가 추가 업로드 가능.
 */
function AdvanceNotificationAttachmentsRow({ caseId, caseRow, onTakeoverDrag }: {
  caseId: string
  caseRow: CaseRow
  /** row 가 drag/drop 을 가로챘음을 부모(SimpleExtraSection) 에 알려 자기 ring 끄게 함.
   *  row 가 stopPropagation 하므로 부모 dragLeave/drop 이 안 와서 state 가 stuck 되는 걸 방지. */
  onTakeoverDrag?: () => void
}) {
  const { replaceLocalCaseData } = useCases()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('caseId', caseId)
      fd.set('stepId', 'advance-notification')
      fd.set('file', file)
      const res = await uploadStepDocumentAdmin(fd)
      if (res.ok) {
        replaceLocalCaseData(caseId, (res.value.data ?? {}) as Record<string, unknown>)
      } else {
        setError(res.error)
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // Ctrl+V 붙여넣기 — 허가서 row hover 중일 때만 처리. SimpleExtraSection 의
  // AI 추출 paste 핸들러는 data-naccs-row hover 를 감지하면 양보 (아래 부모 핸들러
  // 의 querySelector 분기 참조). 이미지/PDF 파일만 받음, 텍스트·다른 종류 무시.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!rowRef.current) return
      if (!rowRef.current.matches(':hover')) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/') || item.type === 'application/pdf') {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void handleFile(file)
            return
          }
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  // 드래그앤드롭 — row 영역에 떨어진 파일만 받음. e.stopPropagation 으로 부모
  // SimpleExtraSection 의 AI 추출 drop 핸들러로 전파 차단. 동시에 onTakeoverDrag
  // 콜백으로 부모 dragOver state 도 reset (부모는 자식 dragleave 못 받아 stuck).
  function handleDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
    onTakeoverDrag?.()
  }
  function handleDragLeave(e: React.DragEvent) {
    e.stopPropagation()
    if (rowRef.current && !rowRef.current.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    onTakeoverDrag?.()
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith('image/') || f.type === 'application/pdf',
    )
    if (file) void handleFile(file)
  }

  // 추가정보 내 다른 row 와 동일한 grid 레이아웃 — 좌측 라벨(180px) + 우측 컨텐츠.
  // 빈 상태(파일 없음): inline 첨부 버튼만으로 다른 EditableField row 와 동일한 높이.
  // 첨부 파일 있을 때: 파일 chip 들이 wrap 되어 자연 높이 증가.
  // data-naccs-row: 부모 SimpleExtraSection 의 AI 추출 paste 핸들러가 양보하는 마커.
  return (
    <div
      ref={rowRef}
      data-naccs-row
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'grid grid-cols-1 md:grid-cols-[180px_1fr] items-center gap-md py-2.5 border-b border-border/80 last:border-0 transition-colors hover:bg-accent/60',
        dragOver && 'bg-accent/40 ring-2 ring-ring/30 ring-dashed',
      )}
    >
      <SectionLabel>허가서</SectionLabel>
      {/* 다른 추가정보 행처럼 첨부 버튼만. 올린 파일은 메모(notes)에 모여 표시되며
          (업로드 시 documents+notes 동시 기록) 인라인 리스트는 두지 않는다. */}
      <div className="min-w-0 flex items-center flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'text-xs px-2 py-0.5 rounded-md border border-border/60 hover:bg-accent/60',
            uploading && 'opacity-60 cursor-progress',
          )}
        >
          {uploading ? '업로드 중…' : '+ 첨부'}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  )
}

/**
 * 귀국 항공편 날짜 + '미정' 체크 — 태국·필리핀 왕복 한정. 추가정보 마지막 행으로 통합.
 * 펫무브앱(portal)의 ReturnUndecidedToggle 과 동작 동일:
 *  - 귀국일 입력 시 '미정' 자동 해제, '미정' 체크는 귀국일이 비었을 때만 노출.
 *  - '미정' = 출국편만으로 항공권 step 완료 인정(done-resolver has-flight-date, return_undecided='1').
 * return_date·return_undecided 는 by_dest 스코핑 키라 활성 목적지 칸으로 저장(updateCaseField 5번째 인자).
 * portal 은 활성 목적지로 flatten 해 읽으므로 같은 칸에 쓰면 보호자 앱에서도 완료로 보인다.
 */
function ReturnFlightRow({ caseId, caseRow, activeDest }: {
  caseId: string
  caseRow: CaseRow
  activeDest: string | null
}) {
  const { updateLocalCaseField } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const destArgFor = (key: string): string | null | undefined =>
    activeDest && isDestinationScopedKey(key) ? activeDest : undefined
  const rdRaw = readEffectiveExtraValue(data, 'return_date', activeDest)
  const returnDate = typeof rdRaw === 'string' ? rdRaw : ''
  const undecided = readEffectiveExtraValue(data, 'return_undecided', activeDest) === '1'

  function save(key: string, value: string | null) {
    updateLocalCaseField(caseId, 'data', key, value, destArgFor(key))
    void updateCaseField(caseId, 'data', key, value, destArgFor(key))
  }
  function onChangeDate(next: string) {
    const v = next || null
    save('return_date', v)
    // 귀국일이 들어오면 '미정' 자동 해제 (펫무브앱과 동일 — done 은 어차피 인정되지만 데이터 정합).
    if (v && undecided) save('return_undecided', null)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0 transition-colors hover:bg-accent/60">
      <SectionLabel className="pt-1">귀국 항공편</SectionLabel>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="w-12 shrink-0 font-mono text-[12px] text-muted-foreground/80">날짜</span>
          <DateTextField
            value={returnDate}
            onChange={onChangeDate}
            placeholder="YYYY-MM-DD"
            className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          />
        </div>
        {/* 귀국일이 비었을 때만 '미정' 노출 — 펫무브앱과 동일. */}
        {returnDate.trim().length === 0 && (
          <button
            type="button"
            onClick={() => save('return_undecided', undecided ? null : '1')}
            aria-pressed={undecided}
            className="mt-2.5 ml-[60px] inline-flex items-center gap-2"
          >
            <span
              className={cn(
                'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors',
                undecided ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/50',
              )}
            >
              {undecided && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={cn('text-[14px] font-medium', undecided ? 'text-foreground' : 'text-muted-foreground')}>
              미정
            </span>
          </button>
        )}
        <p className="mt-1.5 ml-[60px] text-[12px] text-muted-foreground/80">
          편도 항공권만 끊은 경우 ‘미정’을 체크하면 출국편만으로 항공권 단계가 완료돼요.
        </p>
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
        <div className="flex items-baseline gap-[20px] overflow-x-auto whitespace-nowrap scrollbar-hide">
          {/* Main chip */}
          {showMain && (
            <div className="group/main inline-flex items-baseline gap-[6px]">
              {editingMain ? (
                <span className="inline-flex items-center gap-sm">
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
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => saveChip('main')}
                    className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
                  >
                    저장
                  </button>
                </span>
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
                <span className="text-pmw-positive text-sm select-none" aria-label="저장됨">✓</span>
              )}
            </div>
          )}

          {/* Secondary chip — pipe separated */}
          {showSec && (
            <div className="group/sec inline-flex items-baseline gap-[6px]">
              {showMain && <span className="text-muted-foreground/30 select-none">|</span>}
              {editingSec ? (
                <span className="inline-flex items-center gap-sm">
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
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => saveChip('sec')}
                    className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 transition-colors disabled:opacity-50"
                  >
                    저장
                  </button>
                </span>
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
                <span className="text-pmw-positive text-sm select-none" aria-label="저장됨">✓</span>
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
                  className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/sec:opacity-70 hover:!opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
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
  const confirm = useConfirm()
  async function handleDelete() {
    const ok = await confirm({
      message: '마이크로칩 삽입일을 삭제하시겠습니까?',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (ok) saveDate(null)
  }
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
      <div className="group/item flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
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
            onClick={handleDelete}
            title="삭제"
            className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/item:opacity-70 hover:!opacity-100"
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
