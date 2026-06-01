'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, EditPageShell, SectionCard } from '@/components/me/settings-shared'
import { ThemeSwitcher } from './theme-switcher'

/**
 * 앱 설정 허브 (/settings) — 상단바 ⚙ 진입.
 * 등록 데이터(보호자·반려동물·여행 등)는 /me(내 정보), 여기는 앱 환경/계정/법적 항목.
 *   화면(테마) · 계정 · 약관·정책 · 지원 · 앱 정보.
 * 톤: settings-shared 의 EditPageShell + SectionCard 재사용 (내 정보 탭과 동일).
 *
 * 테마 row 는 Phase 1 에선 '준비 중' — 실제 3단(시스템/라이트/다크) 스위처는 다크모드 도입 시 연결.
 */

const ROW_PAD = '13px 0'

/** label 좌 + 우측 슬롯(값/쉐브론). 마지막이 아니면 하단 hairline. */
function Row({
  label,
  right,
  last,
}: {
  label: string
  right: ReactNode
  last?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: ROW_PAD,
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        gap: 12,
      }}
    >
      <span style={{ fontSize: 13, color: C.ink2 }}>{label}</span>
      {right}
    </div>
  )
}

const chevron = <span style={{ fontSize: 15, color: C.ink3 }}>›</span>

/** 내부 라우트 이동 행. */
function LinkRow({ href, label, last }: { href: string; label: string; last?: boolean }) {
  return (
    <Link
      href={href}
      prefetch
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Row label={label} right={chevron} last={last} />
    </Link>
  )
}

/** 외부 링크(mailto 등) 행. */
function ExtRow({ href, label, last }: { href: string; label: string; last?: boolean }) {
  return (
    <a href={href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <Row label={label} right={chevron} last={last} />
    </a>
  )
}

/** 값 표시 전용 행 (이동 없음). */
function ValueRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <Row
      label={label}
      right={<span style={{ fontSize: 15, color: C.ink3 }}>{value}</span>}
      last={last}
    />
  )
}

export function SettingsView() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION

  return (
    <EditPageShell title="설정" backHref="/me" backLabel="내 정보">
      <SectionCard label="화면" marginTop={8}>
        <div style={{ padding: '14px 0' }}>
          <ThemeSwitcher />
        </div>
      </SectionCard>

      <SectionCard label="계정">
        <LinkRow href="/me/account" label="계정 관리" last />
      </SectionCard>

      <SectionCard label="약관·정책">
        <LinkRow href="/terms" label="이용약관" />
        <LinkRow href="/privacy" label="개인정보 처리방침" last />
      </SectionCard>

      <SectionCard label="지원">
        <ExtRow href="mailto:support@petmove.co.kr" label="문의·지원" last />
      </SectionCard>

      <SectionCard label="앱 정보">
        <ValueRow label="버전" value={version ? `v${version}` : '—'} last />
      </SectionCard>
    </EditPageShell>
  )
}
