'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CaseRow } from '@petmove/domain'
import destsData from '@petmove/domain/data/destinations.json'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { readLastCaseId, readLastDest } from '@/components/portal-shell/last-case'
import { StartHereEmpty } from '@/components/portal-shell/start-here-empty'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { type FieldOption } from '@/components/fields/info-fields'
import { C, serif } from '@/components/me/settings-shared'
import { buildProfileView } from '@/lib/profile/catalog'
import { notifyServiceInquiry } from '@/lib/actions/service-inquiry'

/**
 * 서비스 탭 (/services) — 펫무브 유료 상품 안내. 목적지 + 여정 유형(왕복·편도) 인식형.
 *
 * 서비스 내용·비용은 목적지와 왕복/편도에 따라 달라진다.
 *  - 목적지 선택지 = '서비스 제공 국가' 큐레이션 목록(OFFERED_KO). 처음부터 검색 시트로
 *    — 목록이 늘어나도 버튼으로 감당 안 되므로. 새 나라 준비되면 OFFERED_KO 에 push.
 *  - 기본 목적지 = **현재 선택된 동물의 여정** 목적지(일정/서류에서 보던 케이스 = LAST_CASE_KEY,
 *    그 케이스의 활성 목적지 = readLastDest). 그게 서비스 제공 목록에 있으면 그것. 없으면
 *    전체 케이스 union 의 첫 제공 목적지, 그것도 없으면 목록 첫 번째. (서비스는 보고 있는
 *    동물 기준으로 안내해야 — 여러 동물의 목적지가 섞이면 엉뚱한 나라가 잡힘.)
 *  - 왕복/편도 = 등록값을 기본 표시 + 여기서도 전환. 단, 이 선택은 **둘러보기용 로컬 상태**라
 *    실제 여정의 trip_type 을 바꾸지 않는다(목록엔 미등록 목적지도 있어 저장 대상이 아님).
 *
 * 두 갈래: 오프라인(오프라인 올케어, 전체 의뢰) / 온라인(온라인 안심케어, 부분 의뢰).
 * v1 은 안내(소개)만 — 상담 신청·결제 액션은 결제 모델 확정 전까지 미연결.
 * 목적지·유형별 내용·비용 분기는 차차 — 지금은 buildOffers 가 generic 반환.
 * (결제 모델 미정: docs/portal-plan.md §결제 / memory project_portal_paywall)
 */

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

/** 서비스 제공 국가 — 여정 카드 구성이 끝난 목적지부터. 새 나라 준비되면 여기에 push. */
const OFFERED_KO: string[] = ['일본', '태국', '필리핀']
const OFFERED: Dest[] = OFFERED_KO.map((ko) => DESTS.find((d) => d.ko === ko) ?? { ko, en: '' })

/** 펫무브 카카오톡 채널 채팅 링크 — '카카오톡으로 문의' 진입. */
const KAKAO_CHAT_URL = 'https://pf.kakao.com/_zDDxhj/chat'

type TripType = 'round' | 'one_way'
const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]

type Accent = { stroke: string; chipBg: string }
const AMBER: Accent = { stroke: C.accent, chipBg: C.soft }
const SAGE: Accent = {
  stroke: C.sage,
  chipBg: 'color-mix(in srgb, var(--pm-sage) 14%, transparent)',
}

const clinicIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 21h18" />
    <path d="M5 21V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15" />
    <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
    <path d="M12 10.2c-1.1 0-1.9.7-1.9 1.5 0 .7.8 1.1 1.9 1.1s1.9-.4 1.9-1.1c0-.8-.8-1.5-1.9-1.5z" fill="currentColor" stroke="none" />
    <circle cx="9.4" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="11" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="13" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
  </svg>
)

const devicesIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6.5 4h9a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z" />
    <path d="M3.5 13.8h15" />
    <path
      d="M15.9 7.5h3.1a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3.1a1.5 1.5 0 0 1-1.5-1.5V9a1.5 1.5 0 0 1 1.5-1.5z"
      style={{ fill: 'color-mix(in srgb, var(--pm-sage) 14%, var(--pm-surface))' }}
    />
    <path d="M16.7 17.5h1.6" />
  </svg>
)

