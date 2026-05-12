'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'

/**
 * 케이스 스위처 — case layout 상단 고정.
 *
 * - 케이스 1건: 현재 펫 이름만 표시 (스위처 노출 안 함, 단순 헤더).
 * - 케이스 2건+: 가로 스크롤 칩. 현재 선택 케이스는 어둡게, 나머지는 옅게.
 *   클릭 시 같은 탭(journey/docs/info) 유지하면서 caseId 만 교체.
 *
 * 디자인은 미니멀 임시본 — portal-preview 시안 확정 후 톤·간격·타이포 정식화.
 */

type Props = {
  caseId: string
  cases: CaseRow[]
  current: CaseRow
}

function currentTab(pathname: string): 'journey' | 'docs' | 'info' {
  if (pathname.includes('/docs')) return 'docs'
  if (pathname.includes('/info')) return 'info'
  return 'journey'
}

function petName(c: CaseRow): string {
  return c.pet_name ?? '이름 미정'
}

export function CaseSwitcher({ caseId, cases, current }: Props) {
  const pathname = usePathname()
  const tab = currentTab(pathname)

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
