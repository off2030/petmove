'use client'

import { useEffect } from 'react'

/**
 * 운송업체 안내 페이지로 가는 링크의 클릭을 **전역에서** 센다.
 *
 * 왜 전역인가: 이 링크는 글이 늘어날수록 여기저기 붙는다. 링크마다 onClick 을 달면
 * 새 글을 쓸 때마다 빠뜨리게 되고, 콘텐츠가 JSON 문자열이라 애초에 달 수도 없다.
 * 문서 전체에 클릭 하나만 걸어두면 **앞으로 생길 링크까지 자동으로 잡힌다.**
 *
 * 어느 글에서 눌렀는지는 그때의 경로(글 슬러그)로 남긴다 — source 를 글마다 늘리면
 * 집계 축이 쪼개져서, 자리 이름은 'www-article' 하나로 두고 글은 stepId 로 가른다.
 *
 * 안내 페이지 자신에서 눌린 것은 세지 않는다(제 페이지 안의 이동은 유입이 아니다).
 */

const TARGET = '/docs/pet-transport-quote/'

export function TransportLinkTracker() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.('a')
      if (!el) return
      const href = el.getAttribute('href') ?? ''
      if (!href.includes(TARGET)) return
      // 안내 페이지 안에서의 이동은 유입이 아니다.
      if (window.location.pathname.startsWith(TARGET)) return

      const body = JSON.stringify({
        event: 'guide_link',
        source: 'www-article',
        // 앞뒤 슬래시를 떼고 글 슬러그만 남긴다(/docs/foo/ → docs/foo).
        stepId: window.location.pathname.replace(/^\/|\/$/g, '') || 'home',
      })
      try {
        // 페이지를 떠나는 중이라도 전송이 보장되게. 끝 슬래시 필수(trailingSlash:true).
        if (navigator.sendBeacon?.('/api/outbound/', new Blob([body], { type: 'application/json' })))
          return
        void fetch('/api/outbound/', { method: 'POST', body, keepalive: true })
      } catch {
        /* 기록 실패가 이동을 막지 않는다 */
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
