'use client'

import Link from 'next/link'
import { type CSSProperties, type ReactNode } from 'react'
import { buildCaseJourneyContext, type CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { StartHereEmpty } from '@/components/portal-shell/start-here-empty'
import {
  buildProfileView,
  buildPetBlock,
  type GuardianBlock,
} from '@/lib/profile/catalog'
import { AVATAR_GRADIENTS, avatarTextColor, isAvatarColorId } from '@/lib/avatar'
import { dDayLabel } from '@/lib/cases/info-form'
import { type PartnerOrg } from '@/lib/actions/partners'
import { PetAvatarDisplay } from './pet-avatar-display'
import { C, serif, monoCap, OrgAvatar } from './settings-shared'
import { PAGE_TOP, itemTitle, pageTitle } from '@/lib/tokens'

/**
 * 내 정보 탭 허브 (/me) — 카테고리별 카드 리스트. (앱 설정은 상단바 ⚙ → /settings)
 * 카테고리 라벨(보호자·반려동물·담당 동물병원·담당 운송업체)은 모두 카드 밖 mono-cap.
 *   - 보호자 → Hero 1개 (아바타 52, 부제=전화번호+이메일). 공통.
 *   - 반려동물 → Hero 카드 N개 + '동물 추가' 버튼(→ /apply). 각 카드 안에 그 동물의
 *     여행 요약(목적지·유형·D-day) 이 footer 로 들어감. 카드 탭 → /me/animal/[caseId]
 *     에서 동물 정보 + 여행 정보 함께 편집. 삭제도 동물 상세에서.
 *   - 담당 동물병원·담당 운송업체 → Partner stub (dashed, placeholder). 보호자 단위 공통.
 * (옛 '여행 정보' 단독 섹션과 '계정' 섹션은 폐기 — 여행은 동물 카드 안으로, 계정은
 *  /settings 단일 진입.)
 */

const CARD_RADIUS = 18
const CARD_PADDING = 18
const HERO_AVATAR = 52
const PARTNER_AVATAR = 46 // 담당 동물병원·운송업체 카드 아바타 — Hero(52)보다 한 단계 작게

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
            <span style={{ ...itemTitle, fontVariantNumeric: 'tabular-nums' }}>
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

/**
 * 동물 카드 subtitle 용 여행 요약 한 줄 — '한국 ⇄ 일본' (왕복) 또는 '한국 → 일본' (편도).
 *
 * tripType 은 buildCaseJourneyContext 로 — data.trip_type 은 목적지 토큰 키의 객체
 * ({ '일본': 'round' }) 단일 형식이고(스칼라 지원 없음 — getTripType 참조), 편도 전용
 * 목적지(호주 등)는 저장값과 무관하게 편도로 강제된다. 화살표만으로 왕복/편도 구분이
 * 충분하므로 별도 라벨('왕복'·'편도')은 카드에서 제외.
 */
function petTravelSummaryText(case_: CaseRow): string | null {
  const dest = case_.destination?.trim() || null
  if (!dest) return null
  const arrow = buildCaseJourneyContext(case_).tripType === 'round' ? '⇄' : '→'
  return `한국 ${arrow} ${dest}`
}

// ── Partner card (병원·운송 업체) ─────────────────────────────────────────
// 연결됨: 조직 이름(+ both 면 배지) 표시. 미연결: dashed placeholder.

function PartnerCard({
  org,
  placeholder,
  href,
}: {
  org: PartnerOrg | null
  placeholder: string
  href: string
}) {
  if (!org) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 빈 슬롯 — 채워진 카드(아바타+이름)와 높이를 맞추는 점선 자리표시 */}
          <div
            aria-hidden
            style={{
              width: PARTNER_AVATAR,
              height: PARTNER_AVATAR,
              borderRadius: Math.round(PARTNER_AVATAR * 0.28),
              border: `1px dashed ${C.line}`,
              color: C.ink3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.55 }}>{placeholder}</div>
        </div>
      </Link>
    )
  }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <OrgAvatar name={org.name} url={org.avatar_url} size={PARTNER_AVATAR} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={itemTitle}>{org.name}</span>
            {org.org_type === 'both' && (
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: C.soft,
                  color: C.ink2,
                  whiteSpace: 'nowrap',
                }}
              >
                병원·운송
              </span>
            )}
          </div>
          {org.name_en && (
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>{org.name_en}</div>
          )}
        </div>
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
  const { cases, profile, userEmail, partners, transportAvailable } = useCases()
  const primary = cases[0] ?? null
  const view = buildProfileView({ userEmail, customerProfile: profile, primaryCase: primary })

  // 담당 병원·운송 카드는 CaseDataProvider 가 서버 초기 로드로 채워 둔 partners 를 그대로
  // 읽는다 — 페이지 진입 즉시 채워진 상태(빈칸 깜빡임·따로 fetch 없음). 병원 변경 시
  // refreshCases → partnerKey 변화로 Provider 가 알아서 갱신.

  // 등록한 반려동물이 0마리면 휑한 허브 대신 '시작하기' 한 길만 보여준다.
  if (cases.length === 0) {
    // 준비 탭 환영 화면과 동일 문구 — 등록 전 3개 탭(준비·맡기기·내 정보) 통일 (2026-08-05).
    return <StartHereEmpty title="펫무브에 오신 것을 환영합니다" />
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: PAGE_TOP,
        paddingBottom: 80,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h1 style={pageTitle}>내 정보</h1>

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
          <PartnerCard
            org={partners.vet}
            placeholder="담당 동물병원을 연결해 보세요"
            href="/me/vet"
          />
        </Section>

        {/* 담당 운송업체 — 선택 가능한 운송 조직이 있거나 이미 연결됐을 때만 노출.
            아직 등록된 운송업체가 없으면(빈 카탈로그) 섹션 자체를 숨겨 빈 선택지를 보이지 않게 한다.
            운영자가 운송업체를 추가하면 다음 진입부터 자동으로 다시 나타난다. */}
        {(transportAvailable || partners.transport) && (
          <Section label="담당 운송업체">
            <PartnerCard
              org={partners.transport}
              placeholder="담당 운송업체를 연결해 보세요"
              href="/me/agency"
            />
          </Section>
        )}
      </div>
    </div>
  )
}
