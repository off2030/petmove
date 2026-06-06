'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { buildCaseJourneyContext, type CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import {
  buildProfileView,
  buildPetBlock,
  type GuardianBlock,
} from '@/lib/profile/catalog'
import { AVATAR_GRADIENTS, avatarTextColor, isAvatarColorId } from '@/lib/avatar'
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

/** 보호자 카드 안 아바타 — photo > 이니셜+색상 fallback. /me hub 와 sub-page 공용 X (sub-page 는 picker 자체 사용). */
function GuardianAvatarDisplay({ data, size }: { data: GuardianBlock; size: number }) {
  if (data.avatarPhotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.avatarPhotoUrl}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }
  const color = isAvatarColorId(data.avatarColor) ? data.avatarColor : null
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: color ? AVATAR_GRADIENTS[color] : C.soft,
        color: avatarTextColor(color),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...num,
        fontFamily: 'var(--pm-font-display)',
        fontSize: Math.round(size * 0.36),
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      {data.initials}
    </div>
  )
}

function GuardianCard({ data, href }: { data: GuardianBlock; href: string }) {
  const avatar = <GuardianAvatarDisplay data={data} size={HERO_AVATAR} />
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
  const travel = petTravelSummaryText(case_)
  return (
    <HeroLinkCard
      href={href}
      avatar={<PetAvatarDisplay case_={case_} index={index} size={HERO_AVATAR} />}
      nameKo={pet.name}
      nameEn={pet.nameEn}
      subtitle={meta || '아바타를 눌러 정보를 등록해보세요'}
      subtitleMuted={!meta}
      extra={travel}
      extraMono={false}
    />
  )
}

// ── 여행 요약 헬퍼 ───────────────────────────────────────────────────────

const TRIP_LABEL: Record<string, string> = { round: '왕복', one_way: '편도' }

/**
 * 동물 카드 subtitle 용 여행 요약 한 줄 — '한국 ⇄ 일본 · 왕복'.
 *
 * tripType 은 buildCaseJourneyContext 로 — data.trip_type 이 string 이거나
 * destination-scoped 객체({ '일본': 'round' }) 인 두 형식 모두 정확히 분기 ('round' →
 * 양방향 ⇄, 그 외 → 단방향 →). 단순 typeof string 체크는 객체 형식을 놓쳐 늘 단방향이
 * 보였었다.
 *
 * D-day 는 카드에서 제외 — 사용자 요청에 따라 카드를 가볍게.
 */
function petTravelSummaryText(case_: CaseRow): string | null {
  const dest = case_.destination?.trim() || null
  if (!dest) return null

  const ctx = buildCaseJourneyContext(case_)
  const arrow = ctx.tripType === 'round' ? '⇄' : '→'
  const parts: string[] = [`한국 ${arrow} ${dest}`]
  if (ctx.tripType && TRIP_LABEL[ctx.tripType]) parts.push(TRIP_LABEL[ctx.tripType])
  return parts.join(' · ')
}

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