/** 상세 V 체크리스트 항목 — sub(한 줄 설명)는 선택. 목록이 길면 라벨만 둔다. */
type Prep = { label: string; sub?: string }
/** 상세 히어로 3장(오프라인 공통) — 아이콘(또는 숫자 배지) + 한 줄 라벨. */
type Highlight = { icon: ReactNode; label: string }
/** 먼저 경험한 분들 — 실제 후기(이름은 익명화). meta = 반려동물·목적지. */
type Review = { initial: string; name: string; meta?: string; text: string }
/** 자주 묻는 질문 — link 있으면 답변 아래 바깥링크(예: 병원 위치) 노출. */
type Faq = { q: string; a: string; link?: { label: string; href: string } }
/** 목적지별 상세 본문 — 같은 상품이라도 나라마다 다르게 구성한다. */
type DestDetail = { intro: string; included: Prep[]; steps: string[]; faq: Faq[]; reviews: Review[] }

interface Offer {
  // ── 목록 카드(목적지 공통) ──
  accent: Accent
  icon: ReactNode
  title: string
  tag: string
  desc: string
  /** "이럴 때 추천해요" 항목들 — 두 갈래 중 자기 것을 빠르게 고르게 하는 결정 보조. */
  forWhom: string[]
  /** 밀어주는 갈래에 '추천' 배지 + 강조 테두리. */
  recommended?: boolean
  /** 상세 히어로 3장(오프라인 공통 — 경험·전문성·앱). 없으면 미표시. */
  highlights?: Highlight[]
  // ── 상세(목적지별) — DestDetail 을 펼쳐 담는다 ──
  /** 상세 상단의 가벼운 소개 한두 문장. */
  intro: string
  included: Prep[]
  /** 상세 '이렇게 진행돼요' 단계 라벨. */
  steps: string[]
  faq: Faq[]
  reviews: Review[]
}

/**
 * 서비스 상세 — 카드 본체(설명·추천 대상·아이콘)는 목적지 공통이지만,
 * 상세 본문(소개·체크리스트·진행 단계·FAQ·후기)은 **목적지마다 다르게** 구성한다.
 * 새 목적지는 {OFFLINE,ONLINE}_DETAIL 에 그 나라 블록을 추가(전용 카피 전엔 default 폴백).
 * 후기(reviews)는 default 로 공유하지 않는다 — 한 나라 후기가 다른 나라에 새지 않도록 빈 배열.
 */
const DEFAULT_FAQ: Faq[] = [
  { q: '비용은 얼마인가요?', a: '목적지와 반려동물 상태에 따라 달라져요. 카카오톡으로 문의 주시면 정확히 안내해 드려요.' },
  {
    q: '준비 기간은 얼마나 걸리나요?',
    a: '나라마다 달라요. 광견병 항체검사가 필요한 곳은 몇 달 전부터 준비해야 해서, 상담 때 목적지에 맞는 일정표를 만들어 드려요.',
  },
  {
    q: '예약을 취소·변경할 수 있나요?',
    a: '절차를 시작하기 전이라면 언제든 가능해요. 이미 진행된 부분은 진행한 만큼만 정산돼요. 자세한 기준은 상담 시 안내해 드려요.',
  },
]

