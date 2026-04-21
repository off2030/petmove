'use client'

import type { CaseRow } from '@/lib/supabase/types'
import { ExtraFieldShell, FieldRow, useExtraFieldShell } from './extra-field-shell'

interface PhilippinesExtra {
  email: string | null
  address_overseas: string | null
  postal_code: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  arrival_airport: string | null
}

const EMPTY: PhilippinesExtra = {
  email: null,
  address_overseas: null,
  postal_code: null,
  passport_number: null,
  passport_expiry_date: null,
  arrival_airport: null,
}

const DATA_KEY = 'philippines_extra'

export function PhilippinesExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const shell = useExtraFieldShell<PhilippinesExtra>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY,
    onExtract: (result, current) => {
      const merged = { ...current }
      if (result.data.email) merged.email = result.data.email
      if (result.data.address_overseas) merged.address_overseas = result.data.address_overseas
      if (result.data.postal_code) merged.postal_code = result.data.postal_code
      if (result.data.passport_number) merged.passport_number = result.data.passport_number
      if (result.data.passport_expiry_date) merged.passport_expiry_date = result.data.passport_expiry_date
      if (result.data.inbound.arrival_airport) merged.arrival_airport = result.data.inbound.arrival_airport
      return { merged, successMsg: '정보가 입력되었습니다' }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell

  return (
    <ExtraFieldShell shell={shell} placeholder="정보를 붙여넣으세요 (Enter로 추출)">
      <FieldRow
        label="이메일주소"
        value={extra.email}
        isEditing={editingField === 'email'}
        onStartEdit={() => setEditingField('email')}
        onSave={(v) => saveField('email', v)}
        onCancelEdit={() => setEditingField(null)}
        placeholder="email@example.com"
      />
      <FieldRow
        label="해외주소"
        value={extra.address_overseas}
        isEditing={editingField === 'address_overseas'}
        onStartEdit={() => setEditingField('address_overseas')}
        onSave={(v) => saveField('address_overseas', v)}
        onCancelEdit={() => setEditingField(null)}
        placeholder="Destination address in Philippines"
      />
      <FieldRow
        label="우편번호"
        value={extra.postal_code}
        isEditing={editingField === 'postal_code'}
        onStartEdit={() => setEditingField('postal_code')}
        onSave={(v) => saveField('postal_code', v)}
        onCancelEdit={() => setEditingField(null)}
      />
      <FieldRow
        label="여권번호"
        value={extra.passport_number}
        isEditing={editingField === 'passport_number'}
        onStartEdit={() => setEditingField('passport_number')}
        onSave={(v) => saveField('passport_number', v)}
        onCancelEdit={() => setEditingField(null)}
      />
      <FieldRow
        label="여권유효기간"
        value={extra.passport_expiry_date}
        type="date"
        isEditing={editingField === 'passport_expiry_date'}
        onStartEdit={() => setEditingField('passport_expiry_date')}
        onSave={(v) => saveField('passport_expiry_date', v)}
        onCancelEdit={() => setEditingField(null)}
      />
      <FieldRow
        label="입국공항"
        value={extra.arrival_airport}
        isEditing={editingField === 'arrival_airport'}
        onStartEdit={() => setEditingField('arrival_airport')}
        onSave={(v) => saveField('arrival_airport', v)}
        onCancelEdit={() => setEditingField(null)}
        placeholder="MNL"
      />
    </ExtraFieldShell>
  )
}
