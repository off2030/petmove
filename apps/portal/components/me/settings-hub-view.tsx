'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import {
  buildProfileView,
  buildPetBlock,
  type GuardianBlock,
} from '@/lib/profile/catalog'
import { dDayLabel } from '@/lib/cases/info-form'
import { PetAvatarDisplay } from './pet-avatar-display'
import { C, serif, monoCap } from './settings-shared'

/**
 * 설정 탭 허브 (/me) — 카드 리스트.
 * 시각 톤: 옛 ProfileView 의 HeroCard / PartnerCard / AccountSection 그대로.
 *   - 보호자·동물 → Hero (padding 18, 아바타 52, 이름 20 serif + 영문 italic)
 *   - 여행·병원·에이전시 → Partner (mono-cap 헤더 + 본문 row, 아바타 44)
 *   - 계정 → 외부 mono-cap 라벨 + 카드 내 행(이메일)
 * 카드 자체가 Link → 탭하면 sub-page. 옛 톤에 chevron 은 없으므로 제거.
 */

const CARD_RADIUS = 18
const CARD_PADDING = 18
const HERO_AVATAR = 52
const PARTNER_AVATAR = 44

const num: CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 400,
}

// ── 아이콘 ────────────────────────────────────────────────────────────────

function MedicalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11H5a2 2 0 0 0-2 2v7h18v-7a2 2 0 0 0-2-2h-4M12 11V3M9 7h6" />
    </svg>
  )
}
function PlaneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  )
}
function RouteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
    </svg>
  )
}

// ── Hero 톤 (보호자·동물) ─────────────────────────────────────────────────

function HeroLinkCard({
  href,
  avatar,
  nameKo,
  nameEn,
  subtitle,
  subtitleMuted,
}: {
  href: string
  avatar: ReactNode
  nameKo: string | null
  nameEn: string | null
  subtitle: string
  subtitleMuted?: boolean
}) {
  return (
    <Link
      href={href}
      className="pm-pressable"
      style={{
        display: 'block',
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...serif, fontSize: 20, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              {nameKo ?? '이름 미설정'}
            </span>
            {nameEn && (
              <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>
                {nameEn}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: subtitleMuted ? C.ink3 : C.ink2,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
    </Link>
  )
}

function GuardianCard({ data, href }: { data: GuardianBlock; href: string }) {
  const avatar = (
    <div
      style={{
        width: HERO_AVATAR,
        height: HERO_AVATAR,
        borderRadius: '50%',
        flexShrink: 0,
        background: C.soft,
        color: C.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...num,
        fontSize: 20,
        fontWeight: 500,
      }}
    >
      {data.initials}
    </div>
  )
  return (
    <HeroLinkCard
      href={href}
      avatar={avatar}
      nameKo={data.name}
      nameEn={data.nameEn}
      subtitle={data.relation}
      subtitleMuted
    />
  )
}

function PetCard({ case_, index, href }: { case_: CaseRow; index: number; href: string }) {
  const pet = buildPetBlock(case_)
  const meta = [pet.breed, pet.ageLabel, pet.weight].filter(Boolean).join(' · ')
  return (
    <HeroLinkCard
      href={href}
      avatar={<PetAvatarDisplay case_={case_} index={index} size={HERO_AVATAR} />}
      nameKo={pet.name}
      nameEn={pet.nameEn}
      subtitle={meta || '아바타를 눌러 정보를 등록해보세요'}
      subtitleMuted={!meta}
    />
  )
}

// ── Partner 톤 (여행) ─────────────────────────────────────────────────────

const TRIP_LABEL: Record<string, string> = { round: '왕복', one_way: '편도' }

function TravelCard({ case_, href }: { case_: CaseRow; href: string }) {
  const data = (case_.data ?? {}) as Record<string, unknown>
  const tripType = typeof data.trip_type === 'string' ? data.trip_type : null
  const dest = case_.destination?.trim() || null
  const departure = case_.departure_date?.trim() || null

  const route = dest ? `한국 ${tripType === 'round' ? '⇄' : '→'} ${dest}` : null
  const subParts = [
    tripType ? TRIP_LABEL[tripType] : null,
    departure ? dDayLabel(departure) : null,
  ].filter(Boolean)
  const sub = subParts.join(' · ')

  return (
    <Link
      href={href}
      className="pm-pressable"
      style={{
        display: 'block',
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={monoCap}>여행정보</div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: PARTNER_AVATAR,
            height: PARTNER_AVATAR,
            borderRadius: '50%',
            flexShrink: 0,
            background: C.soft,
            color: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RouteIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              ...serif,
              fontSize: 17,
              color: route ? C.ink : C.ink3,
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {route ?? '여행지 미설정'}
          </div>
          {sub && (
            <div
              style={{
                fontSize: 12,
                color: C.ink3,
                marginTop: 3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sub}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Partner stub (병원·에이전시) ─────────────────────────────────────────

function PartnerStubCard({
  cap,
  placeholder,
  href,
}: {
  cap: string
  placeholder: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="pm-pressable"
      style={{
        display: 'block',
        padding: CARD_PADDING,
        borderRadius: CARD_RADIUS,
        background: C.surface,
        border: `.5px dashed ${C.line}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={monoCap}>{cap}</div>
      <div style={{ marginTop: 10, fontSize: 13, color: C.ink3, lineHeight: 1.55 }}>
        {placeholder}
      </div>
    </Link>
  )
}

// ── 계정 (외부 mono-cap + 카드 내 행 리스트) ─────────────────────────────

function AccountSection({ email, href }: { email: string | null; href: string }) {
  return (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>
        계정
      </div>
      <Link
        href={href}
        className="pm-pressable"
        style={{
          display: 'block',
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: CARD_RADIUS,
          padding: '4px 16px',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '13px 0',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: C.ink2 }}>이메일</span>
          <span
            style={{
              fontSize: 15,
              color: email ? C.ink : C.ink3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {email ?? '—'}
          </span>
        </div>
      </Link>
    </>
  )
}

// ── Hub ────────────────────────────────────────────────────────────────────

export function SettingsHubView() {
  const { cases, profile, userEmail } = useCases()
  const primary = cases[0] ?? null
  const view = buildProfileView({ userEmail, customerProfile: profile, primaryCase: primary })

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
          설정
        </h1>

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <GuardianCard data={view.guardian} href="/me/guardian" />
          {cases.map((c, i) => (
            <PetCard key={c.id} case_={c} index={i} href={`/me/animal/${c.id}`} />
          ))}
          {primary && <TravelCard case_={primary} href="/me/travel" />}
          <PartnerStubCard
            cap="동물병원"
            placeholder="담당 동물병원 정보가 등록되면 표시됩니다."
            href="/me/vet"
          />
          <PartnerStubCard
            cap="에이전시"
            placeholder="출국 운송을 맡은 에이전시 정보가 등록되면 표시됩니다."
            href="/me/agency"
          />
        </div>

        <AccountSection email={view.account.email} href="/me/account" />
      </div>
    </div>
  )
}