const OFFLINE_DETAIL: Record<string, DestDetail> = {
  일본: {
    intro:
      '로잔동물의료센터에서 검역 준비를 해 드립니다. 의료 절차는 물론 일본 검역소와의 소통, 서류 준비까지 빈틈없이 진행해 드립니다. 앱을 통해 언제든 쉽게 정보, 진행 상황을 확인할 수 있습니다.',
    included: [
      { label: '마이크로칩 삽입 · 동물등록' },
      { label: '광견병 백신 접종' },
      { label: '광견병 항체 검사' },
      { label: '사전 신고' },
      { label: '일본 수출 동물검역 신청 · 예약' },
      { label: '출국 전 임상검사' },
      { label: '서류 준비' },
    ],
    steps: ['예약', '내원', '상담', '시작'],
    faq: [
      {
        q: '어디로 방문하나요?',
        a: '로잔동물의료센터로 방문해 주세요.',
        link: { label: '병원 위치 보기', href: 'https://naver.me/GUwSYQ9h' },
      },
      { q: '비용은 얼마인가요?', a: '50~60만원 정도예요. 정확한 비용은 상담 후 결정돼요.' },
      { q: '준비 기간이 얼마나 걸리나요?', a: '접종 상황에 따라 최소 6~7개월 정도 걸려요.' },
    ],
    // ⚠️ 실제 카톡 후기(이름 익명화). 게재 전 당사자 동의 확인 필요.
    reviews: [
      {
        initial: '노',
        name: '유○하님',
        meta: '노엘 · 일본',
        text: '일본 검역이 깐깐하다고 들어 긴장을 많이 했는데, 서류를 완벽하게 준비해주신 덕분에 아무 문제 없이 통과했습니다. 진심으로 감사합니다.',
      },
      { initial: '포', name: '윤○우님', meta: '포로리 · 일본', text: '선생님 덕분에 포로리 일본에 잘 들어왔습니다. 정말 감사합니다.' },
      { initial: '레', name: '김○근님', meta: '레몬 · 일본', text: '레몬이 준비 잘 해주셔서 감사합니다.' },
    ],
  },
  default: {
    intro: '복잡한 검역 절차, 수의사가 처음부터 끝까지 직접 준비·관리해 드려요.',
    included: [
      { label: '검역·백신 일정 관리', sub: '놓치면 안 되는 날짜를 대신 챙겨요' },
      { label: '서류 발급 대행', sub: '건강증명서·검사 서류까지 발급해요' },
      { label: '수입허가증 신청', sub: '목적지 정부 허가 신청을 대신해요' },
    ],
    steps: ['상담', '준비·관리', '출국'],
    faq: DEFAULT_FAQ,
    reviews: [],
  },
}

const ONLINE_DETAIL: Record<string, DestDetail> = {
  일본: {
    intro: '직접 준비하시되 혼자 헤매지 않게, 까다로운 일본 검역 절차를 단계별로 도와드려요.',
    included: [
      { label: '단계별 가이드', sub: '지금 뭘 해야 하는지 순서대로 알려드려요' },
      { label: '일본 검역소 신고·소통', sub: '까다로운 사전신고·검역소 연락을 도와드려요' },
      { label: '서류 검토·점검', sub: '빠진 서류·오류를 미리 잡아드려요' },
    ],
    steps: ['상담', '직접 준비 + 점검', '출국'],
    faq: DEFAULT_FAQ,
    reviews: [],
  },
  default: {
    intro: '직접 준비하시되 혼자 헤매지 않게, 실패 없는 안전한 준비를 곁에서 도와드려요.',
    included: [
      { label: '단계별 준비 가이드', sub: '지금 뭘 해야 하는지 순서대로 알려드려요' },
      { label: '서류 검토·점검', sub: '빠진 서류·오류를 미리 잡아드려요' },
      { label: '수입허가증 신청 대행', sub: '까다로운 허가 신청은 대신해 드려요' },
    ],
    steps: ['상담', '직접 준비 + 점검', '출국'],
    faq: DEFAULT_FAQ,
    reviews: [],
  },
}

/** 오프라인 올케어 히어로 3장 — 목적지 무관 공통(전문성·경험·앱 편의). */
const OFFLINE_HIGHLIGHTS: Highlight[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9.5" cy="7" r="3.3" />
        <path d="M3.5 20.5v-1a6 6 0 0 1 8-5.65" />
        <path d="M16.8 20.8s-2.3-1.4-2.3-3.1a1.35 1.35 0 0 1 2.3-.95 1.35 1.35 0 0 1 2.3.95c0 1.7-2.3 3.1-2.3 3.1z" />
      </svg>
    ),
    label: '전문 의료진',
  },
  {
    icon: <span style={{ ...serif, fontSize: 15, fontWeight: 500 }}>20y</span>,
    label: '풍부한 경험',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M9.3 11l1.9 1.9 3.5-3.6" />
      </svg>
    ),
    label: '앱 연동',
  },
]

