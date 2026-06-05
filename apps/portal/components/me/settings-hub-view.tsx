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
 * 내 정보 탭 허브 (/me) — 카테고리별 카드 리스트. (앱 설정은 상단바 ⚙ → /settings)
 * 카테고리 라벨(보호자·반려동물·담당 동물병원·동물 운송 업체)은 모두 카드 밖 mono-cap.
 *   - 보호자 → Hero 1개 (아바타 52, 부제=전화번호+이메일). 공통.
 *   - 반려동물 → Hero 카드 N개 + '동물 추가' 버튼(→ /apply). 각 카드 안에 그 동물의
 *     여행 요약(목적지·유형·D-day) 이 footer 로 들어감. 카드 탭 → /me/animal/[caseId]
 *     에서 동물 정보 + 여행 정보 함께 편집. 삭제도 동물 상세에서.
 *   - 담당 동물병원·동물 운송 업체 → Partner stub (dashed, placeholder). 보호자 단위 공통.
 * (옛 '여행 정보' 단독 섹션과 '계정' 섹션은 폐기 — 여행은 동물 카드 안으로, 계정은
 *  /settings 단일 진입.)
 */

const CARD_RADIUS = 18
const CARD_PADDING = 18
const HERO_AVATAR = 52

const num: CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 400,
}

// ── Hero 톤 (보호자·동물) ─────────────────────────────────────────────────

function HeroLinkCard({
  href,
  avatar,
  nameKo,
  nameEn,
  subtitle,
  subtitleMuted,
  subtitleMono,
  extra,
  extraMono = true,
  footer,
}: {
  href: string
  avatar: ReactNode
  nameKo: string | null
  nameEn: string | null
  subtitle: string
  subtitleMuted?: boolean
  /** subtitle 폰트를 num/tabular(mono) 톤으로 — 전화번호·마이크로칩 같은 식별자용. */
  subtitleMono?: boolean
  /** subtitle 아래 한 줄 — 보조 정보용 (보호자: 이메일, 동물: breed·age·weight). */
  extra?: string | null
  /** extra 폰트 톤. 기본 true(num) — 이메일/한글 메타는 호출자가 false 로 지정. */
  extraMono?: boolean
  /** 본체 아래 sub-section — 동물 카드의 여행 요약 같은 보조 영역용. divider 와 함께 렌더. */
  footer?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="pm-pressable"
      style={{
        display: 'block',
        borderRadius: CARD_RADIUS,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ padding: CARD_PADDING, display: 'flex', alignItems: 'center', gap: 14 }}>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...serif, fontSize: 20, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>
              {nameKo ?? '이름 미설정'}
            </span>
            {nameEn && (
              <span style={{ ...serif, fontSize: 13, color: C.ink3, fontWeight: 400 }}>
                {nameEn}
              </span>
            )}
          </div>
          <div
            style={{
              ...(subtitleMono ? num : {}),
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
          {extra && (
            <div
              style={{
                ...(extraMono ? num : {}),
                fontSize: 12,
                color: C.ink3,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {extra}
            </div>
          )}
        </div>
      </div>
      {footer && (
        <>
          <div style={{ height: 0.5, background: C.line, margin: `0 ${CARD_PADDING}px` }} />
          <div style={{ padding: `12px ${CARD_PADDING}px` }}>{footer}</div>
        </>
      )}
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
  // 카테고리 라벨('보호자')이 카드 밖으로 나가므로, 카드 안에는 핵심 식별자(전화번호)를
  // 위, 보조(이메일)를 아래로. 옛 '계정' 섹션 폐기로 이메일은 여기 보조 줄에 합쳤다.
  return (
    <HeroLinkCard
      href={href}
      avatar={avatar}
      nameKo={data.name}
      nameEn={data.nameEn}
      subtitle={data.phone ?? '전화번호 미설정'}
      subtitleMuted={!data.phone}
      subtitleMono
      extra={data.email}
      extraMono={false}
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
      subtitle={pet.microchip ?? '마이크로칩 미등록'}
      subtitleMuted={!pet.microchip}
      subtitleMono
      extra={meta || (!pet.microchip ? '아바타를 눌러 정보를 등록해보세요' : null)}
      extraMono={false}
      footer={<PetTravelSummary case_={case_} />}
    />
  )
}

/**
 * 동물 카드 안 여행 요약 — 목적지·유형·D-day 한 줄. 케이스의 여행 정보가 하나도
 * 없으면(목적지·출국일 모두 빈) null 반환해 footer 자체가 노출 안 됨.
 */
function PetTravelSummary({ case_ }: { case_: CaseRow }) {
  const data = (case_.data ?? {}) as Record<string, unknown>
  const tripType = typeof data.trip_type === 'string' ? data.trip_type : null
  const dest = case_.destination?.trim() || null
  const departure = case_.departure_date?.trim() || null
  if (!dest && !departure) return null

  const route = dest ? `한국 ${tripType === 'round' ? '⇄' : '→'} ${dest}` : null
  const subParts = [
    tripType ? TRIP_LABEL[tripType] : null,
    departure ? dDayLabel(departure) : null,
  ].filter(Boolean)
  const sub = subParts.join(' · ')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ flexShrink: 0, color: C.ink3 }}
      >
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
      </svg>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: route ? C.ink2 : C.ink3,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {route ?? '여행지 미설정'}
        {sub && <span style={{ color: C.ink3 }}> · {sub}</span>}
      </span>
    </div>
  )
}

// ── 여행 요약 (동물 카드 footer 용) ───────────────────────────────────────

const TRIP_LABEL: Record<string, string> = { round: '왕복', one_way: '편도' }

// ── Partner stub (병원·운송 업체) ─────────────────────────────────────────

function PartnerStubCard({
  placeholder,
  href,
}: {
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
      <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.55 }}>
        {placeholder}
      </div>
    </Link>
  )
}

