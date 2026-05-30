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
 * 각 카드 = 아바타/아이콘 + 이름/요약 + 우측 chevron. 탭 → 상세 sub-page.
 * 시각 패턴: 옛 ProfileView 의 HeroCard / PartnerCard 그대로, 카드 자체를 Link 로 감싸 클릭 가능.
 */

// ── 공통 스타일 ─────────────────────────────────────────────────────────────

const CARD_PADDING = 18
const CIRCLE_SIZE = 52
const PARTNER_ICON_SIZE = 44

function cardLinkStyle(dashed = false): CSSProperties {
  return {
    display: 'block',
    padding: CARD_PADDING,
    borderRadius: 18,
    background: C.surface,
    border: dashed ? `.5px dashed ${C.line}` : `.5px solid ${C.line}`,
    textDecoration: 'none',
    color: 'inherit',
  }
}
function cardRowStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 14 }
}
function infoColStyle(): CSSProperties {
  return { flex: 1, minWidth: 0 }
}
function nameRowStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
}
function initialsCircleStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    background: C.soft,
    color: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 20,
    fontWeight: 500,
  }
}
function iconCircleStyle(size = PARTNER_ICON_SIZE): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    background: C.soft,
    color: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

function Chevron() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.ink3}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

// ── 아이콘 (partner / account) ─────────────────────────────────────────────

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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
    </svg>
  )
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  )
}

// ── 카드들 ─────────────────────────────────────────────────────────────────

function PrimaryNameCard({
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
    <Link href={href} style={cardLinkStyle()} className="pm-pressable">
      <div style={cardRowStyle()}>
        {avatar}
        <div style={infoColStyle()}>
          <div style={nameRowStyle()}>
            <span style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>
              {nameKo ?? '—'}
            </span>
            {nameEn && (
              <span
                style={{
                  ...serif,
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: C.ink3,
                  fontWeight: 400,
                }}
              >
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
        <Chevron />
      </div>
    </Link>
  )
}

function GuardianCard({ data, href }: { data: GuardianBlock; href: string }) {
  return (
    <PrimaryNameCard
      href={href}
      avatar={<div style={initialsCircleStyle(CIRCLE_SIZE)}>{data.initials}</div>}
      nameKo={data.name}
      nameEn={data.nameEn}
      subtitle={data.relation}
      subtitleMuted
    />
  )
}

function PetCard({ case_, href }: { case_: CaseRow; href: string }) {
  const pet = buildPetBlock(case_)
  const meta = [pet.breed, pet.ageLabel, pet.weight].filter(Boolean).join(' · ')
  return (
    <PrimaryNameCard
      href={href}
      avatar={<PetAvatarDisplay case_={case_} size={CIRCLE_SIZE} />}
      nameKo={pet.name}
      nameEn={pet.nameEn}
      subtitle={meta || '아바타를 눌러 정보를 등록해보세요'}
      subtitleMuted={!meta}
    />
  )
}

const TRIP_LABEL: Record<string, string> = { round: '왕복', one_way: '편도' }

function TravelCard({ case_, href }: { case_: CaseRow; href: string }) {
  const data = (case_.data ?? {}) as Record<string, unknown>
  const tripType = typeof data.trip_type === 'string' ? data.trip_type : null
  const dest = case_.destination?.trim() || null
  const departure = case_.departure_date?.trim() || null

  const routeBit = dest
    ? `한국 ${tripType === 'round' ? '⇄' : '→'} ${dest}`
    : null
  const subtitleParts = [
    routeBit,
    tripType ? TRIP_LABEL[tripType] : null,
    departure ? dDayLabel(departure) : null,
  ].filter(Boolean)
  const subtitle = subtitleParts.join(' · ') || '여행지 정보가 등록되면 표시됩니다.'

  return (
    <Link href={href} style={cardLinkStyle()} className="pm-pressable">
      <div style={cardRowStyle()}>
        <div style={iconCircleStyle()}>
          <RouteIcon />
        </div>
        <div style={infoColStyle()}>
          <span style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>
            여행정보
          </span>
          <div
            style={{
              fontSize: 12,
              color: subtitleParts.length ? C.ink2 : C.ink3,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        </div>
        <Chevron />
      </div>
    </Link>
  )
}

function PartnerStubCard({
  cap,
  placeholder,
  href,
  icon,
}: {
  cap: string
  placeholder: string
  href: string
  icon: ReactNode
}) {
  return (
    <Link href={href} style={cardLinkStyle(true)} className="pm-pressable">
      <div style={cardRowStyle()}>
        <div style={iconCircleStyle()}>{icon}</div>
        <div style={infoColStyle()}>
          <div style={monoCap}>{cap}</div>
          <div
            style={{
              fontSize: 13,
              color: C.ink3,
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {placeholder}
          </div>
        </div>
        <Chevron />
      </div>
    </Link>
  )
}

function AccountCard({ email, href }: { email: string | null; href: string }) {
  return (
    <Link href={href} style={cardLinkStyle()} className="pm-pressable">
      <div style={cardRowStyle()}>
        <div style={iconCircleStyle()}>
          <UserIcon />
        </div>
        <div style={infoColStyle()}>
          <span style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>
            계정
          </span>
          <div
            style={{
              fontSize: 12,
              color: email ? C.ink2 : C.ink3,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {email ?? '—'}
          </div>
        </div>
        <Chevron />
      </div>
    </Link>
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
          {primary && <PetCard case_={primary} href="/me/animal" />}
          {primary && <TravelCard case_={primary} href="/me/travel" />}
          <PartnerStubCard
            cap="동물병원"
            placeholder="담당 동물병원 정보가 등록되면 표시됩니다."
            href="/me/vet"
            icon={<MedicalIcon />}
          />
          <PartnerStubCard
            cap="에이전시"
            placeholder="출국 운송을 맡은 에이전시 정보가 등록되면 표시됩니다."
            href="/me/agency"
            icon={<PlaneIcon />}
          />
          <AccountCard email={view.account.email} href="/me/account" />
        </div>
      </div>
    </div>
  )
}
