'use client'

import { useState, type ReactNode } from 'react'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { C, serif, monoCap } from '@/components/me/settings-shared'

/**
 * 서비스 탭 (/services) — 펫무브 유료 상품 안내. 목적지 인식형.
 *
 * 서비스 내용·비용은 목적지에 따라 달라진다. 선택지 = 펫무브가 서비스를 제공하는
 * '서비스 제공 국가' 큐레이션 목록(OFFERED_DESTINATIONS). 기본 선택은 등록 시 신청한
 * 목적지가 그 목록에 있으면 그것, 없으면 목록 첫 번째. 칩으로 전환 가능.
 *  - 큐레이션 목록은 여정 카드 구성이 끝난 목적지부터 추가(2026-06-12 일본·태국·필리핀 완료 → 시드).
 *    새 나라 서비스가 준비되면 OFFERED_DESTINATIONS 에 추가. (전체 201개국 나열 X.)
 *
 * 두 갈래: 오프라인(방문 올케어, 전체 대행) / 온라인(가이드 & 점검, 직접+도움).
 * v1 은 안내(소개)만 — 상담 신청·결제 액션은 결제 모델 확정 전까지 미연결.
 * (결제 모델 미정: docs/portal-plan.md §결제 / memory project_portal_paywall)
 *
 * 목적지별 내용 분기는 차차 — 지금은 모든 목적지가 같은 generic 안내를 본다. 추가 시
 * 아래 buildOffer(dest) 를 목적지별 데이터로 분기하면 카드가 목적지마다 달라진다.
 */

/**
 * 서비스 제공 국가 — 펫무브가 유료 서비스를 제공하는 목적지(=선택지).
 * 여정 카드 구성이 끝난 목적지부터 추가. 새 나라 준비되면 여기에 push.
 */
const OFFERED_DESTINATIONS: string[] = ['일본', '태국', '필리핀']

type Accent = { stroke: string; chipBg: string }

const AMBER: Accent = { stroke: C.accent, chipBg: C.soft }
const SAGE: Accent = {
  stroke: C.sage,
  chipBg: 'color-mix(in srgb, var(--pm-sage) 14%, transparent)',
}

const clinicIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 21V9l8-5 8 5v12" />
    <path d="M4 21h16" />
    <path d="M12 10v4M10 12h4" />
    <path d="M9.5 21v-3.5h5V21" />
  </svg>
)

const monitorIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
)

interface Offer {
  accent: Accent
  icon: ReactNode
  title: string
  tag: string
  desc: string
  included: string[]
}

/**
 * 한 목적지의 두 서비스 카드. 지금은 dest 와 무관하게 동일 generic — 목적지별 내용·비용은
 * 차차 여기서 분기한다(예: 수입허가증 필요 없는 목적지면 항목 제외, 비용 표기 등).
 */
function buildOffers(_dest: string | null): Offer[] {
  return [
    {
      accent: AMBER,
      icon: clinicIcon,
      title: '방문 올케어',
      tag: '오프라인 · 전체 대행',
      desc: '병원에 한 번 오시면 검역 준비를 처음부터 끝까지 대신 진행해 드려요.',
      included: ['검역·백신 일정 관리', '서류 발급 대행', '수입허가증 신청', '출국일 공항 동행'],
    },
    {
      accent: SAGE,
      icon: monitorIcon,
      title: '가이드 & 점검',
      tag: '온라인 · 직접 + 도움',
      desc: '직접 준비하시되, 단계별 가이드와 서류 점검·신청을 곁에서 도와드려요.',
      included: ['단계별 준비 가이드', '서류 검토·점검', '수입허가증 신청 대행'],
    },
  ]
}

/** 내 케이스들의 목적지 union — 등록 순서 보존, 중복 제거. */
function destinationsFromCases(cases: CaseRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of cases) {
    for (const tok of (c.destination ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
      if (!seen.has(tok)) {
        seen.add(tok)
        out.push(tok)
      }
    }
  }
  return out
}

function ServiceCard({ offer }: { offer: Offer }) {
  const { accent } = offer
  return (
    <div style={{ borderRadius: 18, background: C.surface, border: `.5px solid ${C.line}`, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            flexShrink: 0,
            background: accent.chipBg,
            color: accent.stroke,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {offer.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>{offer.title}</div>
          <span
            style={{
              display: 'inline-block',
              marginTop: 6,
              fontSize: 11,
              padding: '2px 9px',
              borderRadius: 999,
              background: accent.chipBg,
              color: accent.stroke,
              fontWeight: 500,
            }}
          >
            {offer.tag}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, margin: '14px 0 0' }}>{offer.desc}</p>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {offer.included.map((item) => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accent.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span style={{ fontSize: 12.5, color: C.ink2 }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 목적지 선택 칩 — 내 케이스 목적지들. 1개면 정적 표시(전환 불필요), 0개면 미렌더. */
function DestinationChips({
  destinations,
  selected,
  onSelect,
}: {
  destinations: string[]
  selected: string | null
  onSelect: (d: string) => void
}) {
  if (destinations.length === 0) return null
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...monoCap, marginBottom: 10, padding: '0 4px' }}>목적지</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {destinations.map((d) => {
          const on = d === selected
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'inherit',
                border: `.5px solid ${on ? C.accent : C.line}`,
                background: on ? C.soft : C.surface,
                color: on ? C.accent : C.ink2,
                cursor: 'pointer',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ServicesView() {
  const { cases } = useCases()
  // 기본 = 등록 시 신청한 목적지가 서비스 제공 목록에 있으면 그것, 없으면 목록 첫 번째(일본).
  const registered = destinationsFromCases(cases)
  const defaultDest = registered.find((d) => OFFERED_DESTINATIONS.includes(d)) ?? OFFERED_DESTINATIONS[0]
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked && OFFERED_DESTINATIONS.includes(picked) ? picked : defaultDest

  const offers = buildOffers(selected)

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
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>
          서비스
        </h1>
        <p style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.6, margin: '10px 0 0' }}>
          출국 준비를 펫무브가 함께할게요. 맡기실지, 직접 하며 도움받으실지 골라보세요.
        </p>

        <DestinationChips destinations={OFFERED_DESTINATIONS} selected={selected} onSelect={setPicked} />

        {selected && (
          <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6, margin: '12px 4px 0' }}>
            {selected} 기준으로 안내해 드려요.
          </p>
        )}

        <div style={{ marginTop: selected ? 18 : 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {offers.map((o) => (
            <ServiceCard key={o.title} offer={o} />
          ))}
        </div>

        <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6, margin: '20px 4px 0' }}>
          상담 신청과 가격 안내는 곧 추가될 예정이에요.
        </p>
      </div>
    </div>
  )
}
