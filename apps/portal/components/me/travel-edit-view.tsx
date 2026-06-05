'use client'

import type { CaseRow } from '@petmove/domain'
import { buildCaseJourneyContext } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import {
  DateField,
  DestinationField,
  SegmentField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'
import { dDayLabel, hasSiblingCase } from '@/lib/cases/info-form'
import { EditPageShell, SectionCard, StickySaveBar } from './settings-shared'
import { useCaseEditForm } from './use-case-edit-form'

/**
 * 설정 > 여행 정보 — /me/travel.
 * 기본(여행지·왕복편도·함께/따로) + 출국일·귀국일 + 항공권 + 일본 수출검역 예약(왕복+일본).
 * "함께 여행 / 따로 여행" 라벨은 기존 "함께 / 개별" 의 rename.
 */

const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]
const CO_PROGRESS_OPTIONS: readonly FieldOption[] = [
  { value: 'on', label: '함께 여행' },
  { value: 'off', label: '따로 여행' },
]

export function TravelEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { cases } = useCases()
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)

  const hasSibling = hasSiblingCase(cases, caseRow)
  const isRound = form.trip_type === 'round'
  const isJapan =
    buildCaseJourneyContext({ ...caseRow, destination: form.destination }).destinationKey === 'japan'

  return (
    <EditPageShell
      title="여행 정보"
      bottomBar={
        <StickySaveBar dirty={dirty} status={status} error={error} onSave={handleSave} />
      }
    >
      {/* 기본 — 여행지·유형·함께/따로 */}
      <SectionCard label="기본" marginTop={8}>
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

      {/* 출국 항공권 */}
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

      {/* 귀국 항공권 (왕복) */}
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

      {/* 일본 수출검역 (왕복 + 일본) */}
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
    </EditPageShell>
  )
}
