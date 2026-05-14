'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import { useCases } from './case-data-provider'

/**
 * 케이스 스위처 — 케이스 페이지 상단 고정.
 *
 * - 케이스 1건: 현재 펫 이름만 표시 (스위처 미노출, 단순 헤더).
 * - 케이스 2건+: 가로 스크롤 칩. 현재 선택 케이스는 어둡게, 나머지는 옅게.
 *   클릭 시 같은 탭(journey/docs/info) 유지하며 caseId 만 교체.
 *
 * 데이터·현재 caseId 는 props 가 아닌 Context + pathname 에서 — 케이스 전환 시 layout RSC 가
 * 비어 있어도 client 가 즉시 처리.
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

function petName(c: CaseRow): string {
  return c.pet_name ?? '이름 미정'
}

export function CaseSwitcher() {
  const pathname = usePathname()
  const { cases } = useCases()
  const caseId = caseIdFromPath(pathname)
  const tab = currentTab(pathname)
  const current = caseId ? cases.find((c) => c.id === caseId) : null

  // /cases/[id] 라우트가 아니면 스위처 숨김 (방어적; layout 안에서 호출되므로 정상 시엔 doesn't happen)
  if (!current) return null

  if (cases.length <= 1) {
    return (
      <div
        style={{
          padding: '20px 20px 4px',
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: '#2A2620',
        }}
      >
        {petName(current)}
      </div>
    )
  }

  return (
    <div
      data-no-swipe="true"
      style={{
        padding: '14px 12px 6px',
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {cases.map((c) => {
        const active = c.id === caseId
        return (
          <Link
            key={c.id}
            href={`/cases/${c.id}/${tab}`}
            prefetch
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              letterSpacing: '-0.005em',
              textDecoration: 'none',
              background: active ? '#2A2620' : 'rgba(0,0,0,0.04)',
              color: active ? '#FBF7F1' : '#6B6457',
            }}
          >
            {petName(c)}
          </Link>
        )
      })}
    </div>
  )
}
