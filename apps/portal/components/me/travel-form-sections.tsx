'use client'

import { buildCaseJourneyContext, type CaseRow } from '@petmove/domain'
import {
  DateField,
  DestinationField,
  SegmentField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'
import { dDayLabel } from '@/lib/cases/info-form'
import { C, SectionCard } from './settings-shared'
import type { UseCaseEditForm } from './use-case-edit-form'

/**
 * 여행 정보 입력 SectionCard 묶음 — TravelEditView(/me/travel) 와 AnimalEditView(/me/animal/[caseId])
 * 가 공유. 양쪽 다 useCaseEditForm 로 form/set 을 만들어 prop 으로 흘려보낸다.
 *
 * 표시 구성:
 *  - 기본 — 여행지·유형·동시 진행(siblings 있을 때)·출국일·귀국일(왕복)
 *  - 출국 항공권
 *  - 귀국 항공권 (왕복만)
 *  - 일본 수출검역 (왕복 + 일본만)
 *
 * 첫 SectionCard 의 marginTop 만 prop 으로 받음 — 호출자의 spacing 컨텍스트에 맞춤.
 */

const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]
const CO_PROGRESS_OPTIONS: readonly FieldOption[] = [
  { value: 'on', label: '함께 여행' },
  { value: 'off', label: '따로 여행' },
]

interface Props {
  caseRow: CaseRow
  form: UseCaseEditForm['form']
  set: UseCaseEditForm['set']
  /** 같은 보호자의 다른 케이스가 있는지 — '동시 진행' 토글 노출 여부. */
  hasSibling: boolean
  /** 첫 SectionCard("기본") 의 marginTop. 기본 8 (TravelEditView 의 기존 값). */
  marginTop?: number
  /** true 면 '기본'(여행지·유형·날짜)만 — 항공권·일본 수출검역 섹션 숨김. 펫 프로필(/me/animal)용. */
  basicOnly?: boolean
}

export function TravelFormSections({
  caseRow,
  form,
  set,
  hasSibling,
  marginTop = 8,
  basicOnly = false,
}: Props) {
  const isRound = form.trip_type === 'round'
  const isJapan =
    buildCaseJourneyContext({ ...caseRow, destination: form.destination }).destinationKey === 'japan'

  // 펫 프로필(basicOnly) — 카테고리명·유형 라벨·출국/귀국일 없이 목적지 + 왕복/편도만.
  if (basicOnly) {
    return (
      <SectionCard marginTop={marginTop}>
        <DestinationField
          label="목적지"
          value={form.destination}
          onChange={(v) => set('destination', v)}
          last={!hasSibling}
        />
        {/* 왕복/편도 — 라벨 없이 칩만 (신청폼과 동일). */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '11px 0',
            minHeight: 46,
            alignItems: 'center',
            borderBottom: hasSibling ? `.5px solid ${C.line}` : 'none',
          }}
        >
          {TRIP_OPTIONS.map((o) => {
            const selected = form.trip_type === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => set('trip_type', o.value === 'one_way' ? 'one_way' : 'round')}
                aria-pressed={selected}
                style={{
                  padding: '7px 16px',
                  borderRadius: 999,
                  border: `1px solid ${selected ? C.ink : C.line}`,
                  background: selected ? C.ink : 'transparent',
                  color: selected ? C.surface : C.ink2,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background .12s, color .12s, border-color .12s',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {hasSibling && (
          <SegmentField
            label="동시 진행"
            value={form.co_progress ? 'on' : 'off'}
            onChange={(v) => set('co_progress', v === 'on')}
            options={CO_PROGRESS_OPTIONS}
            last
          />
        )}
      </SectionCard>
    )
  }

  return (
    <>
      <SectionCard label="기본" marginTop={marginTop}>
        <DestinationField
          label="여행지"
          value={form.destination}
          onChange={(v) => set('destination', v)}
        />
        <SegmentField
          label="유형"
          value={form.trip_type}
          onChange={(v) => set('trip_type', v === 'one_way' ? 'one_way' : 'round')}
          options={TRIP_OPTIONS}
        />
        {hasSibling && (
          <SegmentField
            label="동시 진행"
            value={form.co_progress ? 'on' : 'off'}
            onChange={(v) => set('co_progress', v === 'on')}
            options={CO_PROGRESS_OPTIONS}
          />
        )}
        <DateField
          label="출국일"
          value={form.departure_date}
          onChange={(v) => set('departure_date', v)}
          sub={dDayLabel(form.departure_date)}
          last={!isRound}
        />
        {isRound && (
          <DateField
            label="귀국일"
            value={form.return_date}
            onChange={(v) => set('return_date', v)}
            last
          />
        )}
      </SectionCard>

      <SectionCard label="출국 항공권">
        <TextField
          label="출발 공항"
          value={form.entry_departure_airport}
          onChange={(v) => set('entry_departure_airport', v)}
          placeholder="예: 인천 ICN"
        />
        <TextField
          label="도착 공항"
          value={form.entry_airport}
          onChange={(v) => set('entry_airport', v)}
          placeholder="예: 나리타 NRT"
        />
        <TextField
          label="편명"
          value={form.entry_flight_number}
          onChange={(v) => set('entry_flight_number', v)}
          placeholder="예: KE703"
        />
        <TextField
          label="운송 방법"
          value={form.entry_transport}
          onChange={(v) => set('entry_transport', v)}
          placeholder="예: 수하물 / 화물"
          last
        />
      </SectionCard>

      {isRound && (
        <SectionCard label="귀국 항공권">
          <TextField
            label="출발 공항"
            value={form.return_departure_airport}
            onChange={(v) => set('return_departure_airport', v)}
            placeholder="예: 나리타 NRT"
          />
          <TextField
            label="도착 공항"
            value={form.return_arrival_airport}
            onChange={(v) => set('return_arrival_airport', v)}
            placeholder="예: 인천 ICN"
          />
          <TextField
            label="편명"
            value={form.return_flight_number}
            onChange={(v) => set('return_flight_number', v)}
            placeholder="예: KE704"
          />
          <TextField
            label="운송 방법"
            value={form.return_transport}
            onChange={(v) => set('return_transport', v)}
            placeholder="예: 수하물 / 화물"
            last
          />
        </SectionCard>
      )}

      {isRound && isJapan && (
        <SectionCard label="일본 수출검역">
          <DateField
            label="예약일"
            value={form.jp_export_quarantine_date}
            onChange={(v) => set('jp_export_quarantine_date', v)}
          />
          <TextField
            label="예약시간"
            value={form.jp_export_quarantine_time}
            onChange={(v) => set('jp_export_quarantine_time', v)}
            placeholder="예: 14:30"
            inputMode="numeric"
            mask="time"
            last
          />
        </SectionCard>
      )}
    </>
  )
}
