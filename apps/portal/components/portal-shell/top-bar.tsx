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

  // PETMOVE 워드마크는 "현재 일정"으로 — bottom-nav 와 동일한 case 결정 패턴.
  // path 에 caseId 가 있으면 그걸, 아니면 sessionStorage 의 마지막 case, 둘 다 없으면 /cases.
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)
  useEffect(() => {
    if (!activeCaseId) setLastCaseId(readLastCaseId())
  }, [activeCaseId])
  const homeCaseId = activeCaseId ?? lastCaseId
  const homeHref = homeCaseId ? `/cases/${homeCaseId}/journey` : '/cases'

  const btn: React.CSSProperties = {
    // iOS HIG minimum tap target 44pt 근접 — 시각 균형 위해 40 으로.
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--pm-ink-2)',
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
          'linear-gradient(180deg, rgb(var(--pm-bg-rgb) / .95) 0%, rgb(var(--pm-bg-rgb) / .92) 60%, rgb(var(--pm-bg-rgb) / 0) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <Link
        href={homeHref}
        prefetch
        aria-label="일정"
        style={{
          // 펫무브워크 상단 "PETMOVE Work" 와 동일한 워드마크 스타일.
          // Alonzo ExtraLight + faux bold(700) + tight tracking. globals.css 의 --pm-font-mark 토큰.
          fontFamily: 'var(--pm-font-mark)',
          fontWeight: 700,
          fontSize: 17,
          letterSpacing: '0.025em',
          color: 'var(--pm-ink-3)',
          pointerEvents: 'auto',
          flexShrink: 0,
          textDecoration: 'none',
          lineHeight: 1,
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
        {/* 설정 진입 — 계정·테마·약관·문의 등 앱 설정은 /settings 로. 동물전환은 그대로 우측에 유지. */}
        <Link href="/settings" prefetch aria-label="설정" title="설정" style={btn}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        {cases.length > 1 && (
          <>
            <span
              aria-hidden
              style={{
                width: 1,
                height: 18,
                background: 'var(--pm-line)',
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
                      width: 28,
                      height: 28,
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}
