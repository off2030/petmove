'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CaseRow } from '@petmove/domain'
import destsData from '@petmove/domain/data/destinations.json'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { StartHereEmpty } from '@/components/portal-shell/start-here-empty'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { SegmentField, type FieldOption } from '@/components/fields/info-fields'
import { C, serif, SectionCard } from '@/components/me/settings-shared'
import { buildProfileView } from '@/lib/profile/catalog'
import { notifyServiceInquiry } from '@/lib/actions/service-inquiry'

/**
 * 서비스 탭 (/services) — 펫무브 유료 상품 안내. 목적지 + 여정 유형(왕복·편도) 인식형.
 *
 * 서비스 내용·비용은 목적지와 왕복/편도에 따라 달라진다.
 *  - 목적지 선택지 = '서비스 제공 국가' 큐레이션 목록(OFFERED_KO). 처음부터 검색 시트로
 *    — 목록이 늘어나도 버튼으로 감당 안 되므로. 새 나라 준비되면 OFFERED_KO 에 push.
 *  - 기본 목적지 = 등록 시 신청한 목적지가 목록에 있으면 그것, 없으면 목록 첫 번째.
 *  - 왕복/편도 = 등록값을 기본 표시 + 여기서도 전환. 단, 이 선택은 **둘러보기용 로컬 상태**라
 *    실제 여정의 trip_type 을 바꾸지 않는다(목록엔 미등록 목적지도 있어 저장 대상이 아님).
 *
 * 두 갈래: 오프라인(방문 올케어, 전체 대행) / 온라인(가이드 & 점검, 직접+도움).
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
 * 한 (목적지 × 여정유형)의 두 서비스 카드. 지금은 인자와 무관하게 동일 generic —
 * 목적지·유형별 내용·비용은 차차 여기서 분기한다(예: 편도면 귀국 관련 항목 제외, 비용 등).
 */
function buildOffers(_dest: string | null, _trip: TripType): Offer[] {
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

/** 목적지 검색 시트 trigger 행 — 탭하면 BottomSheet(검색 + 목록). */
function DestinationField({ selected, onOpen }: { selected: Dest | null; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        minHeight: 46,
        padding: '11px 0',
        borderBottom: `.5px solid ${C.line}`,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 13, color: C.ink2, flexShrink: 0, width: 88 }}>목적지</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: C.ink, fontFamily: 'var(--pm-font-display)' }}>
          {selected?.ko ?? '선택'}
        </span>
        {selected?.en && <span style={{ fontSize: 13, color: C.ink3 }}>{selected.en}</span>}
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <path d="M8 10l4 4 4-4" />
      </svg>
    </button>
  )
}

export function ServicesView() {
  const { cases, profile, userEmail } = useCases()

  // 기본 목적지 = 등록 시 신청한 목적지가 서비스 제공 목록에 있으면 그것, 없으면 첫 번째(일본).
  const registered = destinationsFromCases(cases)
  const defaultDestKo = registered.find((d) => OFFERED_KO.includes(d)) ?? OFFERED_KO[0]
  const [pickedKo, setPickedKo] = useState<string | null>(null)
  const selectedKo = pickedKo && OFFERED_KO.includes(pickedKo) ? pickedKo : defaultDestKo
  const selected = OFFERED.find((d) => d.ko === selectedKo) ?? { ko: selectedKo, en: '' }

  // 왕복/편도 = 등록값 기본 + 로컬 전환(둘러보기용, 저장 X). 목적지 바뀌면 그 목적지 등록값으로.
  const defaultTrip = tripTypeForDest(cases, selectedKo)
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
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>
          서비스
        </h1>
        <p style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.6, margin: '10px 0 0' }}>
          출국 준비를 펫무브가 함께할게요. 맡기실지, 직접 하며 도움받으실지 골라보세요.
        </p>

        <SectionCard marginTop={18}>
          <DestinationField
            selected={selected}
            onOpen={() => {
              setQuery('')
              setSheetOpen(true)
            }}
          />
          <SegmentField
            label="왕복·편도"
            value={trip}
            onChange={(v) => setTripOverride({ dest: selectedKo, trip: v === 'one_way' ? 'one_way' : 'round' })}
            options={TRIP_OPTIONS}
            last
          />
        </SectionCard>

        <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6, margin: '12px 4px 0' }}>
          {selected.ko} · {tripLabel} 기준으로 안내해 드려요.
        </p>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {offers.map((o) => (
            <ServiceCard key={o.title} offer={o} />
          ))}
        </div>

        <p style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6, margin: '20px 4px 0' }}>
          상담 신청과 가격 안내는 곧 추가될 예정이에요.
        </p>
      </div>

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
