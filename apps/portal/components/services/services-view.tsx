'use client'

import type { ReactNode } from 'react'
import { C, serif } from '@/components/me/settings-shared'

/**
 * 서비스 탭 (/services) — 펫무브 유료 상품 안내.
 * 두 갈래: 오프라인(방문 올케어, 전체 대행) / 온라인(가이드 & 점검, 직접+도움).
 *
 * v1 은 안내(소개)만 — 상담 신청·결제 액션은 결제 모델 확정 전까지 미연결한다.
 * (결제 모델 미정: docs/portal-plan.md §결제 / memory project_portal_paywall)
 *
 * 톤은 /me 허브와 동일 Calm 컨벤션(C / serif / surface 카드)을 그대로 재사용 —
 * 두 갈래는 우열이 아니라 '맡길래 / 직접 할래' 의 선택지라 동등하게 배치한다.
 * 강조색만 분리: 오프라인=amber(브랜드·프리미엄) / 온라인=sage(차분·디지털).
 */

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

function ServiceCard({
  accent,
  icon,
  title,
  tag,
  desc,
  included,
}: {
  accent: Accent
  icon: ReactNode
  title: string
  tag: string
  desc: string
  included: string[]
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        padding: 18,
      }}
    >
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
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>{title}</div>
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
            {tag}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, margin: '14px 0 0' }}>{desc}</p>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {included.map((item) => (
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

export function ServicesView() {
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

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ServiceCard
            accent={AMBER}
            icon={clinicIcon}
            title="방문 올케어"
            tag="오프라인 · 전체 대행"
            desc="병원에 한 번 오시면 검역 준비를 처음부터 끝까지 대신 진행해 드려요."
            included={[
              '검역·백신 일정 관리',
              '서류 발급 대행',
              '수입허가증 신청',
              '출국일 공항 동행',
            ]}
          />
          <ServiceCard
            accent={SAGE}
            icon={monitorIcon}
            title="가이드 & 점검"
            tag="온라인 · 직접 + 도움"
            desc="직접 준비하시되, 단계별 가이드와 서류 점검·신청을 곁에서 도와드려요."
            included={[
              '단계별 준비 가이드',
              '서류 검토·점검',
              '수입허가증 신청 대행',
            ]}
          />
        </div>

        <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6, margin: '20px 4px 0' }}>
          상담 신청과 가격 안내는 곧 추가될 예정이에요.
        </p>
      </div>
    </div>
  )
}
