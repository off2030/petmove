'use client'

import type { CaseRow } from '@/lib/supabase/types'
import { ExtraFieldShell, FieldRow, useExtraFieldShell } from './extra-field-shell'

interface UsaExtra {
  passport_number: string | null
  birth_date: string | null
  us_phone: string | null
  arrival_date: string | null
}

const EMPTY: UsaExtra = {
  passport_number: null,
  birth_date: null,
  us_phone: null,
  arrival_date: null,
}

const DATA_KEY = 'usa_extra'

export function UsaExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const shell = useExtraFieldShell<UsaExtra, 'usa'>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY, country: 'usa',
    onExtract: (result, current, helpers) => {
      const merged = { ...current }
      if (result.data.passport_number) merged.passport_number = result.data.passport_number
      if (result.data.birth_date) merged.birth_date = result.data.birth_date
      if (result.data.us_phone) merged.us_phone = result.data.us_phone
      if (result.data.arrival_date) merged.arrival_date = result.data.arrival_date
      const departureDate = result.data.arrival_date ?? null
      return {
        merged,
        successMsg: '정보가 입력되었습니다',
        afterSave: async () => { await helpers.syncDepartureDate(departureDate) },
      }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell

  const rowProps = (key: keyof UsaExtra) => ({
    isEditing: editingField === key,
    onStartEdit: () => setEditingField(key as string),
    onSave: (v: string | null) => saveField(key, v),
    onCancelEdit: () => setEditingField(null),
  })

  return (
    <ExtraFieldShell shell={shell} sectionNumber={sectionNumber} placeholder="정보를 붙여넣으세요 (Enter로 추출)">
      <FieldRow label="여권번호" value={extra.passport_number} {...rowProps('passport_number')} />
      <FieldRow label="생년월일" value={extra.birth_date} type="date" {...rowProps('birth_date')} />
      <FieldRow label="미국 전화번호" value={extra.us_phone} {...rowProps('us_phone')} placeholder="+1-..." />
      <FieldRow label="도착일" value={extra.arrival_date} type="date" {...rowProps('arrival_date')} />
    </ExtraFieldShell>
  )
}
