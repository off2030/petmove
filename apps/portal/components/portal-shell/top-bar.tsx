'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { avatarGlyph, avatarGradient, avatarIsEmoji } from '@/lib/avatar'
import { readLastCaseId } from './last-case'
import { useCases } from './case-data-provider'

/**
 * Portal 상단 chrome — portal-preview/app.jsx 의 ThemeControls 포팅.
 *
 * 좌측: PETMOVE 워드마크 (Fraunces serif, letterSpacing 0.22em — 브랜드 시그니처)
 * 우측: 팔레트 / 다크모드 토글 → 구분선 → 펫 아바타 스위처(케이스 ≥1건일 때).
 *   - 아바타 (이모지/색) 는 보호자가 /me 에서 설정. 미설정 시 pet_name 첫 글자 +
 *     case.id 해시 색으로 fallback. 헬퍼는 @/lib/avatar.
 *   - 활성 상태: 외곽 brown ring + scale 1, 비활성: opacity .42 + scale .9
 *   - 클릭 시 현재 탭(journey/docs/info) 유지하며 caseId 만 교체
 *
 * position: fixed top. safe-area-inset-top 보정 (iOS PWA 다이내믹 아일랜드).
 * height(=safe-area + 48) 만큼 본문 paddingTop 필요. (authed) layout 에서 처리.
 */

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

function currentTab(pathname: string): 'journey' | 'docs' | 'info' {
  if (pathname.includes('/docs')) return 'docs'
  if (pathname.includes('/info')) return 'info'
  return 'journey'
}

export function TopBar() {
  const pathname = usePathname()
  const { cases } = useCases()
  const activeCaseId = caseIdFromPath(pathname)
  const tab = currentTab(pathname)

  // PETMOVE 워드마크는 "현재 여정"으로 — bottom-nav 와 동일한 case 결정 패턴.
  // path 에 caseId 가 있으면 그걸, 아니면 sessionStorage 의 마지막 case, 둘 다 없으면 /cases.
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)
  useEffect(() => {
    if (!activeCaseId) setLastCaseId(readLastCaseId())
  }, [activeCaseId])
  const homeCaseId = activeCaseId ?? lastCaseId
  const homeHref = homeCaseId ? `/cases/${homeCaseId}/journey` : '/cases'

  const btn: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6B6457',
    padding: 0,
    flexShrink: 0,
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(env(safe-area-inset-top, 0px) + 48px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        paddingBlock: 0,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        background:
          'linear-gradient(180deg, rgba(245,239,232,.95) 0%, rgba(245,239,232,.92) 60%, rgba(245,239,232,0) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <Link
        href={homeHref}
        prefetch
        aria-label="여정"
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontWeight: 500,
          fontSize: 15,
          letterSpacing: '0.22em',
          color: '#9A9286',
          textTransform: 'uppercase',
          pointerEvents: 'auto',
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        PETMOVE
      </Link>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
          minWidth: 0,
        }}
      >
        <button aria-label="테마" title="테마" style={btn} type="button">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2v.5a2.5 2.5 0 0 1-2 2.5z" />
            <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="18" cy="11" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button aria-label="다크모드" title="다크모드" style={btn} type="button">
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        </button>
        {cases.length > 1 && (
          <>
            <span
              aria-hidden
              style={{
                width: 1,
                height: 18,
                background: 'rgba(42,38,32,.10)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <div
              className="pm-noscroll"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                overflowX: 'auto',
                paddingInline: 4,
                marginInline: -4,
                // overflow-x: auto 는 사양상 overflow-y 도 같이 auto 가 돼 ring 이 잘림.
                // block padding 으로 컨테이너 자체를 ring(±4.5px) 이 들어갈 만큼 키워줌.
                paddingBlock: 6,
              }}
            >
              {cases.map((c, i) => {
                const isActive = c.id === activeCaseId
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
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      padding: 0,
                      background: avatarGradient(c, i),
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: '#fff',
                      fontFamily: isEmoji
                        ? "-apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
                        : 'var(--pm-font-display)',
                      fontWeight: 600,
                      fontSize: isEmoji ? 13 : 10,
                      lineHeight: 1,
                      textDecoration: 'none',
                      opacity: isActive ? 1 : 0.42,
                      boxShadow: isActive
                        ? '0 0 0 1.5px #F5EFE8, 0 0 0 3px #735B3D, 0 1px 2px rgba(42,38,32,.10)'
                        : 'inset 0 1px 1px rgba(255,255,255,.25)',
                      transform: isActive ? 'scale(1)' : 'scale(0.9)',
                      transition: 'opacity .2s, transform .2s, box-shadow .2s',
                    }}
                  >
                    {avatarGlyph(c)}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
