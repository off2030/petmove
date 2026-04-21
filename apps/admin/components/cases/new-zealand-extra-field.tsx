'use client'

import type { CaseRow } from '@/lib/supabase/types'
import { ExtraFieldShell, FieldRow, useExtraFieldShell } from './extra-field-shell'

interface NewZealandExtra {
  permit_no: string | null
}

const EMPTY: NewZealandExtra = {
  permit_no: null,
}

const DATA_KEY = 'new_zealand_extra'

export function NewZealandExtraField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const shell = useExtraFieldShell<NewZealandExtra>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY,
    onExtract: (result, current) => {
      const merged = { ...current }
      if (result.data.nz_permit_no) merged.permit_no = result.data.nz_permit_no
      if (merged.permit_no === current.permit_no) {
        return { merged: null, noMatchMsg: '추출 실패: 뉴질랜드 관련 정보를 찾지 못했습니다' }
      }
      return { merged, successMsg: '뉴질랜드 정보가 입력되었습니다' }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell

  return (
    <ExtraFieldShell shell={shell} placeholder="허가번호·도착공항 정보를 붙여넣으세요 (Enter로 추출)">
      <FieldRow
        label="Permit No."
        value={extra.permit_no}
        isEditing={editingField === 'permit_no'}
        onStartEdit={() => setEditingField('permit_no')}
        onSave={(v) => saveField('permit_no', v)}
        onCancelEdit={() => setEditingField(null)}
        placeholder="NZ Permit to Import"
      />
    </ExtraFieldShell>
  )
}
