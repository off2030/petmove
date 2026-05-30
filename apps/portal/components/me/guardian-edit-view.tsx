'use client'

import type { CaseRow } from '@petmove/domain'
import { TextField } from '@/components/fields/info-fields'
import { EditPageShell, SectionCard, StickySaveBar } from './settings-shared'
import { useCaseEditForm } from './use-case-edit-form'

/**
 * 설정 > 보호자 — /me/guardian.
 * 현 InfoView 의 "보호자 정보" 섹션 7개 필드. 저장은 updateCaseInfoFields(전체 폼) 호출.
 * (form 의 다른 필드는 caseRow 에서 읽은 값 그대로 유지되므로 안전.)
 */
export function GuardianEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)

  return (
    <EditPageShell
      title="보호자"
      bottomBar={
        <StickySaveBar dirty={dirty} status={status} error={error} onSave={handleSave} />
      }
    >
      <SectionCard marginTop={8}>
        <TextField
          label="성함"
          value={form.customer_name}
          onChange={(v) => set('customer_name', v)}
          placeholder="예: 홍길동"
        />
        <TextField
          label="영문 성함"
          value={form.customer_name_en}
          onChange={(v) => set('customer_name_en', v)}
          placeholder="예: Gildong Hong"
        />
        <TextField
          label="전화번호"
          value={form.phone}
          onChange={(v) => set('phone', v)}
          mask="phone"
          inputMode="tel"
          placeholder="010-0000-0000"
        />
        <TextField
          label="이메일"
          value={form.email}
          onChange={(v) => set('email', v)}
          inputMode="email"
          placeholder="example@email.com"
        />
        <TextField
          label="한국주소"
          value={form.address_kr}
          onChange={(v) => set('address_kr', v)}
          placeholder="도로명 주소"
          stacked
        />
        <TextField
          label="우편번호"
          value={form.address_zipcode}
          onChange={(v) => set('address_zipcode', v)}
          inputMode="numeric"
          placeholder="00000"
        />
        <TextField
          label="영문주소"
          value={form.address_en}
          onChange={(v) => set('address_en', v)}
          placeholder="English address"
          stacked
          last
        />
      </SectionCard>
    </EditPageShell>
  )
}
