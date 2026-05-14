'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import { useCases } from './case-data-provider'

/**
 * Portal 상단 chrome — portal-preview/app.jsx 의 ThemeControls 포팅.
 *
 * 좌측: PETMOVE 워드마크 (Fraunces serif, letterSpacing 0.22em — 브랜드 시그니처)
 * 우측: 팔레트 / 다크모드 토글 → 구분선 → 펫 아바타 스위처(케이스 ≥1건일 때).
 *   - 아바타 색은 case.id 해시로 3색 팔레트 cycle (같은 케이스는 항상 같은 색)
 *   - 활성 상태: 외곽 brown ring + scale 1, 비활성: opacity .42 + scale .9
 *   - 클릭 시 현재 탭(journey/docs/info) 유지하며 caseId 만 교체
 *
 * position: fixed top. safe-area-inset-top 보정 (iOS PWA 다이내믹 아일랜드).
 * height(=safe-area + 48) 만큼 본문 paddingTop 필요. (authed) layout 에서 처리.
 */

const PET_GRADIENTS = [
  'linear-gradient(135deg, #E5A776 0%, #C9824D 100%)', // 오렌지
  'linear-gradient(135deg, #4A4458 0%, #28252E 100%)', // 다크 퍼플
  'linear-gradient(135deg, #C9DBCB 0%, #97B69A 100%)', // 세이지
] as const

function caseIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/cases\/([^/]+)(?:\/|$)/)
  return m && m[1] !== 'page' ? m[1] : null
}

function currentTab(pathname: string): 'journey' | 'docs' | 'info' {
  if (pathname.includes('/docs')) return 'docs'
  if (pathname.includes('/info')) return 'info'
  return 'journey'
}

function petInitial(c: CaseRow): string {
  const name = c.pet_name ?? ''
  return name.slice(0, 1) || '·'
}

function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PET_GRADIENTS[h % PET_GRADIENTS.length]
}

export function TopBar() {
  const pathname = usePathname()
  const { cases } = useCases()
  const activeCaseId = caseIdFromPath(pathname)
  const tab = currentTab(pathname)

  const btn: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6B6457',
    padding: 0,
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
      }}
    >
      <div
        style={{
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontWeight: 500,
          fontSize: 12,
          letterSpacing: '0.22em',
          color: '#9A9286',
          textTransform: 'uppercase',
          pointerEvents: 'auto',
        }}
      >
        PETMOVE
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}
      >
        <button aria-label="테마" title="테마" style={btn} type="button">
          <svg
            width="15"
            height="15"
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
            width="14"
            height="14"
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
        {cases.length > 0 && (
          <>
            <span
              aria-hidden
              style={{
                width: 1,
                height: 16,
                background: 'rgba(42,38,32,.10)',
                display: 'inline-block',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {cases.map((c) => {
                const isActive = c.id === activeCaseId
                return (
                  <Link
                    key={c.id}
                    href={`/cases/${c.id}/${tab}`}
                    prefetch
                    aria-label={c.pet_name ?? '케이스'}
                    title={c.pet_name ?? '케이스'}
                    className="pm-pressable"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      padding: 0,
                      background: gradientFor(c.id),
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontFamily: "'Fraunces', 'Pretendard Variable', serif",
                      fontWeight: 600,
                      fontSize: 11,
                      textDecoration: 'none',
                      opacity: isActive ? 1 : 0.42,
                      boxShadow: isActive
                        ? '0 0 0 1.5px #F5EFE8, 0 0 0 3px #735B3D, 0 1px 2px rgba(42,38,32,.10)'
                        : 'inset 0 1px 1px rgba(255,255,255,.25)',
                      transform: isActive ? 'scale(1)' : 'scale(0.9)',
                      transition: 'opacity .2s, transform .2s, box-shadow .2s',
                    }}
                  >
                    {petInitial(c)}
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
