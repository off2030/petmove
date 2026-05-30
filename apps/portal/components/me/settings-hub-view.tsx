'use client'

import Link from 'next/link'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { C, serif } from './settings-shared'

/**
 * 설정 탭 허브 (/me). 6개 메뉴 리스트.
 * 각 메뉴 클릭 → /me/{key} sub-page.
 * 데이터는 CaseDataProvider 에서, primary case = cases[0].
 */

const Chevron = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.ink3}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
)

interface MenuItem {
  href: string
  label: string
  subtitle?: string | null
}

function MenuRow({ item, last }: { item: MenuItem; last?: boolean }) {
  const sub = item.subtitle?.trim() || null
  return (
    <Link
      href={item.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '15px 0',
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ ...serif, fontSize: 17, color: C.ink, lineHeight: 1.2 }}>{item.label}</span>
        {sub && (
          <span
            style={{
              fontSize: 12,
              color: C.ink3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <Chevron />
    </Link>
  )
}

const TRIP_LABEL: Record<string, string> = {
  round: '왕복',
  one_way: '편도',
}

export function SettingsHubView() {
  const { cases } = useCases()
  const primary = cases[0] ?? null
  const data = (primary?.data ?? {}) as Record<string, unknown>

  const guardianSub = primary?.customer_name?.trim() || null
  const petSub = primary?.pet_name?.trim() || null
  const destination = primary?.destination?.trim() || null
  const tripType = typeof data.trip_type === 'string' ? data.trip_type : null
  const travelSub = [destination, tripType ? TRIP_LABEL[tripType] : null]
    .filter(Boolean)
    .join(' · ') || null

  const items: MenuItem[] = [
    { href: '/me/guardian', label: '보호자', subtitle: guardianSub },
    { href: '/me/animal', label: '동물', subtitle: petSub },
    { href: '/me/travel', label: '여행정보', subtitle: travelSub },
    { href: '/me/vet', label: '담당 동물병원', subtitle: '준비 중' },
    { href: '/me/agency', label: '담당 운송에이전시', subtitle: '준비 중' },
    { href: '/me/account', label: '계정', subtitle: null },
  ]

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 80,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 24px', color: C.ink }}>
          설정
        </h1>

        <div
          style={{
            background: C.surface,
            border: `.5px solid ${C.line}`,
            borderRadius: 18,
            padding: '2px 18px',
          }}
        >
          {items.map((it, i) => (
            <MenuRow key={it.href} item={it} last={i === items.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}