/** 카드 본체는 공통, 상세 본문(DestDetail)만 목적지별. 미정 목적지는 default 폴백. */
function buildOffers(dest: string | null, _trip: TripType): Offer[] {
  const d = dest ?? ''
  return [
    {
      accent: AMBER,
      icon: clinicIcon,
      title: '오프라인 올케어',
      tag: '병원 방문 · 전체 의뢰',
      desc: '수의사가 모든 절차를 준비·관리해 드려요.',
      forWhom: [
        '검역이 처음이라 막막해요',
        '바빠서 직접 챙기기 어려워요',
        '전문가에게 맡기고 안심하고 싶어요',
      ],
      recommended: true,
      highlights: OFFLINE_HIGHLIGHTS,
      ...(OFFLINE_DETAIL[d] ?? OFFLINE_DETAIL.default),
    },
    {
      accent: SAGE,
      icon: devicesIcon,
      title: '온라인 안심케어',
      tag: '셀프 준비 · 부분 의뢰',
      desc: '안심하고 준비하실 수 있도록 곁에서 도와드려요.',
      forWhom: [
        '직접 해본 경험이 있어요',
        '멀어서 방문이 힘들어요',
        '어려운 부분만 도움받고 싶어요',
      ],
      ...(ONLINE_DETAIL[d] ?? ONLINE_DETAIL.default),
    },
  ]
}

/**
 * 한 케이스(동물)의 여정 목적지 중 서비스 제공 목록에 있는 것 — 활성 목적지(activeDest) 우선.
 * 다중 목적지 케이스면 보던 목적지(?dest=)를 맨 앞에 두고, 없거나 미제공이면 그 다음 제공 목적지.
 */
