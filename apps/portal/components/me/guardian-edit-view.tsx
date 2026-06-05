'use client'

import type { CaseRow } from '@petmove/domain'
import { AddressSearchField, SplitNameField, TextField } from '@/components/fields/info-fields'
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
          label="이름"
          value={form.customer_name}
          onChange={(v) => set('customer_name', v)}
          placeholder="예: 홍길동"
        />
        <SplitNameField
          label="영문 이름"
          firstValue={form.customer_first_name_en}
          lastValue={form.customer_last_name_en}
          onChangeFirst={(v) => set('customer_first_name_en', v)}
          onChangeLast={(v) => set('customer_last_name_en', v)}
          firstPlaceholder="이름 · Gildong"
          lastPlaceholder="성 · Hong"
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
        <AddressSearchField
          addressKr={form.address_kr}
          addressDetailKr={form.address_detail_kr}
          addressZipcode={form.address_zipcode}
          addressEn={form.address_en}
          onSearchComplete={(data) => {
            // 새 주소 → 옛 상세주소·도로명·영문·우편번호 한 번에 갱신.
            set('address_kr', data.roadAddress)
            set('address_en', data.roadAddressEnglish)
            set('address_zipcode', data.zonecode)
            set('address_detail_kr', '')
          }}
          onChangeDetail={(v) => set('address_detail_kr', v)}
          last
        />
      </SectionCard>
    </EditPageShell>
  )
}
