'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef } from 'react'
import { buildCaseJourneyContext, orderedTransportPartners } from '@petmove/domain'
import { C } from '@/lib/palette'
import { monoCap } from '@/components/me/settings-shared'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { logOutbound, type OutboundSource } from '@/lib/actions/outbound'

/**
 * 운송업체 연락 블록 — 여정 '운송 예약' 카드와 운송업체 견적 안내 페이지가 함께 쓴다.
 *
 * 협의 전 트래픽 실험 — "우리 고객이 운송업체를 실제로 찾는가"를 숫자로 먼저 본다.
 *  - 노출: 블록이 **화면에 실제로 보인** 순간 1건(IntersectionObserver). 화면 맨 아래라
 *    스크롤 안 하면 안 보이는데 그걸 노출로 세면 클릭률이 왜곡된다.
 *  - 클릭: 전화·메일 버튼. 번호를 평문으로 안 두는 이유가 이것 — 글자로 박아두면 읽고
 *    나가서 따로 걸어 아무 기록도 안 남는다. 모바일에선 버튼이 UX 도 더 낫다.
 *
 * 표기: '제휴'·'추천'·평가·가격 없음. 계약 관계가 아니라는 걸 문구로 명시한다.
 *
 * 시각: 연락 링크는 앱의 기존 '연락처' 패턴(검역소 연락처·일본 공항검역·담당 병원 카드)과
 * 같은 종족 — accent 인라인 링크 + 13px 아이콘, 테두리·배경 없음. 테두리 있는 알약 버튼은
 * 이 맥락에서 광고 배너처럼 읽혀서 쓰지 않는다.
 */

export function TransportPartners({
  source,
  caseId = null,
  destination = null,
  intro = true,
  moreHref,
}: {
  /** 노출 자리 — 집계를 자리별로 가른다. 이걸 안 나누면 클릭률이 뒤섞여 무의미해진다. */
  source: OutboundSource
  caseId?: string | null
  destination?: string | null
  /** 안내 문구 표시 — 페이지 본문이 이미 설명했으면 끈다. */
  intro?: boolean
  /** 있으면 카드 하단에 견적 안내 페이지로 가는 줄을 붙인다(여정 카드용). */
  moreHref?: string
}) {
  // 순서 회전 seed — 케이스가 없으면(견적 페이지) 고정 seed. 한 사람에게 순서가 안 흔들린다.
  const partners = useMemo(() => orderedTransportPartners(caseId ?? 'guide'), [caseId])
  // activeDest 는 다중 목적지의 `?dest=` 토큰이라 단일 목적지 케이스에선 null 이다.
  // 그대로 기록하면 나라별 집계가 전부 '(미지정)'이 된다 — 케이스의 실제 목적지로 채운다.
  const caseRow = useCase(caseId ?? '')
  const dest =
    destination ?? (caseRow ? buildCaseJourneyContext(caseRow).destinationToken : null) ?? null
  const ref = useRef<HTMLDivElement>(null)
  const logged = useRef(false)

  // 실제로 보였을 때만 노출 1건. 한 번 기록하면 관찰을 끊는다.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (logged.current) return
        logged.current = true
        void logOutbound({ event: 'impression', source, destination: dest, caseId })
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [caseId, dest, source])

  function onContact(partnerSlug: string, event: 'tel' | 'mail' | 'web') {
    // 기다리지 않는다 — tel:/mailto: 기본 동작이 즉시 이어져야 한다.
    void logOutbound({ event, source, partnerSlug, destination: dest, caseId })
  }

  // 검역소 연락처·담당 병원 카드와 동일 — accent 텍스트 + 13px 아이콘. 세로 패딩은
  // 터치 영역용(시각적으로는 안 보인다).
  const link = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 0',
    color: C.accent,
    fontSize: 13,
    textDecoration: 'none',
    fontFamily: 'inherit',
  } as const

  return (
    <section ref={ref} style={{ marginTop: 22 }}>
      {intro && <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>운송업체</h3>}

      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 14,
          padding: '14px 16px',
        }}
      >
        {intro && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.ink2 }}>
            반려동물 운송을 대행하는 업체예요. 펫무브와 계약 관계는 아니고, 공개된 대표
            연락처를 안내해 드려요.
          </p>
        )}

        <div style={{ marginTop: intro ? 14 : 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {partners.map((p, i) => {
            // 첫 업체 위의 선은 안내 문구와 목록을 가르는 용도다. 문구가 없는 화면
            // (가이드 페이지)에선 카드 테두리 바로 아래 뜬금없이 그어져 지운다.
            const topLine = i > 0 || intro
            return (
            <div
              key={p.slug}
              style={{
                paddingTop: topLine ? 12 : 0,
                borderTop: topLine ? `.5px solid ${C.line}` : undefined,
              }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 1 }}>
                <a
                  href={`tel:${p.tel}`}
                  onClick={() => onContact(p.slug, 'tel')}
                  style={link}
                  aria-label={`${p.name} 전화하기`}
                >
                  <IconPhone />
                  전화하기
                </a>
                <a
                  href={`mailto:${p.email}`}
                  onClick={() => onContact(p.slug, 'mail')}
                  style={link}
                  aria-label={`${p.name} 이메일 보내기`}
                >
                  <IconMail />
                  메일 보내기
                </a>
                <a
                  href={p.web}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onContact(p.slug, 'web')}
                  style={link}
                  aria-label={`${p.name} 견적 문의하기`}
                >
                  <IconForm />
                  견적 문의
                </a>
              </div>
            </div>
            )
          })}
        </div>

        {/* 가이드 페이지(intro=false)엔 안내 문구를 두지 않는다 — 목록만 남긴다. */}
        {intro && (
          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: C.ink3 }}>
            비용·조건은 업체에 직접 확인해 주세요.
          </p>
        )}

        {moreHref && (
          <Link
            href={moreHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 12,
              paddingTop: 12,
              borderTop: `.5px solid ${C.line}`,
              width: '100%',
              color: C.accent,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            견적은 어떻게 받나요?
            <span style={{ color: C.ink3 }}>→</span>
          </Link>
        )}
      </div>
    </section>
  )
}

/* 아이콘은 기존 연락처 화면(guide/jp-quarantine-contacts)과 같은 path·굵기를 쓴다. */
function IconPhone() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

/** 견적 문의 폼 — 업체 사이트의 신청서로 나간다. 같은 굵기·크기의 문서 아이콘. */
function IconForm() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}
