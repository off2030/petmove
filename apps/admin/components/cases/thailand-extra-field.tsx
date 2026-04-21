'use client'

import type { CaseRow } from '@/lib/supabase/types'
import { ExtraFieldShell, FieldRow, useExtraFieldShell } from './extra-field-shell'

interface ThailandExtra {
  address_overseas: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  /** 여권 발급 기관 — Form R.11 "Issued by" */
  passport_issuer: string | null
  arrival_flight_number: string | null
  arrival_date: string | null
  arrival_time: string | null
  quarantine_location: string | null
}

const EMPTY: ThailandExtra = {
  address_overseas: null,
  passport_number: null,
  passport_expiry_date: null,
  passport_issuer: null,
  arrival_flight_number: null,
  arrival_date: null,
  arrival_time: null,
  quarantine_location: null,
}

const QUARANTINE_OPTIONS = [
  { value: 'Bangkok', label: 'Bangkok' },
  { value: 'Phuket', label: 'Phuket' },
  { value: 'Chiang Mai', label: 'Chiang Mai' },
]

const DATA_KEY = 'thailand_extra'

export function ThailandExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const shell = useExtraFieldShell<ThailandExtra>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY,
    onExtract: (result, current, helpers) => {
      const merged = { ...current }
      if (result.data.address_overseas) merged.address_overseas = result.data.address_overseas
      if (result.data.passport_number) merged.passport_number = result.data.passport_number
      if (result.data.passport_expiry_date) merged.passport_expiry_date = result.data.passport_expiry_date
      if (result.data.passport_issuer) merged.passport_issuer = result.data.passport_issuer
      if (result.data.inbound.flight_number) merged.arrival_flight_number = result.data.inbound.flight_number
      if (result.data.inbound.date) merged.arrival_date = result.data.inbound.date
      if (result.data.arrival_time) merged.arrival_time = result.data.arrival_time
      if (result.data.quarantine_location) merged.quarantine_location = result.data.quarantine_location
      const departureDate = result.data.inbound.date ?? null
      return {
        merged,
        successMsg: '정보가 입력되었습니다',
        afterSave: async () => { await helpers.syncDepartureDate(departureDate) },
      }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell

  const rowProps = (key: keyof ThailandExtra) => ({
    isEditing: editingField === key,
    onStartEdit: () => setEditingField(key as string),
    onSave: (v: string | null) => saveField(key, v),
    onCancelEdit: () => setEditingField(null),
    allowDelete: true,
  })

  return (
    <ExtraFieldShell shell={shell} placeholder="정보를 붙여넣으세요 (Enter로 추출)">
      <FieldRow label="해외주소" value={extra.address_overseas} {...rowProps('address_overseas')}
        placeholder="88/17 Rama IV Rd, Silom, Bangkok 10500, Thailand" />
      <FieldRow label="여권번호" value={extra.passport_number} {...rowProps('passport_number')} placeholder="M12345678" />
      <FieldRow label="여권 만료일" value={extra.passport_expiry_date} type="date" {...rowProps('passport_expiry_date')} />
      <FieldRow label="발급기관" value={extra.passport_issuer} {...rowProps('passport_issuer')} placeholder="Ministry of Foreign Affairs" />
      <FieldRow label="항공편명" value={extra.arrival_flight_number} {...rowProps('arrival_flight_number')} placeholder="KE659" />
      <FieldRow label="도착일" value={extra.arrival_date} type="date" {...rowProps('arrival_date')} />
      <FieldRow label="도착시간" value={extra.arrival_time} type="time" {...rowProps('arrival_time')} placeholder="HH:mm" />
      <FieldRow label="도착지" value={extra.quarantine_location} type="select" options={QUARANTINE_OPTIONS} {...rowProps('quarantine_location')} />
    </ExtraFieldShell>
  )
}