function offeredDestForCase(c: CaseRow, activeDest: string | null): string | null {
  const toks = (c.destination ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const ordered =
    activeDest && toks.includes(activeDest)
      ? [activeDest, ...toks.filter((t) => t !== activeDest)]
      : toks
  return ordered.find((t) => OFFERED_KO.includes(t)) ?? null
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

/** 등록값에서 그 목적지의 왕복/편도를 읽는다 — 없으면 'round'. data.trip_type 객체 + 레거시 문자열 대응. */
function tripTypeForDest(cases: CaseRow[], dest: string | null): TripType {
  if (!dest) return 'round'
  for (const c of cases) {
    const data = (c.data ?? {}) as Record<string, unknown>
    const tt = data.trip_type
    if (tt && typeof tt === 'object' && !Array.isArray(tt)) {
      const v = (tt as Record<string, unknown>)[dest]
      if (v === 'round' || v === 'one_way') return v
    } else if (typeof tt === 'string') {
      const toks = (c.destination ?? '').split(',').map((t) => t.trim())
      if (toks.includes(dest) && (tt === 'round' || tt === 'one_way')) return tt
    }
  }
  return 'round'
}

function ServiceCard({ offer, onOpen }: { offer: Offer; onOpen: () => void }) {
  const { accent } = offer
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{
        position: 'relative',
        borderRadius: 18,
        background: C.surface,
        border: offer.recommended ? `1.5px solid ${C.accent}` : `.5px solid ${C.line}`,
        padding: 18,
        cursor: 'pointer',
      }}
    >
      {offer.recommended && (
        <span
          style={{
            position: 'absolute',
            top: -9,
            left: 16,
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 9px',
            borderRadius: 999,
            background: C.accent,
            color: '#fff',
          }}
        >
          추천
        </span>
      )}
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

      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
            aria-hidden
          >
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          </svg>
          이럴 때 추천해요
        </div>
        {offer.forWhom.map((who) => (
          <div
            key={who}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 7, fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}
          >
            <span style={{ flexShrink: 0, marginTop: 6, width: 4, height: 4, borderRadius: '50%', background: accent.stroke }} />
            {who}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 3,
          marginTop: 14,
          paddingTop: 12,
          borderTop: `.5px solid ${C.line}`,
          fontSize: 13,
          fontWeight: 500,
          color: accent.stroke,
        }}
      >
        자세히 보기
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * 서비스 상세 — 소개·진행 병원·체크리스트·진행 단계·후기·FAQ·CTA.
 * 본문(intro·included·steps·faq·reviews)은 목적지별 DestDetail 에서 온다(buildOffers).
 * 통계(누적·만족도) 박스는 검증 가능한 실값이 없어 제거 — 신뢰는 진행 병원 + 실제 후기로.
 * ──────────────────────────────────────────────────────────────────────── */

const starIcon = (size: number, fill: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9 6.2 20.95l1.1-6.45-4.7-4.6 6.5-.95z" />
  </svg>
)

function ServiceDetail({ offer, onBack, onInquire }: { offer: Offer; onBack: () => void; onInquire: () => void }) {
  const { accent } = offer
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div style={{ padding: '0 24px' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: '2px 0 0',
          margin: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: C.ink,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span style={{ ...serif, fontSize: 18, color: C.ink }}>{offer.title}</span>
      </button>

      <div style={{ marginTop: 16 }}>
        <span
          style={{
            display: 'inline-block',
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
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: C.ink2, margin: '12px 0 0' }}>{offer.intro}</p>
      </div>

      {offer.highlights && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
          {offer.highlights.map((h) => (
            <div
              key={h.label}
              style={{
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 12,
                padding: '13px 8px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  margin: '0 auto',
                  borderRadius: 10,
                  background: accent.chipBg,
                  color: accent.stroke,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {h.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink, marginTop: 8, lineHeight: 1.3 }}>{h.label}</div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ ...serif, fontSize: 15, color: C.ink, margin: '24px 0 10px' }}>이런 걸 대신해 드려요</h2>
      <div style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 16, padding: '4px 16px' }}>
        {offer.included.map((item, i) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              gap: 11,
              padding: '12px 0',
              borderBottom: i < offer.included.length - 1 ? `.5px solid ${C.line}` : 'none',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accent.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: C.ink }}>{item.label}</div>
              {item.sub && <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{item.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ ...serif, fontSize: 15, color: C.ink, margin: '26px 0 12px' }}>이렇게 진행돼요</h2>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {offer.steps.map((s, i) => (
          <Fragment key={s}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: C.soft,
                  color: C.accent,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 5 }}>{s}</div>
            </div>
            {i < offer.steps.length - 1 && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.ink3}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginTop: 8, flexShrink: 0 }}
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </Fragment>
        ))}
      </div>

      <h2 style={{ ...serif, fontSize: 15, color: C.ink, margin: '26px 0 6px' }}>자주 묻는 질문</h2>
      <div>
        {offer.faq.map((f, i) => {
          const open = openFaq === i
          return (
            <div key={f.q} style={{ borderBottom: `.5px solid ${C.line}` }}>
              <button
                type="button"
                onClick={() => setOpenFaq(open ? null : i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  width: '100%',
                  padding: '13px 2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  color: C.ink,
                  fontSize: 13.5,
                }}
              >
                {f.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.ink3}
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {open && (
                <div style={{ margin: '0 2px 13px' }}>
                  <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
                  {f.link && (
                    <a
                      href={f.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, fontSize: 12.5, fontWeight: 500, color: accent.stroke, textDecoration: 'none' }}
                    >
                      {f.link.label}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M7 17L17 7" />
                        <path d="M8 7h9v9" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {offer.reviews.length > 0 && (
        <>
          <h2 style={{ ...serif, fontSize: 15, color: C.ink, margin: '26px 0 10px' }}>먼저 경험한 분들</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {offer.reviews.map((r) => (
              <div key={r.name} style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 14, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: C.soft,
                      color: C.accent,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {r.initial}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: C.ink }}>{r.name}</span>
                  {r.meta && <span style={{ fontSize: 11, color: C.ink3 }}>· {r.meta}</span>}
                  <span style={{ display: 'inline-flex', gap: 1, marginLeft: 'auto' }}>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <Fragment key={n}>{starIcon(11, C.accent)}</Fragment>
                    ))}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6, margin: 0 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onInquire}
        style={{
          width: '100%',
          marginTop: 22,
          padding: '15px 0',
          borderRadius: 14,
          border: 'none',
          background: C.accent,
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        이 서비스로 시작하기
      </button>
      <p style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center', margin: '10px 0 0' }}>
        궁금한 점은 카카오톡으로 편하게 물어보세요
      </p>
    </div>
  )
}

export function ServicesView() {
  const { cases, profile, userEmail } = useCases()

  // 현재 선택된 동물 = 일정/서류에서 마지막으로 보던 케이스(LAST_CASE_KEY) + 그 활성 목적지
  // (readLastDest). sessionStorage 라 mount 후에만 읽는다(SSR/hydration 불일치 방지) — 첫
  // 렌더는 union 폴백, mount 직후 선택 동물 기준으로 정정된다.
  const [journeyHint, setJourneyHint] = useState<{ caseId: string; dest: string | null } | null>(null)
  useEffect(() => {
    const id = readLastCaseId()
    setJourneyHint(id ? { caseId: id, dest: readLastDest(id) } : null)
  }, [])
  const selectedCase = journeyHint ? cases.find((c) => c.id === journeyHint.caseId) ?? null : null

  // 기본 목적지 = 선택된 동물의 여정 목적지(제공 목록에 있으면). 없으면 전체 union 첫 제공, 최후 일본.
  const registered = destinationsFromCases(cases)
  const defaultDestKo =
    (selectedCase ? offeredDestForCase(selectedCase, journeyHint?.dest ?? null) : null) ??
    registered.find((d) => OFFERED_KO.includes(d)) ??
    OFFERED_KO[0]
  const [pickedKo, setPickedKo] = useState<string | null>(null)
  const selectedKo = pickedKo && OFFERED_KO.includes(pickedKo) ? pickedKo : defaultDestKo
  const selected = OFFERED.find((d) => d.ko === selectedKo) ?? { ko: selectedKo, en: '' }

  // 왕복/편도 = 등록값 기본 + 로컬 전환(둘러보기용, 저장 X). 목적지 바뀌면 그 목적지 등록값으로.
  // 선택된 동물을 맨 앞에 두고 읽어, 같은 목적지를 가진 다른 동물의 값에 가려지지 않게 한다.
  const tripCases = selectedCase ? [selectedCase, ...cases.filter((c) => c.id !== selectedCase.id)] : cases
  const defaultTrip = tripTypeForDest(tripCases, selectedKo)
  const [tripOverride, setTripOverride] = useState<{ dest: string; trip: TripType } | null>(null)
  const trip = tripOverride && tripOverride.dest === selectedKo ? tripOverride.trip : defaultTrip

  // 검색 시트
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return OFFERED
    return OFFERED.filter((d) => d.ko.includes(q) || d.en.toLowerCase().includes(q))
  }, [query])

  // 문의 — 로그인 상태라 이름·이메일을 이미 앎(폼 X). 카톡 열기 직전 운영자에게 봇 알림.
  const guardian = buildProfileView({
    userEmail,
    customerProfile: profile,
    primaryCase: cases[0] ?? null,
  }).guardian
  const [confirmOpen, setConfirmOpen] = useState(false)
  // 상세로 들어간 서비스(카드 탭). null = 목록. 새 라우트 없이 같은 화면을 전환한다.
  const [openTitle, setOpenTitle] = useState<string | null>(null)
  // FAB 는 portal 로 body 에 그린다 — pm-fade-up 의 transform(fill-mode both 로 잔존)이
  // position:fixed 의 기준을 가로채 본문에 박히는 것을 피하려고. SSR 가드로 mount 후에만.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // 등록한 반려동물이 0마리면 일반 안내 대신 '시작하기' 한 길만 — 목적지·동물이 있어야
  // 맞춤 서비스를 보여줄 수 있으므로. 동물을 등록하면 아래 일반 화면으로 돌아간다.
  if (cases.length === 0) {
    return (
      <StartHereEmpty
        title="반려동물을 먼저 등록해주세요"
        subtitle="등록하면 목적지에 맞는 서비스를 안내해 드려요"
      />
    )
  }

  function startInquiry() {
    void notifyServiceInquiry({ name: guardian.name, destination: selectedKo, tripType: trip })
    window.open(KAKAO_CHAT_URL, '_blank', 'noopener,noreferrer')
    setConfirmOpen(false)
  }

  const offers = buildOffers(selectedKo, trip)
  const openOffer = openTitle ? offers.find((o) => o.title === openTitle) ?? null : null
  const tripLabel = trip === 'round' ? '왕복' : '편도'

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
      {openOffer ? (
        <ServiceDetail
          offer={openOffer}
          onBack={() => setOpenTitle(null)}
          onInquire={() => setConfirmOpen(true)}
        />
      ) : (
        <div style={{ padding: '0 24px' }}>
          <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>
            서비스
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSheetOpen(true)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 999,
                border: `0.5px solid ${C.line}`,
                background: C.surface,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: C.ink,
              }}
            >
              {selected.ko}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 999, border: `0.5px solid ${C.line}`, background: C.surface }}>
              {TRIP_OPTIONS.map((o) => {
                const on = trip === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTripOverride({ dest: selectedKo, trip: o.value === 'one_way' ? 'one_way' : 'round' })}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      fontWeight: 500,
                      background: on ? C.soft : 'transparent',
                      color: on ? C.accent : C.ink3,
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {offers.map((o) => (
              <ServiceCard key={o.title} offer={o} onOpen={() => setOpenTitle(o.title)} />
            ))}
          </div>
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="목적지 선택">
        <input
          className="pm-field-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="국가 검색"
          style={{
            width: '100%',
            padding: '12px 14px',
            margin: '4px 0 10px',
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 15,
            color: C.ink,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', fontSize: 13, color: C.ink3, textAlign: 'center' }}>
              일치하는 목적지가 없습니다.
            </div>
          ) : (
            filtered.map((d) => {
              const isSel = d.ko === selectedKo
              return (
                <button
                  key={d.ko}
                  type="button"
                  onClick={() => {
                    setPickedKo(d.ko)
                    setSheetOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    padding: '13px 0',
                    borderBottom: `.5px solid ${C.line}`,
                    background: isSel ? C.soft : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 15, color: C.ink, paddingLeft: isSel ? 8 : 0 }}>{d.ko}</span>
                  <span style={{ fontSize: 13, color: C.ink3 }}>{d.en}</span>
                </button>
              )
            })
          )}
        </div>
      </BottomSheet>

      {mounted &&
        !sheetOpen &&
        !confirmOpen &&
        createPortal(
          <button
            type="button"
            aria-label="카카오톡으로 문의"
            onClick={() => setConfirmOpen(true)}
            style={{
              position: 'fixed',
              right: 16,
              // 하단 바와 동일 기준(max(safe,14px)) 위로 바 높이(~66px)+여백 → 확실히 띄움.
              bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + 90px)',
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: 'none',
              background: '#FEE500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 38,
              boxShadow: '0 6px 18px -4px rgba(0,0,0,0.28), 0 2px 6px -2px rgba(0,0,0,0.12)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden>
              <path d="M12 3.5C6.8 3.5 2.5 6.9 2.5 11c0 2.6 1.8 4.9 4.5 6.3-.2.7-.7 2.5-.8 2.9-.1.4.2.55.45.42.3-.16 2.6-1.78 3.55-2.42.55.08 1.12.12 1.7.12 5.2 0 9.5-3.4 9.5-7.6S17.2 3.5 12 3.5z" />
            </svg>
          </button>,
          document.body,
        )}

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="문의를 시작할게요">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: `.5px solid ${C.line}` }}>
            <span style={{ fontSize: 13, color: C.ink3 }}>이름</span>
            <span style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>{guardian.name ?? '미설정'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0' }}>
            <span style={{ fontSize: 13, color: C.ink3 }}>이메일</span>
            <span style={{ fontSize: 14, color: C.ink }}>{guardian.email ?? userEmail ?? '미설정'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 0' }}>
          {[selected.ko, tripLabel].map((chip) => (
            <span key={chip} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: C.soft, color: C.accent }}>
              {chip}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={startInquiry}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '13px 0',
            borderRadius: 12,
            border: 'none',
            background: '#FEE500',
            color: '#191600',
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#191600" aria-hidden>
            <path d="M12 3.5C6.8 3.5 2.5 6.9 2.5 11c0 2.6 1.8 4.9 4.5 6.3-.2.7-.7 2.5-.8 2.9-.1.4.2.55.45.42.3-.16 2.6-1.78 3.55-2.42.55.08 1.12.12 1.7.12 5.2 0 9.5-3.4 9.5-7.6S17.2 3.5 12 3.5z" />
          </svg>
          카카오톡으로 문의
        </button>
        <p style={{ fontSize: 11.5, color: C.ink3, textAlign: 'center', margin: '10px 0 0' }}>
          운영자가 미리 확인하고 답변을 준비해요
        </p>
      </BottomSheet>
    </div>
  )
}
