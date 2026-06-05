'use client'

import Link from 'next/link'
import { avatarGlyph, avatarGradient, avatarIsEmoji } from '@/lib/avatar'
import { useCases } from '@/components/portal-shell/case-data-provider'

/**
 * 헤더 우측 끝에 들어가는 전체 케이스 아바타 행. (이전엔 상단바에 있던 스위처)
 *
 * - 케이스 1건이면 null — 헤더는 평소처럼 PetAvatar + 이름만.
 * - 두 건 이상이면 모든 동물 아바타(28px) 가로 나열. 활성은 brown ring + scale 1,
 *   비활성은 opacity 0.42 + scale 0.9. 상단바 옛 스타일과 동일.
 * - 헤더 컨테이너 (display:flex, alignItems:baseline, flexWrap:wrap) 안에서
 *   marginLeft:'auto' 로 우측 끝 정렬. 좁은 화면이면 자연스럽게 다음 줄로 줄바꿈.
 */
export function OtherCasesRow({
  currentCaseId,
  tab,
}: {
  currentCaseId: string
  tab: 'journey' | 'docs'
}) {
  const { cases } = useCases()
  if (cases.length < 2) return null

  return (
    <span
      className="pm-noscroll"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        // overflow-x:auto 는 spec 상 overflow-y 도 같이 auto 라 ring 이 잘림.
        // block padding 으로 ring(±4.5px) 들어갈 공간 확보.
        paddingBlock: 6,
        paddingInline: 4,
        marginInline: -4,
      }}
    >
      {cases.map((c, i) => {
        const isActive = c.id === currentCaseId
        const isEmoji = avatarIsEmoji(c)
        return (
          <Link
            key={c.id}
            href={`/cases/${c.id}/${tab}`}
            prefetch
            aria-label={c.pet_name ?? '케이스'}
            title={c.pet_name ?? '케이스'}
            className="pm-pressable"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: avatarGradient(c, i),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#fff',
              fontFamily: isEmoji
                ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
                : 'var(--pm-font-display)',
              fontWeight: 600,
              fontSize: isEmoji ? 14 : 11,
              lineHeight: 1,
              textDecoration: 'none',
              opacity: isActive ? 1 : 0.42,
              boxShadow: isActive
                ? '0 0 0 1.5px var(--pm-ring-bg), 0 0 0 3px var(--pm-ring-accent), 0 1px 2px rgb(var(--pm-ink-rgb) / .10)'
                : 'inset 0 1px 1px rgba(255,255,255,.25)',
              transform: isActive ? 'scale(1)' : 'scale(0.9)',
              transition: 'opacity .2s, transform .2s, box-shadow .2s',
            }}
          >
            {avatarGlyph(c)}
          </Link>
        )
      })}
    </span>
  )
}
