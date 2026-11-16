'use client'

import type { CaseRow } from '@petmove/domain'
import { phScopedData, philippinesPolicy, resolveActiveDestination } from '@petmove/domain'
import { useCases } from './cases-context'
import { updateCaseField } from '@/lib/actions/cases'
import { toastError } from '@/lib/toast-bus'
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

export function PhilippinesExtraField({ caseId, caseRow, sectionNumber }: { caseId: string; caseRow: CaseRow; sectionNumber: string }) {
  const shell = useExtraFieldShell<PhilippinesExtra, 'philippines'>({
    caseId, caseRow, dataKey: DATA_KEY, empty: EMPTY, country: 'philippines', sectionLabel: '필리핀 추가정보',
    onExtract: (result, current) => {
      const merged = { ...current }
      if (result.data.email) merged.email = result.data.email
      if (result.data.address_overseas) merged.address_overseas = result.data.address_overseas
      if (result.data.postal_code) merged.postal_code = result.data.postal_code
      if (result.data.passport_number) merged.passport_number = result.data.passport_number
      if (result.data.passport_expiry_date) merged.passport_expiry_date = result.data.passport_expiry_date
      if (result.data.arrival_airport) merged.arrival_airport = result.data.arrival_airport
      return { merged, successMsg: '정보가 입력되었습니다' }
    },
  })
  const { extra, editingField, setEditingField, saveField } = shell
  const { activeDestination, updateLocalCaseField } = useCases()
  const destination = resolveActiveDestination(caseRow.destination, activeDestination)
  const policyData = phScopedData(caseRow, destination)
  const policy = philippinesPolicy(caseRow, destination)
  async function savePolicy(key: string, value: string | null) {
    const result = await updateCaseField(caseId, 'data', key, value, destination)
    if (!result.ok) { toastError(result.error); return }
    updateLocalCaseField(caseId, 'data', key, value, destination)
    setEditingField(null)
  }

  return (
    <ExtraFieldShell shell={shell} sectionNumber={sectionNumber} placeholder="정보를 붙여넣으세요 (Enter로 추출)">
      <p className="text-xs text-muted-foreground mb-3">{policy === 'legacy' ? '2026년 기존 요건 적용' : policy === 'review' ? 'SPSIC 승인일 확인 필요 · 신규 요건 준비' : '2027년 신규 SPSIC 요건 적용'}</p>
      {[
        ['ph_spsic_approved_date', 'SPSIC 승인일', 'date'],
        ['ph_form1_issue_date', 'Form 1 발급일', 'date'],
        ['ph_form1_endorsed_date', 'Form 1 정부 확인일', 'date'],
        ['ph_importer_name', '수입자 영문 이름', 'text'],
        ['ph_importer_address', '수입자 주소', 'text'],
        ['ph_government_vet_name', '정부 확인 수의사 성명', 'text'],
        ['ph_government_office', '정부 확인 기관·주소', 'text'],
        ['ph_last_birth_date', '최근 출산일 (해당 시)', 'date'],
      ].map(([key, label, type]) => <FieldRow key={key} label={label} value={typeof policyData[key] === 'string' ? policyData[key] as string : null} type={type as 'date' | 'text'} isEditing={editingField === key} onStartEdit={() => setEditingField(key)} onSave={v => savePolicy(key, v)} onCancelEdit={() => setEditingField(null)} />)}
      <label className="flex items-center gap-3 text-sm my-3">SPSIC 신청 시 임신 여부
        <select value={String(policyData.ph_pregnant ?? '')} onChange={e => void savePolicy('ph_pregnant', e.target.value || null)} className="bg-background border rounded px-2 py-1">
          <option value="">미확인 / 해당 없음</option><option value="no">임신 아님</option><option value="yes">임신 중</option>
        </select>
      </label>
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