// ── 섹션 래퍼 (카드 밖 카테고리 라벨) ────────────────────────────────────

/** 카드 위에 mono-cap 카테고리 라벨을 얹는 섹션 묶음. 모든 카테고리 공통 톤. */
function Section({
  label,
  children,
  first,
}: {
  label: string
  children: ReactNode
  first?: boolean
}) {
  return (
    <div style={{ marginTop: first ? 22 : 26 }}>
      <div style={{ ...monoCap, marginBottom: 10, padding: '0 4px' }}>{label}</div>
      {children}
    </div>
  )
}

// ── 동물 추가 (반려동물 섹션 하단 버튼 → 신청 폼) ─────────────────────────

/** '동물 추가' — 새 케이스 신청(/apply)으로. dashed 카드 + 가운데 + 라벨. */
function AddAnimalCard({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="pm-pressable"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '15px 18px',
        borderRadius: CARD_RADIUS,
        background: 'transparent',
        border: `.5px dashed ${C.line}`,
        textDecoration: 'none',
        color: C.ink2,
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      동물 추가
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
          내 정보
        </h1>

        <Section label="보호자" first>
          <GuardianCard data={view.guardian} href="/me/guardian" />
        </Section>

        <Section label="반려동물">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cases.map((c, i) => (
              <PetCard key={c.id} case_={c} index={i} href={`/me/animal/${c.id}`} />
            ))}
            <AddAnimalCard href="/apply" />
          </div>
        </Section>

        <Section label="담당 동물병원">
          <PartnerStubCard
            placeholder="담당 동물병원 정보가 등록되면 표시됩니다."
            href="/me/vet"
          />
        </Section>

        <Section label="동물 운송 업체">
          <PartnerStubCard
            placeholder="동물 운송 업체 정보가 등록되면 표시됩니다."
            href="/me/agency"
          />
        </Section>
      </div>
    </div>
  )
}
