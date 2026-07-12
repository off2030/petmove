'use client'

import Link from 'next/link'
import { avatarGlyph, avatarGlyphColor, avatarGradient, avatarPhoto } from '@/lib/avatar'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'

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
  // 여정(목적지) 있는 동물만 — 목적지 다 지운 동물은 전환 아바타에서도 빠진다.
  const journeyCases = cases.filter(hasJourney)
  if (journeyCases.length < 2) return null

  return (
    <span
      className="pm-noscroll"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        // overflow-x:auto 는 spec 상 overflow-y 도 같이 auto 라 ring 이 잘림.
        // block padding 으로 ring(±4.5px) 들어갈 공간 확보. 단, 레이아웃 높이까지
        // 40px 로 커지면 헤더 행(중앙 정렬)이 제목을 6px 아래로 밀어 다른 탭과
        // 제목 시작 위치가 어긋난다 — 음수 마진으로 상쇄(가로 -4 와 같은 수법).
        paddingBlock: 6,
        marginBlock: -6,
        paddingInline: 4,
        marginInline: -4,
      }}
    >
      {journeyCases.map((c) => {
        // 아바타 색 index 는 전체 목록 기준 — /me 등 다른 화면과 같은 색 유지.
        const i = cases.findIndex((x) => x.id === c.id)
        const isActive = c.id === currentCaseId
        const photo = avatarPhoto(c)
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
              background: photo ? '#0000' : avatarGradient(c, i),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              color: avatarGlyphColor(c, i),
              fontFamily: 'var(--pm-font-display)',
              fontWeight: 600,
              fontSize: 11,
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
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              avatarGlyph(c)
            )}
          </Link>
        )
      })}
    </span>
  )
}
