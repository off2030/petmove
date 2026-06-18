'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId } from './last-case'
import { LogoMark } from './logo-mark'

/**
 * Portal 상단 chrome — portal-preview/app.jsx 의 ThemeControls 포팅.
 *
 * 좌측: PETMOVE 워드마크
 * 우측: 설정(톱니).
 * 동물 전환 아바타는 헤더(timeline/docs) 우측으로 옮김 — OtherCasesRow 참조.
 *
 * position: fixed top. safe-area-inset-top 보정 (iOS PWA 다이내믹 아일랜드).
 * height(=safe-area + 48) 만큼 본문 paddingTop 필요. (authed) layout 에서 처리.
 */

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

export function TopBar() {
  const pathname = usePathname()
  const activeCaseId = caseIdFromPath(pathname)

  // PETMOVE 워드마크는 "현재 일정"으로 — bottom-nav 와 동일한 case 결정 패턴.
  // path 에 caseId 가 있으면 그걸, 아니면 sessionStorage 의 마지막 case, 둘 다 없으면 /cases.
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)
  useEffect(() => {
    if (!activeCaseId) setLastCaseId(readLastCaseId())
  }, [activeCaseId])
  // 워드마크는 '여정(목적지) 있는 동물'의 일정으로 — 목적지 0개면 첫 여정 동물, 없으면 /cases.
  const { cases } = useCases()
  // 등록한 반려동물이 0마리면 첫 진입(환영) 화면 — 좌측 PETMOVE 워드마크는 숨기고(히어로가
  // 이미 브랜드를 말함) 우측 ⚙(설정·로그아웃 비상구)만 남긴다. 한 마리라도 등록되면 다시 노출.
  const onboarding = cases.length === 0
  const journeyCases = cases.filter(hasJourney)
  const candidate = activeCaseId ?? lastCaseId
  const homeCaseId =
    candidate && journeyCases.some((c) => c.id === candidate)
      ? candidate
      : journeyCases[0]?.id ?? null
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
        // 하단 바 카드 모양(둥근 22, 알파 0.50)과 어울리도록 — 상단도 하단 모서리만
        // 살짝 둥글리고, 그라데이션 끝 알파를 0 → 0.50 으로 두어 라운드가 보이게.
        // 풀-와이드는 유지 — 카드로 갇히면 답답함.
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
        background:
          'linear-gradient(180deg, rgb(var(--pm-bg-rgb) / .85) 0%, rgb(var(--pm-bg-rgb) / .70) 60%, rgb(var(--pm-bg-rgb) / .50) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {onboarding ? (
        // 환영 화면 — 로고 자리는 비우되, space-between 으로 ⚙ 가 우측에 유지되도록 placeholder.
        <span aria-hidden />
      ) : (
        <Link
          href={homeHref}
          prefetch
          aria-label="일정"
          style={{
            // 별도 웹폰트 없이 각 운영체제의 표준 UI sans-serif로 표시.
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
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
          <LogoMark size={22} />
          <span>PETMOVE</span>
        </Link>
      )}
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
          {/* Heroicons cog-6-tooth (outline) — 8-tooth lucide 보다 톱니 수가 적고 모서리가 둥글어 Calm 톤에 부드럽게 녹음. */}
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z" />
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
