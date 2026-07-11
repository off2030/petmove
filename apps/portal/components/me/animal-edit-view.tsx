'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import {
  BreedField,
  ColorField,
  DateField,
  OptionField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'
import { PetAvatarPicker } from '@/components/me/pet-avatar-picker'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { useUnsavedGuard } from '@/components/portal-shell/nav-guard'
import { softDeleteMyCase } from '@/lib/actions/cases'
import { buildPetBlock } from '@/lib/profile/catalog'
import { C, EditPageShell, SectionCard } from './settings-shared'
import { DestinationChips } from './destination-chips'
import { PastJourneysSection } from './past-journeys-section'
import { useAnimalEditForm } from './use-animal-edit-form'

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
  const {
    form,
    set,
    journey,
    stageAdd,
    stageRemove,
    stageRestore,
    stageTripType,
    stageCoProgress,
    dirty,
    status,
    error,
    handleSave,
  } = useAnimalEditForm(caseRow, caseId)

  useUnsavedGuard(dirty)

  return (
    <EditPageShell title="반려동물">
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

      {/* 여정 — multi-destination. 같은 동물에 N 목적지 표시·전환·추가·제거.
          목적지·왕복편도·함께 준비 입력은 로컬 staged — 아래 '저장' 버튼에서 동물 정보와 함께 커밋.
          '함께 준비' 는 같은 목적지로 가는 형제가 있는 카드에만 노출. */}
      <DestinationChips
        cards={journey.cards}
        selected={journey.selected}
        tripTypeByDest={journey.tripTypeByDest}
        coProgress={journey.coProgress}
        coProgressDests={journey.coProgressDests}
        disabled={status === 'saving'}
        onStageTripType={stageTripType}
        onStageCoProgress={stageCoProgress}
        onStageRemove={stageRemove}
        onStageRestore={stageRestore}
        onStageAdd={stageAdd}
        // 지난 여정 — 목적지 카드 아래, '목적지 추가' 버튼 위에 끼워 넣는 접이식 작은 카드.
        // 평소 'History · N' 한 줄, 펼치면 완료 여정 도장 목록. past_journeys 없으면 자동 숨김.
        afterCards={<PastJourneysSection caseRow={caseRow} />}
      />

      {/* 저장 버튼 — 동물 정보 + 여정 변경을 함께 저장한다. '동물 삭제' 바로 위.
          (삭제·함께 준비 해제 confirm 은 이 버튼을 누를 때 뜬다.) */}
      <InlineSaveButton dirty={dirty} status={status} error={error} onSave={handleSave} />

      <DeleteAnimalSection caseId={caseId} petName={buildPetBlock(caseRow).name} />
    </EditPageShell>
  )
}

/**
 * 인라인 저장 버튼 — sticky 가 아닌, 본문 흐름 안의 풀폭 버튼.
 * 폼 내용 끝, '동물 삭제' 위에 자리잡아 저장→삭제 순서로 노출된다.
 * StickySaveBar 와 dirty/status 의미는 동일.
 */
function InlineSaveButton({
  dirty,
  status,
  error,
  onSave,
}: {
  dirty: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  error: string | null
  onSave: () => void
}) {
  const justSaved = status === 'saved' && !dirty
  const canSave = dirty && status !== 'saving'
  return (
    <div style={{ marginTop: 28 }}>
      {status === 'error' && (
        <div
          role="alert"
          style={{
            marginBottom: 8,
            padding: '9px 12px',
            borderRadius: 10,
            background: C.surface,
            border: `.5px solid color-mix(in srgb, ${C.danger} 33%, transparent)`,
            color: C.danger,
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          {error ?? '저장 실패'}
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        aria-live="polite"
        style={{
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: 0,
          background: justSaved ? C.sage : canSave ? C.accent : C.line,
          color: justSaved || canSave ? '#fff' : C.ink3,
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          cursor: canSave ? 'pointer' : 'not-allowed',
          transition: 'background .15s, color .15s',
        }}
      >
        {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
      </button>
    </div>
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
            border: `1px solid color-mix(in srgb, ${C.danger} 30%, transparent)`,
            background: 'transparent',
            color: C.danger,
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
            <p style={{ margin: '10px 0 0', fontSize: 12, color: C.danger, lineHeight: 1.5 }}>{error}</p>
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
                background: C.danger,
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
