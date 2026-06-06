'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/lib/actions/profile'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { C, EditPageShell, SectionCard } from '@/components/me/settings-shared'
import { ThemeSwitcher } from './theme-switcher'

const DELETION_GRACE_DAYS = 7
const MS_PER_DAY = 24 * 3600 * 1000

/**
 * 앱 설정 (/settings) — 상단바 ⚙ 진입.
 * 등록 데이터(보호자·반려동물·여행 등)는 /me(내 정보), 여기는 앱 환경/계정/법적 항목.
 *   알림 · 화면(테마) · 약관·정책 · 지원 · 앱 정보 · 로그아웃 · 계정 삭제.
 * 톤: settings-shared 의 EditPageShell + SectionCard 재사용 (내 정보 탭과 동일).
 *
 * 옛 `/me/account` 페이지(이메일·알림·로그아웃 3 row) 는 폐기 — 이메일은 보호자 카드에
 * 이미 있고, 알림·로그아웃은 여기 톱레벨로 끌어올렸다. 계정 삭제 자리는 마련(준비 중).
 */

const ROW_PAD = '13px 0'
const SUPPORT_EMAIL = 'petmove@naver.com'

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

/** 외부 링크(mailto 등) 행 — 라벨 좌, 주소(또는 값) + 쉐브론 우. 주소를 그대로 노출해 사용자가
 *  어디로 이동하는지 인지할 수 있게 한다. */
function ExtRow({
  href,
  label,
  value,
  last,
}: {
  href: string
  label: string
  value?: string
  last?: boolean
}) {
  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {value && (
        <span
          style={{
            fontSize: 13,
            color: C.ink3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}
        >
          {value}
        </span>
      )}
      {chevron}
    </span>
  )
  return (
    <a href={href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <Row label={label} right={right} last={last} />
    </a>
  )
}

/** 값 표시 전용 행 (이동 없음). placeholder 톤(ink3) 또는 본문 톤(ink) 선택. */
function ValueRow({
  label,
  value,
  muted = true,
  last,
}: {
  label: string
  value: string
  /** 값을 placeholder 톤(ink3)으로 — '준비 중' 같은 미구현 표시용. 기본 true. */
  muted?: boolean
  last?: boolean
}) {
  return (
    <Row
      label={label}
      right={<span style={{ fontSize: 15, color: muted ? C.ink3 : C.ink2 }}>{value}</span>}
      last={last}
    />
  )
}

export function SettingsView() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA
  const { profile } = useCases()
  const scheduledAt = profile?.deletion_scheduled_at ?? null
  const daysLeft = scheduledAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(scheduledAt).getTime() + DELETION_GRACE_DAYS * MS_PER_DAY - Date.now()) /
            MS_PER_DAY,
        ),
      )
    : null

  return (
    <EditPageShell title="설정" backHref="/me" backLabel="내 정보">
      <SectionCard label="알림" marginTop={8}>
        <ValueRow label="푸시 알림" value="준비 중" last />
      </SectionCard>

      <SectionCard label="화면">
        <div style={{ padding: '14px 0' }}>
          <ThemeSwitcher />
        </div>
      </SectionCard>

      <SectionCard label="약관·정책">
        <LinkRow href="/terms" label="이용약관" />
        <LinkRow href="/privacy" label="개인정보 처리방침" last />
      </SectionCard>

      <SectionCard label="지원">
        <ExtRow href={`mailto:${SUPPORT_EMAIL}`} label="이메일" value={SUPPORT_EMAIL} last />
      </SectionCard>

      <SectionCard label="앱 정보">
        <Row
          label="버전"
          right={
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 15, color: C.ink2 }}>{version ? `v${version}` : '—'}</span>
              {gitSha && (
                <span style={{ fontSize: 11, color: C.ink3, fontVariantNumeric: 'tabular-nums' }}>
                  {gitSha}
                </span>
              )}
            </span>
          }
          last
        />
      </SectionCard>

      {/* 로그아웃 — 단독 카드. form action 직접 호출. */}
      <SectionCard>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: ROW_PAD,
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13, color: C.ink2 }}>로그아웃</span>
            {chevron}
          </button>
        </form>
      </SectionCard>

      {/* 계정 삭제 — 단독 카드. 유예 중이면 'D-N 일 후 삭제 예정' 부제 노출. */}
      <SectionCard>
        <Link
          href="/settings/account-delete"
          prefetch
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <Row
            label="계정 삭제"
            right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {daysLeft !== null && (
                  <span style={{ fontSize: 13, color: C.warn }}>
                    {daysLeft > 0 ? `${daysLeft}일 후 삭제 예정` : '오늘 삭제 예정'}
                  </span>
                )}
                {chevron}
              </span>
            }
            last
          />
        </Link>
      </SectionCard>
    </EditPageShell>
  )
}
