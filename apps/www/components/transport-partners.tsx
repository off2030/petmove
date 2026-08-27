'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { orderedTransportPartners } from '@petmove/domain'

/**
 * 운송업체 연락 블록(www) — 앱과 **같은 목록**(@petmove/domain)을 쓴다. 업체가 바뀌면
 * 한 곳만 고치면 앱·홈페이지가 함께 바뀐다.
 *
 * 측정: 블록이 실제로 보인 순간 노출 1건, 연락 링크 탭·복사마다 클릭 1건. 앱 쪽과 같은
 * outbound_clicks 테이블에 쌓이고 source 로 갈린다('www-quote').
 *
 * 번호·메일을 **글자로 보여준다** — 앱(모바일 전용)과 달리 홈페이지는 PC 방문이 많은데,
 * tel:/mailto: 는 PC 에서 대개 아무 일도 일어나지 않는다. 링크만 두면 번호를 읽을 수조차
 * 없어 연락 자체가 막힌다. 대신 복사를 클릭으로 세어 측정을 잃지 않는다 — 복사도 연락
 * 시도라 tel/mail 과 같은 event 로 남긴다(테이블 제약도 이 4종뿐).
 *
 * 표기에 '제휴·추천·평가·가격'은 넣지 않는다(계약 관계 없음).
 */

const SOURCE = 'www-quote'

function send(payload: { event: string; source: string; partnerSlug?: string }) {
  try {
    const body = JSON.stringify(payload)
    // 끝 슬래시 필수 — www 는 trailingSlash:true 라 '/api/outbound' 는 308 로 튕긴다.
    // 페이지를 떠나는 중(tel:/mailto:)에 리다이렉트를 한 번 더 타면 전송이 위태롭다.
    const url = '/api/outbound/'
    // sendBeacon 은 페이지를 떠나도 전송이 보장된다(tel:/mailto: 로 이탈하는 경우).
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return
    void fetch(url, { method: 'POST', body, keepalive: true })
  } catch {
    /* 기록 실패가 연락을 막지 않는다 */
  }
}

/** 클립보드 API 가 막힌 환경(구형·비보안 컨텍스트)에서도 복사가 되게 한다. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function TransportPartners() {
  // 순서 회전 — 첫 자리 프리미엄이 업체 비교를 오염시키지 않게. 하루 단위로 바뀐다.
  const partners = useMemo(() => orderedTransportPartners(new Date().toISOString().slice(0, 10)), [])
  const ref = useRef<HTMLDivElement>(null)
  const logged = useRef(false)
  /** 방금 누른 항목의 결과 — 눌렀다는 걸 알려주는 짧은 피드백. */
  const [flash, setFlash] = useState<{ key: string; ok: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function onCopy(key: string, text: string, event: 'tel' | 'mail', slug: string) {
    const ok = await copyText(text)
    // 실패해도 반드시 표시한다 — 아무 반응이 없으면 눌렀는지조차 알 수 없다.
    // 번호는 화면에 글자로 있으니 직접 긁어 복사할 수 있다.
    if (ok) send({ event, source: SOURCE, partnerSlug: slug })
    setFlash({ key, ok })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(null), 1600)
  }

  return (
    <div ref={ref} className="partners">
      {partners.map((p) => {
        const rows = [
          { key: `${p.slug}-tel`, event: 'tel' as const, icon: 'ti-phone', href: `tel:${p.tel}`, value: p.tel },
          { key: `${p.slug}-mail`, event: 'mail' as const, icon: 'ti-mail', href: `mailto:${p.email}`, value: p.email },
        ]
        return (
          <div key={p.slug} className="partner">
            <div className="partner-name">{p.name}</div>
            {/* 견적 문의 폼 — PC 에서 그대로 열리므로 복사 버튼이 필요 없다. */}
            <div className="partner-row">
              <a
                href={p.web}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => send({ event: 'web', source: SOURCE, partnerSlug: p.slug })}
              >
                <i className="ti ti-file-text" aria-hidden />
                <span className="partner-val">견적 문의하기</span>
              </a>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="partner-row">
                <a
                  href={r.href}
                  onClick={() => send({ event: r.event, source: SOURCE, partnerSlug: p.slug })}
                >
                  <i className={`ti ${r.icon}`} aria-hidden />
                  <span className="partner-val">{r.value}</span>
                </a>
                <button
                  type="button"
                  className={`partner-copy${flash?.key === r.key && !flash.ok ? ' is-fail' : ''}`}
                  onClick={() => onCopy(r.key, r.value, r.event, p.slug)}
                >
                  {flash?.key === r.key ? (flash.ok ? '복사됨' : '직접 복사해 주세요') : '복사'}
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
