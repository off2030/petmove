'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId } from './last-case'
import { LogoMark } from './logo-mark'
import { isSurfacePage } from './surface-page'
import { pushTab } from './tab-nav'

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
  const router = useRouter()
  const activeCaseId = caseIdFromPath(pathname)
  // 흰 배경 화면(설정·내 정보 하위)에선 바도 흰색 — 회색 띠가 남지 않게.
  const onSurfacePage = isSurfacePage(pathname)

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
        paddingTop: 'var(--pm-top-inset)',
        height: 'calc(var(--pm-top-inset) + 48px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        // ⚠️ padding 단축/paddingBlock 을 쓰면 위의 paddingTop(var(--pm-top-inset))
        // 이 덮여 0 이 된다 — 네 방향을 명시해 상단 안전영역 여백을 보존한다.
        paddingRight: 22,
        paddingLeft: 22,
        paddingBottom: 0,
        boxSizing: 'border-box',
        pointerEvents: 'none',
        // 직선 풀-와이드 바 — 라운드·그라데이션 없이 균일한 불투명 배경.
        // (흰 페이지 위 반투명 흰 바라 라운드가 안 보였음 — 밝고 심플 리디자인에서 정리.)
        // 반투명+블러 제거 — 불투명 배경이라 밑으로 스크롤되는 내용은 그대로 가려진다.
        background: onSurfacePage ? 'rgb(var(--pm-surface-rgb))' : 'rgb(var(--pm-bg-rgb))',
      }}
    >
      {onboarding ? (
        // 환영 화면 — 로고 자리는 비우되, space-between 으로 ⚙ 가 우측에 유지되도록 placeholder.
        <span aria-hidden />
      ) : (
        // 워드마크 = 준비 탭 복귀 — TabHost pane 이라 pushTab 으로 즉시 전환.
        <a
          href={homeHref}
          onClick={(e) => {
            e.preventDefault()
            if (homeHref !== window.location.pathname + window.location.search)
              pushTab(router, homeHref)
          }}
          aria-label="준비"
          style={{
            // 별도 웹폰트 없이 각 운영체제의 표준 UI sans-serif로 표시.
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: '0.025em',
            // 워드마크 확정(2026-07-11): 한글 '펫무브' + 잉크색. 색은 심벌(블루) 하나로
            // 충분 — 원색 블루는 대비 부족(2.2:1), 짙은 네이비(#123B5C) 투톤안은 보류.
            // 영문(PETMOVE)안 폐기 — 로마자는 여권식 표기(이름 병기 등) 전용 레이어.
            color: 'var(--pm-ink)',
            pointerEvents: 'auto',
            flexShrink: 0,
            textDecoration: 'none',
            lineHeight: 1,
          }}
        >
          <LogoMark size={22} />
          {/* 광학 보정 — 로고 타일에 아래 그림자가 생기며 시각 무게중심이 내려가
              (2026-07-11), 이전의 1px 올림을 되돌려 0 으로. */}
          <span style={{ position: 'relative', top: 0 }}>펫무브</span>
        </a>
      )}
      {/* 설정 ⚙ 는 하단 '더보기' 탭으로 이관 — 환영(온보딩) 화면에서만 유지. 등록 전엔
          하단 탭이 통째로 숨어 이 ⚙ 가 설정·로그아웃의 유일한 비상구이기 때문. */}
      {onboarding ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
          minWidth: 0,
        }}
      >
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
      ) : (
        <span aria-hidden />
      )}
    </div>
  )
}
