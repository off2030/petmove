'use client'

import type { CaseRow } from '@petmove/domain'
import {
  DateField,
  OptionField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'
import { PetAvatarPicker } from '@/components/me/pet-avatar-picker'
import { buildPetBlock } from '@/lib/profile/catalog'
import { ageLabel } from '@/lib/cases/info-form'
import { C, EditPageShell, SectionCard, StickySaveBar } from './settings-shared'
import { useCaseEditForm } from './use-case-edit-form'

/**
 * 설정 > 동물 — /me/animal.
 * 아바타(PetAvatarPicker) + 현 InfoView "동물 정보" 9개 필드.
 */

const SPECIES_OPTIONS: readonly FieldOption[] = [
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
  { value: 'other', label: '기타' },
]
const SEX_OPTIONS: readonly FieldOption[] = [
  { value: 'male', label: '수컷' },
  { value: 'female', label: '암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'spayed_female', label: '중성화 암컷' },
]

export function AnimalEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)

  return (
    <EditPageShell
      title="동물"
      bottomBar={
        <StickySaveBar dirty={dirty} status={status} error={error} onSave={handleSave} />
      }
    >
      {/* 아바타 — ProfileView hero 카드에서 쓰던 picker 재사용 */}
      <div
        style={{
          marginTop: 8,
          padding: 18,
          borderRadius: 18,
          background: C.surface,
          border: `.5px solid ${C.line}`,
        }}
      >
        <PetAvatarPicker case_={caseRow} pet={buildPetBlock(caseRow)} />
      </div>

      <SectionCard marginTop={16}>
        <TextField
          label="이름"
          value={form.pet_name}
          onChange={(v) => set('pet_name', v)}
          placeholder="예: 마루"
        />
        <TextField
          label="영문 이름"
          value={form.pet_name_en}
          onChange={(v) => set('pet_name_en', v)}
          placeholder="예: Maru"
        />
        <TextField
          label="마이크로칩번호"
          value={form.microchip}
          onChange={(v) => set('microchip', v)}
          mask="microchip"
          inputMode="numeric"
          placeholder="15자리"
        />
        <DateField
          label="생년월일"
          value={form.birth_date}
          onChange={(v) => set('birth_date', v)}
          sub={ageLabel(form.birth_date)}
        />
        <OptionField
          label="종"
          value={form.species}
          onChange={(v) => set('species', v)}
          options={SPECIES_OPTIONS}
        />
        <TextField
          label="품종"
          value={form.breed}
          onChange={(v) => set('breed', v)}
          placeholder="예: 말티즈"
        />
        <TextField
          label="모색"
          value={form.color}
          onChange={(v) => set('color', v)}
          placeholder="예: 흰색"
        />
        <OptionField
          label="성별"
          value={form.sex}
          onChange={(v) => set('sex', v)}
          options={SEX_OPTIONS}
        />
        <TextField
          label="몸무게"
          value={form.weight}
          onChange={(v) => set('weight', v)}
          mask="weight"
          inputMode="decimal"
          placeholder="예: 5.2"
          suffix="kg"
          last
        />
      </SectionCard>
    </EditPageShell>
  )
}
