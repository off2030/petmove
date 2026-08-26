'use client'

import { useEffect, useMemo, useRef } from 'react'
import { buildCaseJourneyContext, orderedTransportPartners } from '@petmove/domain'
import { C } from '@/lib/palette'
import { monoCap } from '@/components/me/settings-shared'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { logOutbound } from '@/lib/actions/outbound'

/**
 * 운송 예약 / 항공권 구매 카드 하단의 운송업체 안내.
 *
 * 협의 전 트래픽 실험 — "우리 고객이 운송업체를 실제로 찾는가"를 숫자로 먼저 본다.
 *  - 노출: 블록이 **화면에 실제로 보인** 순간 1건(IntersectionObserver). 화면 맨 아래라
 *    스크롤 안 하면 안 보이는데 그걸 노출로 세면 클릭률이 왜곡된다.
 *  - 클릭: 전화·메일 버튼. 번호를 평문으로 안 두는 이유가 이것 — 글자로 박아두면 읽고
 *    나가서 따로 걸어 아무 기록도 안 남는다. 모바일에선 버튼이 UX 도 더 낫다.
 *
 * 표기: '제휴'·'추천'·평가·가격 없음. 계약 관계가 아니라는 걸 문구로 명시한다.
 */

const SOURCE = 'journey-flight-step'

export function TransportPartners({
  caseId,
  destination,
}: {
  caseId: string
  destination: string | null
}) {
  const partners = useMemo(() => orderedTransportPartners(caseId), [caseId])
  // activeDest 는 다중 목적지의 `?dest=` 토큰이라 단일 목적지 케이스에선 null 이다.
  // 그대로 기록하면 나라별 집계가 전부 '(미지정)'이 된다 — 케이스의 실제 목적지로 채운다.
  const caseRow = useCase(caseId)
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
        void logOutbound({ event: 'impression', source: SOURCE, destination: dest, caseId })
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [caseId, dest])

  function onContact(partnerSlug: string, event: 'tel' | 'mail') {
    // 기다리지 않는다 — tel:/mailto: 기본 동작이 즉시 이어져야 한다.
    void logOutbound({ event, source: SOURCE, partnerSlug, destination: dest, caseId })
  }

  const btn = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 13px',
    borderRadius: 999,
    border: `.5px solid ${C.line}`,
    background: C.surface,
    color: C.ink,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    fontFamily: 'inherit',
  } as const

  return (
    <section ref={ref} style={{ marginTop: 22 }}>
      <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>운송업체</h3>

      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 14,
          padding: '14px 16px',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.ink2 }}>
          반려동물 운송을 대행하는 업체예요. 펫무브와 계약 관계는 아니고, 공개된 대표
          연락처를 안내해 드려요.
        </p>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {partners.map((p) => (
            <div
              key={p.slug}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                paddingTop: 12,
                borderTop: `.5px solid ${C.line}`,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{p.name}</span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <a
                  href={`tel:${p.tel}`}
                  onClick={() => onContact(p.slug, 'tel')}
                  style={btn}
                  aria-label={`${p.name} 전화하기`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                  </svg>
                  전화하기
                </a>
                <a
                  href={`mailto:${p.email}`}
                  onClick={() => onContact(p.slug, 'mail')}
                  style={btn}
                  aria-label={`${p.name} 이메일 보내기`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                  메일
                </a>
              </span>
            </div>
          ))}
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: C.ink3 }}>
          순서는 무작위예요. 비용·조건은 업체에 직접 확인해 주세요.
        </p>
      </div>
    </section>
  )
}
