'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCases } from './case-data-provider'
import { hasJourney } from '@/lib/cases/journey-filter'
import { readLastCaseId, readLastDest, writeLastCaseId, writeLastDest } from './last-case'

/**
 * 보호자 앱 하단 4탭 — case-aware.
 *
 * 현재 path 가 /cases/<id>/... 이면 그 id 를 보존하면서 다른 탭으로 전환.
 * /me/... · /services (case-외) 같은 화면에선 sessionStorage 의 마지막 caseId 로 복귀
 *   — swipe-tabs 와 동일한 키 공유. 이게 없으면 내 정보 탭에서 일정/서류 탭을
 *   누를 때마다 /cases (다중 케이스 선택 화면) 로 튕겨나가는 버그가 됨.
 * sessionStorage 도 비어 있으면 /cases 로 보냄 (1건이면 자동 redirect).
 * 서비스·내 정보 탭은 caseId 와 무관하게 항상 /services · /me (case-외 hub).
 * 앱 설정(계정·테마·약관 등)은 상단바 ⚙ → /settings.
 */

type Icon = 'luggage' | 'doc' | 'heartPlus' | 'user'
type Tab = { key: 'journey' | 'docs' | 'services' | 'me'; label: string; icon: Icon }

const TABS: Tab[] = [
  { key: 'journey', label: '준비', icon: 'luggage' },
  { key: 'docs', label: '서류', icon: 'doc' },
  // '맡기기' — 유료 대행·파트너·견적의 공통분모 = 위임. 준비(직접)와 의도 대비.
  { key: 'services', label: '맡기기', icon: 'heartPlus' },
  { key: 'me', label: '내 정보', icon: 'user' },
]

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

