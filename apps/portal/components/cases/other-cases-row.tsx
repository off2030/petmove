'use client'

import Link from 'next/link'
import { avatarGlyph, avatarGradient, avatarIsEmoji } from '@/lib/avatar'
import { useCases } from '@/components/portal-shell/case-data-provider'

/**
 * 헤더의 PetAvatar 옆에 들어가는 "다른 동물 아바타" 행.
 *
 * 케이스가 한 건뿐이면 null — 헤더는 평소처럼 PetAvatar + 이름만.
 * 두 건 이상이면 활성 케이스를 뺀 나머지 동물 아바타(24px, 케이스별 색·이모지)를
 * 가로로 나열. 클릭 시 같은 탭(journey/docs) 의 다른 case 로 이동.
 *
 * 헤더 컨테이너가 alignItems:'baseline' + flexWrap:'wrap' 이라 이 행은 alignSelf:
 * 'center' 로 감싸고, gap 은 부모 12 → 자체 6 으로 살짝 좁힘.
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
      style={{
        alignSelf: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        marginLeft: -4,
      }}
    >
      {cases.map((c, i) => {
        if (c.id === currentCaseId) return null
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
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: avatarGradient(c, i),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontFamily: isEmoji
                ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
                : 'var(--pm-font-display)',
              fontWeight: 600,
              fontSize: isEmoji ? 13 : 10,
              lineHeight: 1,
              textDecoration: 'none',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,.25)',
              opacity: 0.7,
            }}
          >
            {avatarGlyph(c)}
          </Link>
        )
      })}
    </span>
  )
}
