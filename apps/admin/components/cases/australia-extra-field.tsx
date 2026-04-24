'use client'

import type { CaseRow } from '@/lib/supabase/types'
import { ExtraFieldShell, FieldRow, useExtraFieldShell } from './extra-field-shell'

interface AustraliaExtra {
  permit_no: string | null
  id_date: string | null
  sample_received_date: string | null
}

const EMPTY: AustraliaExtra = {
  permit_no: null,
  id_date: null,
  sample_received_date: null,
}

const DATA_KEY = 'australia_extra'

export function AustraliaExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const shell = useExtraFieldShell<AustraliaExtra, 'australia'>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY, country: 'australia',
    onExtract: (result, current) => {
      const merged = { ...current }
      if (result.data.permit_no) merged.permit_no = result.data.permit_no
      if (result.data.id_date) merged.id_date = result.data.id_date
      if (result.data.sample_received_date) merged.sample_received_date = result.data.sample_received_date
      const changed = merged.permit_no !== current.permit_no
        || merged.id_date !== current.id_date
        || merged.sample_received_date !== current.sample_received_date
      if (!changed) return { merged: null, noMatchMsg: '추출 실패: 호주 관련 정보를 찾지 못했습니다' }
      return { merged, successMsg: '호주 정보가 입력되었습니다' }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell

  return (
    <ExtraFieldShell shell={shell} sectionNumber={sectionNumber} placeholder="허가번호·샘플수령일·ID 확인일 정보를 붙여넣으세요 (Enter로 추출)">
      <FieldRow
        label="Permit No."
        value={extra.permit_no}
        isEditing={editingField === 'permit_no'}
        onStartEdit={() => setEditingField('permit_no')}
        onSave={(v) => saveField('permit_no', v)}
        onCancelEdit={() => setEditingField(null)}
      />
      <FieldRow
        label="ID date"
        value={extra.id_date}
        type="date"
        isEditing={editingField === 'id_date'}
        onStartEdit={() => setEditingField('id_date')}
        onSave={(v) => saveField('id_date', v)}
        onCancelEdit={() => setEditingField(null)}
      />
      <FieldRow
        label="샘플수령일"
        value={extra.sample_received_date}
        type="date"
        isEditing={editingField === 'sample_received_date'}
        onStartEdit={() => setEditingField('sample_received_date')}
        onSave={(v) => saveField('sample_received_date', v)}
        onCancelEdit={() => setEditingField(null)}
      />
    </ExtraFieldShell>
  )
}