export function BottomNav() {
  const pathname = usePathname()
  const caseIdInPath = caseIdFromPath(pathname)
  const { cases } = useCases()
  const [lastCaseId, setLastCaseId] = useState<string | null>(null)
  // 다중 목적지 — 활성 목적지(?dest=)를 케이스별로 기억해 탭 전환 시 링크에 붙인다.
  // 안 붙이면 탭을 누를 때마다 기본(첫) 목적지로 리셋된다. { id, dest } 쌍으로 들고
  // 최종 caseId 와 일치할 때만 사용 (다른 케이스의 dest 가 새는 것 방지).
  const searchParams = useSearchParams()
  const destInUrl = searchParams.get('dest')
  const [lastDest, setLastDest] = useState<{ id: string; dest: string } | null>(null)

  useEffect(() => {
    if (caseIdInPath) {
      writeLastCaseId(caseIdInPath)
      setLastCaseId(caseIdInPath)
      if (destInUrl) {
        writeLastDest(caseIdInPath, destInUrl)
        setLastDest({ id: caseIdInPath, dest: destInUrl })
      } else {
        const d = readLastDest(caseIdInPath)
        setLastDest(d ? { id: caseIdInPath, dest: d } : null)
      }
    } else {
      const id = readLastCaseId()
      setLastCaseId(id)
      const d = id ? readLastDest(id) : null
      setLastDest(id && d ? { id, dest: d } : null)
    }
  }, [caseIdInPath, destInUrl])

  // 모바일 키보드가 올라오면 fixed nav 가 viewport bottom 에 붙어 input 위로 떠올라
  // 가린다. input/textarea 포커스 동안 nav 자체를 미렌더 (StickySaveBar 와 동일 패턴).
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    function isEditable(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      if (t.tagName === 'INPUT') {
        const type = (t as HTMLInputElement).type
        const nonEditable = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden', 'range', 'color']
        return !nonEditable.includes(type)
      }
      return t.tagName === 'TEXTAREA' || t.isContentEditable
    }
    function onFocusIn(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(true)
    }
    function onFocusOut(e: FocusEvent) {
      if (isEditable(e.target)) setKeyboardOpen(false)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  if (keyboardOpen) return null

  // 등록한 반려동물이 0마리면 하단 탭을 통째로 숨긴다 — 신규 사용자는 '시작하기'(환영)
  // 화면과 상단 ⚙(설정·로그아웃)만 보게 해, 등록 전엔 앱 본체(일정·서류·서비스·내 정보)
  // 로 들어가지 못하게 한다. 한 마리라도 등록되면(cases ≥ 1) 탭이 다시 나타난다.
  // (/me·/services 로 가는 유일한 통로가 이 탭바이고, /cases 환영 화면은 스와이프 비대상
  //  이라 이 한 줄로 진입로가 모두 닫힌다. 미리보기는 항상 케이스 1건이라 영향 없음.)
  if (cases.length === 0) return null

  // 일정·서류 탭 진입 케이스 = '여정(목적지) 있는 동물'만. 목적지 다 지운 동물은 제외 —
  // lastCaseId 가 여정 케이스가 아니면(삭제됐거나 목적지 0개) 첫 여정 케이스로 폴백한다.
  // (동물 상세에서 마지막 목적지를 지우면, 일정 탭이 자동으로 다른 여정 동물로 전환됨.)
  // 여정 케이스가 하나도 없으면 null → /cases 가 '준비 중인 여정 없음' 빈 상태를 보여준다.
  const journeyCases = cases.filter(hasJourney)
  const lastIdValid = lastCaseId && journeyCases.some((c) => c.id === lastCaseId)
  const fallbackId = lastIdValid ? lastCaseId : journeyCases[0]?.id ?? null
  const caseId = caseIdInPath ?? fallbackId

  // 풀와이드 플랫 바 — 상단바와 같은 문법(가장자리 크롬 = 캔버스의 연장). 불투명 배경
  // + 상단 헤어라인만. 활성 탭 표시는 배경 알약 없이 아이콘·라벨 색 전환 하나로.
  return (
    <nav
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'flex',
        padding: '6px 10px calc(env(safe-area-inset-bottom, 0px) + 6px)',
        background: 'rgb(var(--pm-bg-rgb))',
        borderTop: '.5px solid var(--pm-line)',
      }}
    >
      {TABS.map((t) => {
        const href = hrefFor(t.key, caseId, lastDest?.id === caseId ? lastDest.dest : null)
        const active = isActive(t.key, pathname)
        return (
          <Link
            key={t.key}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 6px',
              flex: 1,
              textDecoration: 'none',
              color: active ? 'var(--pm-accent-ink)' : 'var(--pm-ink-3)',
              transition: 'color 180ms ease',
            }}
          >
            <NavIcon name={t.icon} stroke={active ? 2 : 1.7} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function hrefFor(key: Tab['key'], caseId: string | null, dest: string | null): string {
  if (key === 'me') return '/me'
  if (key === 'services') return '/services'
  if (!caseId) return '/cases'
  return `/cases/${caseId}/${key}${dest ? `?dest=${encodeURIComponent(dest)}` : ''}`
}

function isActive(key: Tab['key'], pathname: string): boolean {
  if (key === 'me') return pathname === '/me' || pathname.startsWith('/me/')
  if (key === 'services') return pathname === '/services' || pathname.startsWith('/services/')
  return new RegExp(`^/cases/[^/]+/${key}(?:/|$)`).test(pathname)
}

function NavIcon({ name, stroke = 1.7 }: { name: Icon; stroke?: number }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  // 트래블월렛·오늘의집 문법 — 도톰한 라운드 스트로크, 큰 코너 라운드, 최소 디테일.
  switch (name) {
    case 'luggage':
      // 캐리어 — 몸통(rx 3) + 손잡이 + 세로 스트랩 2줄. '준비' 탭 = 떠날 채비.
      return (
        <svg {...p}>
          <rect x="4" y="7" width="16" height="13" rx="3" />
          <path d="M9 7V5.6A2.6 2.6 0 0 1 11.6 3h.8A2.6 2.6 0 0 1 15 5.6V7" />
          <path d="M8.8 11v5M15.2 11v5" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...p}>
          <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
          <path d="M14 3v3.5A1.5 1.5 0 0 0 15.5 8H19" />
          <path d="M9 14.5h6" />
        </svg>
      )
    case 'heartPlus':
      // 하트+플러스 — www 시안(로잔동물의료센터 카드, "전문가에게 안심하고 맡기세요")과
      // 같은 심벌. 접점(웹·앱)에서 반복해 '펫무브 전문가 케어' 마크로 굳힌다.
      return (
        <svg {...p}>
          <path d="M12 19.8 5.2 13a4.9 4.9 0 1 1 6.8-7 4.9 4.9 0 0 1 8.6 4.3" />
          <path d="M15.5 18.5h5.5" />
          <path d="M18.25 15.75v5.5" />
        </svg>
      )
    case 'user':
      // 보호자 + 엎드린 동물 — 스케치 기반: 어깨 옆으로 이어지는 물결 곡선 하나가
      // 작은 머리 봉우리 → 목 골 → 등 곡선. 실루엣이 아니라 '곁에 엎드린 존재'의 선.
      return (
        <svg {...p}>
          <circle cx="9" cy="7" r="3.6" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M9.5 20c0-1.7 1-2.9 2.4-2.9 1.1 0 1.7 1 2.5 1.2.8.2 1-.9 2.6-.9 2.2 0 3.5 1.4 3.5 2.6" />
        </svg>
      )
  }
}
