'use client'

import { useEffect, useMemo, useRef } from 'react'
import { orderedTransportPartners } from '@petmove/domain'

/**
 * 운송업체 연락 블록(www) — 앱과 **같은 목록**(@petmove/domain)을 쓴다. 업체가 바뀌면
 * 한 곳만 고치면 앱·홈페이지가 함께 바뀐다.
 *
 * 측정: 블록이 실제로 보인 순간 노출 1건, 연락 링크 탭마다 클릭 1건. 앱 쪽과 같은
 * outbound_clicks 테이블에 쌓이고 source 로 갈린다('www-quote').
 *
 * 전화번호를 평문으로 렌더하지 않는다 — 글자로 박아두면 읽고 나가서 따로 걸어 아무
 * 기록도 안 남는다. 표기에 '제휴·추천·평가·가격'은 넣지 않는다(계약 관계 없음).
 */

const SOURCE = 'www-quote'

function send(payload: { event: string; source: string; partnerSlug?: string }) {
  try {
    const body = JSON.stringify(payload)
    // sendBeacon 은 페이지를 떠나도 전송이 보장된다(tel:/mailto: 로 이탈하는 경우).
    if (navigator.sendBeacon?.('/api/outbound', new Blob([body], { type: 'application/json' }))) return
    void fetch('/api/outbound', { method: 'POST', body, keepalive: true })
  } catch {
    /* 기록 실패가 연락을 막지 않는다 */
  }
}

export function TransportPartners() {
  // 순서 회전 — 첫 자리 프리미엄이 업체 비교를 오염시키지 않게. 하루 단위로 바뀐다.
  const partners = useMemo(() => orderedTransportPartners(new Date().toISOString().slice(0, 10)), [])
  const ref = useRef<HTMLDivElement>(null)
  const logged = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (logged.current) return
        logged.current = true
        send({ event: 'impression', source: SOURCE })
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="partners">
      {partners.map((p) => (
        <div key={p.slug} className="partner">
          <div className="partner-name">{p.name}</div>
          <div className="partner-links">
            <a
              href={`tel:${p.tel}`}
              onClick={() => send({ event: 'tel', source: SOURCE, partnerSlug: p.slug })}
            >
              <i className="ti ti-phone" aria-hidden />
              전화하기
            </a>
            <a
              href={`mailto:${p.email}`}
              onClick={() => send({ event: 'mail', source: SOURCE, partnerSlug: p.slug })}
            >
              <i className="ti ti-mail" aria-hidden />
              메일 보내기
            </a>
          </div>
        </div>
      ))}
      <p className="partner-note">순서는 무작위예요. 비용·조건은 업체에 직접 확인해 주세요.</p>
    </div>
  )
}
