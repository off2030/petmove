'use client'

import type { CaseRow } from '@petmove/domain'
import { AddressSearchField, SplitNameField, TextField } from '@/components/fields/info-fields'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { useUnsavedGuard } from '@/components/portal-shell/nav-guard'
import { deriveInitials } from '@/lib/profile/catalog'
import { C, EditPageShell, SectionCard, StickySaveBar } from './settings-shared'
import { GuardianAvatarPicker } from './guardian-avatar-picker'
import { useCaseEditForm } from './use-case-edit-form'

/**
 * 설정 > 보호자 — /me/guardian.
 * 현 InfoView 의 "보호자 정보" 섹션 7개 필드. 저장은 useCaseEditForm → updateCaseInfoFields.
 * (base 대비 바뀐 칸만 반영 → 다른 화면·주체가 채운 나머지 필드는 안 지워진다.)
 */
export function GuardianEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)
  useUnsavedGuard(dirty)
  const { profile, userEmail, updateProfile } = useCases()
  const initials = deriveInitials(
    caseRow.customer_name ?? profile?.display_name ?? null,
    caseRow.customer_name_en ?? null,
    userEmail,
  )

  return (
    <EditPageShell
      title="보호자"
      bottomBar={
        <StickySaveBar dirty={dirty} status={status} error={error} onSave={handleSave} />
      }
    >
      {/* 아바타 — 이모지·색·사진 picker. PetAvatarPicker 와 동일 위치(상단). */}
      <div
        style={{
          marginTop: 8,
          padding: 18,
          borderRadius: 18,
          background: C.surface,
          border: `.5px solid ${C.line}`,
        }}
      >
        <GuardianAvatarPicker
          profile={profile}
          userId={profile?.user_id ?? ''}
          initials={initials}
          onUpdated={updateProfile}
        />
      </div>

      <SectionCard marginTop={16}>
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
            // 새 주소 → 옛 상세주소·영문·우편번호 한 번에 갱신. address_kr 은 도로명만
            // (admin 합본 패턴 follow — 상세 입력 시 합본 갱신).
            set('address_kr', data.roadAddress)
            set('address_en', data.roadAddressEnglish)
            set('address_zipcode', data.zonecode)
            set('address_detail_kr', '')
          }}
          onChangeDetail={(v) => {
            // admin PDF fill 의 splitKrAddress 가 full.endsWith(stored) 로 detail 을
            // 떼어내므로 address_kr 을 "${도로명} ${상세}" 합본으로 저장한다. 도로명은
            // 현재 address_kr 에서 옛 detail 을 떼어내 추출 (없으면 전체가 도로명).
            const fullPrev = form.address_kr.trim()
            const detailPrev = form.address_detail_kr.trim()
            const road =
              detailPrev && fullPrev.endsWith(detailPrev)
                ? fullPrev.slice(0, -detailPrev.length).trim()
                : fullPrev
            const next = v.trim() ? `${road} ${v.trim()}`.trim() : road
            set('address_kr', next)
            set('address_detail_kr', v)
          }}
          last
        />
      </SectionCard>
    </EditPageShell>
  )
}
