'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import {
  BreedField,
  ColorField,
  DateField,
  OptionField,
  SegmentField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'
import { PetAvatarPicker } from '@/components/me/pet-avatar-picker'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { softDeleteMyCase } from '@/lib/actions/cases'
import { buildPetBlock } from '@/lib/profile/catalog'
import { hasSiblingCase } from '@/lib/cases/info-form'
import { C, EditPageShell, SectionCard, StickySaveBar } from './settings-shared'
import { DestinationChips } from './destination-chips'
import { useCaseEditForm } from './use-case-edit-form'

const CO_PROGRESS_OPTIONS: readonly FieldOption[] = [
  { value: 'on', label: '예' },
  { value: 'off', label: '아니오' },
]

/**
 * 설정 > 동물 — /me/animal.
 * 아바타(PetAvatarPicker) + 현 InfoView "동물 정보" 9개 필드.
 */

// 신청폼(apply-form)과 동일하게 강아지·고양이만. admin pdf-fill 도 dog/cat 만 처리.
const SPECIES_OPTIONS: readonly FieldOption[] = [
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
]
const SEX_OPTIONS: readonly FieldOption[] = [
  { value: 'male', label: '수컷' },
  { value: 'female', label: '암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'spayed_female', label: '중성화 암컷' },
]

export function AnimalEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { cases } = useCases()
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)
  const hasSibling = hasSiblingCase(cases, caseRow)

  // multi-destination 입력값 — '여정' 칩 섹션 (Phase 3).
  // caseRow.destination 쉼표 구분 + data.trip_type 객체 형식 모두 인지.
  const destinations = (caseRow.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const tripTypeRaw = (caseRow.data as Record<string, unknown> | null)?.trip_type
  const tripTypeByDest: Record<string, 'round' | 'one_way'> =
    tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
      ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
      : {}

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
        <PetAvatarPicker case_={caseRow} />
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
          mask="en-name"
        />
        <TextField
          label="마이크로칩"
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
        />
        <OptionField
          label="종"
          value={form.species}
          onChange={(v) => {
            // 종이 바뀌면 다른 종의 품종 선택은 무효 → 품종 초기화 (신청폼과 동일).
            if (v !== form.species && (form.breed || form.breed_en)) {
              set('breed', '')
              set('breed_en', '')
            }
            set('species', v)
          }}
          options={SPECIES_OPTIONS}
        />
        <BreedField
          label="품종"
          species={form.species}
          breedKo={form.breed}
          breedEn={form.breed_en}
          onChange={(ko, en) => {
            set('breed', ko)
            set('breed_en', en)
          }}
        />
        <ColorField
          label="모색"
          colorKo={form.color}
          colorEn={form.color_en}
          onChange={(ko, en) => {
            set('color', ko)
            set('color_en', en)
          }}
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

      {/* 여정 칩 — multi-destination. 같은 동물에 N 목적지 표시·전환·추가·제거.
          activeDestination 은 URL ?dest=<token>. '+' 클릭 시 검색 바텀시트.
          (목적지·왕복편도 입력은 칩이 흡수 — 옛 TravelFormSections basicOnly 행 폐기.) */}
      <DestinationChips
        caseId={caseId}
        destinations={destinations}
        tripTypeByDest={tripTypeByDest}
      />

      {/* 함께 준비 — 보호자의 다른 동물 케이스에 절차·정보 자동 반영 (destination 무관). */}
      {hasSibling && (
        <SectionCard marginTop={16}>
          <SegmentField
            label="함께 준비"
            value={form.co_progress ? 'on' : 'off'}
            onChange={(v) => set('co_progress', v === 'on')}
            options={CO_PROGRESS_OPTIONS}
            sub="한 마리에 입력한 일정·절차를 다른 동물에도 같이 반영해요"
            last
          />
        </SectionCard>
      )}

      <DeleteAnimalSection caseId={caseId} petName={buildPetBlock(caseRow).name} />
    </EditPageShell>
  )
}

/** 한국어 받침에 맞춰 조사 선택 — 마지막 글자가 한글이고 종성 있으면 withJong, 아니면 withoutJong. */
function josa(name: string, withJong: string, withoutJong: string): string {
  if (!name) return withoutJong
  const last = name[name.length - 1]
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return withoutJong
  const hasJong = (code - 0xac00) % 28 !== 0
  return hasJong ? withJong : withoutJong
}

/**
 * 동물(케이스) 삭제 — 2단계 인라인 확인. 소프트 삭제(deleted_at)라 목록·앱에서 사라지고
 * 운영자에게는 남아 복구 가능. 삭제 후 케이스 목록을 새로고침하고 내 정보로 복귀.
 */
function DeleteAnimalSection({ caseId, petName }: { caseId: string; petName: string | null }) {
  const router = useRouter()
  const { refreshCases, removeCase } = useCases()
  const [confirming, setConfirming] = useState(false)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await softDeleteMyCase(caseId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // 즉시 client state 에서 제거 + lastCaseId 정리 — 안 그러면 다른 탭(/cases·/docs)이
      // 옛 cases 잔상으로 삭제된 케이스를 보여주거나 lastCaseId 기반 url 로 404 가 뜬다.
      removeCase(caseId)
      // 먼저 내 정보로 이동 — 이 페이지(useCase(caseId))가 삭제된 케이스로 notFound()
      // 를 띄우기 전에 떠난다. 목록 갱신은 이동 후 백그라운드로 (provider 는 layout 에 살아있음).
      router.replace('/me')
      void refreshCases()
    })
  }

  const btn: React.CSSProperties = {
    flex: 1,
    padding: '12px 0',
    borderRadius: 12,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
  }

  return (
    <div style={{ marginTop: 32 }}>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          style={{
            width: '100%',
            padding: '13px 0',
            borderRadius: 14,
            border: `1px solid color-mix(in srgb, ${C.warn} 30%, transparent)`,
            background: 'transparent',
            color: C.warn,
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          동물 삭제
        </button>
      ) : (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: C.surface,
            border: `.5px solid ${C.line}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: C.ink, lineHeight: 1.55 }}>
            {petName ? `'${petName}'` : '이 동물'}{petName ? josa(petName, '을', '를') : '을'} 삭제할까요?
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.ink3, lineHeight: 1.55 }}>
            {petName ? `${petName}의` : '이 동물의'} 모든 기록이 삭제됩니다.
          </p>
          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: C.warn, lineHeight: 1.5 }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                setError(null)
              }}
              disabled={busy}
              style={{
                ...btn,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.ink2,
              }}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              style={{
                ...btn,
                border: 0,
                background: C.warn,
                color: '#fff',
              }}
            >
              {busy ? '삭제 중…' : '삭제'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
