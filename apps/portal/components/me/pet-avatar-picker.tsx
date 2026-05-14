'use client'

import { useState, useTransition } from 'react'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseAvatar } from '@/lib/actions/cases'
import {
  AVATAR_COLOR_IDS,
  AVATAR_EMOJIS,
  AVATAR_GRADIENTS,
  avatarGlyph,
  avatarGradient,
  avatarIsEmoji,
  type AvatarColorId,
} from '@/lib/avatar'
import type { PetBlock } from '@/lib/profile/catalog'

/**
 * /me Profile 펫 카드의 hero 행. 아바타 탭 → 인라인으로 picker grid 가 펼쳐짐.
 *
 * - 아바타 자체가 hero 의 큰 원형 (52px). 헬퍼로 이모지/색 fallback 통일.
 * - 탭 시 같은 hero card 안에서 아래쪽으로 이모지 행 + 색상 행 + 초기화 버튼 노출.
 * - 선택 즉시 server action 호출, 응답으로 받은 case 로 Context 업데이트
 *   → TopBar 아바타도 동시에 갱신.
 */
export function PetAvatarPicker({ case_, pet }: { case_: CaseRow; pet: PetBlock }) {
  const [open, setOpen] = useState(false)

  const C = {
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    soft: '#F0E8DB',
  } as const
  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="펫 아바타 변경"
          aria-expanded={open}
          className="pm-pressable"
          style={{
            ...avatarCircleStyle(case_, 52),
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <span style={avatarGlyphSpanStyle(case_, 52)}>{avatarGlyph(case_)}</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...serif, fontSize: 18, color: C.ink }}>{pet.name ?? '이름 미정'}</span>
            {pet.nameEn && (
              <span
                style={{
                  ...serif,
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: C.ink3,
                  fontWeight: 400,
                }}
              >
                {pet.nameEn}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
            {[pet.breed, pet.ageLabel, pet.weight].filter(Boolean).join(' · ') ||
              '아바타를 눌러 이모지·색상을 바꿔보세요'}
          </div>
        </div>
      </div>

      {open && (
        <>
          <div style={{ height: 0.5, background: C.line }} />
          <PickerGrid case_={case_} C={C} />
        </>
      )}
    </div>
  )
}

// ── Picker grid ─────────────────────────────────────────────────────────

function PickerGrid({
  case_,
  C,
}: {
  case_: CaseRow
  C: { ink: string; ink2: string; ink3: string; line: string; soft: string }
}) {
  const { updateCase } = useCases()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const monoCap: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  function commit(emoji: string | null, color: AvatarColorId | null) {
    setError(null)
    startTransition(async () => {
      const r = await updateCaseAvatar(case_.id, emoji, color)
      if (r.ok) updateCase(r.value)
      else setError(r.error)
    })
  }

  const currentEmoji = case_.avatar_emoji ?? null
  const currentColor =
    case_.avatar_color && (AVATAR_COLOR_IDS as readonly string[]).includes(case_.avatar_color)
      ? (case_.avatar_color as AvatarColorId)
      : null

  const slotBase: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: '50%',
    border: 'none',
    cursor: pending ? 'progress' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
    transition: 'transform .15s, box-shadow .15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: pending ? 0.6 : 1 }}>
      <div style={monoCap}>이모지</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {AVATAR_EMOJIS.map((e) => {
          const selected = currentEmoji === e
          return (
            <button
              key={e}
              type="button"
              disabled={pending}
              onClick={() => commit(e, currentColor)}
              aria-label={`이모지 ${e}`}
              aria-pressed={selected}
              style={{
                ...slotBase,
                background: '#FBF7F1',
                fontSize: 18,
                lineHeight: 1,
                boxShadow: selected
                  ? '0 0 0 1.5px #FBF7F1, 0 0 0 3px #735B3D'
                  : `inset 0 0 0 .5px ${C.line}`,
              }}
            >
              {e}
            </button>
          )
        })}
        <button
          type="button"
          disabled={pending}
          onClick={() => commit(null, currentColor)}
          aria-label="이모지 초기화"
          title="이모지 초기화 (이름 첫 글자로 돌아가기)"
          style={{
            ...slotBase,
            width: 'auto',
            padding: '0 12px',
            background: 'transparent',
            color: C.ink3,
            fontSize: 11,
            fontWeight: 500,
            boxShadow: `inset 0 0 0 .5px ${C.line}`,
          }}
        >
          기본
        </button>
      </div>

      <div style={{ ...monoCap, marginTop: 4 }}>색상</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {AVATAR_COLOR_IDS.map((id) => {
          const selected = currentColor === id
          return (
            <button
              key={id}
              type="button"
              disabled={pending}
              onClick={() => commit(currentEmoji, id)}
              aria-label={`색상 ${id}`}
              aria-pressed={selected}
              style={{
                ...slotBase,
                background: AVATAR_GRADIENTS[id],
                boxShadow: selected
                  ? '0 0 0 1.5px #FBF7F1, 0 0 0 3px #735B3D'
                  : 'inset 0 1px 1px rgba(255,255,255,.25)',
              }}
            />
          )
        })}
        <button
          type="button"
          disabled={pending}
          onClick={() => commit(currentEmoji, null)}
          aria-label="색상 초기화"
          title="색상 초기화 (자동 색으로 돌아가기)"
          style={{
            ...slotBase,
            width: 'auto',
            padding: '0 12px',
            background: 'transparent',
            color: C.ink3,
            fontSize: 11,
            fontWeight: 500,
            boxShadow: `inset 0 0 0 .5px ${C.line}`,
          }}
        >
          기본
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#B45C5C', marginTop: 4 }}>{error}</div>
      )}
    </div>
  )
}

// ── Avatar circle 스타일 ─────────────────────────────────────────────────

function avatarCircleStyle(c: CaseRow, size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    background: avatarGradient(c),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.06)',
  }
}

function avatarGlyphSpanStyle(c: CaseRow, size: number): React.CSSProperties {
  const isEmoji = avatarIsEmoji(c)
  return {
    color: '#fff',
    fontFamily: isEmoji
      ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
      : 'var(--pm-font-display)',
    fontWeight: 600,
    fontSize: isEmoji ? Math.round(size * 0.5) : Math.round(size * 0.36),
    lineHeight: 1,
  }
}
