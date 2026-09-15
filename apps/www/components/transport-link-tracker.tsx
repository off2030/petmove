'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * 운송업체 안내 페이지로 가는 링크의 **노출·클릭**을 전역에서 센다.
 *
 * 왜 전역인가: 이 링크는 글이 늘어날수록 여기저기 붙는다. 링크마다 핸들러를 달면 새 글을
 * 쓸 때마다 빠뜨리게 되고, 콘텐츠가 JSON 문자열이라 애초에 달 수도 없다. 문서 전체에
 * 하나만 걸어두면 **앞으로 생길 링크까지 자동으로 잡힌다.**
 *
 * 노출을 함께 세는 이유: 클릭만 있으면 분모가 없다. 앱 쪽은 여정 카드 버튼의 노출을 재서
 * '본 N명 중 M명이 눌렀다'가 나오는데, 홈페이지만 클릭 수 하나로 남으면 두 채널을 같은
 * 잣대로 못 본다. 글 안의 링크가 실제로 화면에 보인 순간을 글당 1건으로 남긴다.
 *
 * 어느 글에서인지는 그때의 경로(글 슬러그)로 남긴다 — source 를 글마다 늘리면 집계 축이
 * 쪼개져서, 자리 이름은 'www-article' 하나로 두고 글은 stepId 로 가른다.
 *
 * 안내 페이지 자신에서의 이동은 세지 않는다(제 페이지 안의 이동은 유입이 아니다).
 */

const TARGET = '/docs/pet-transport-quote/'

function send(body: string) {
  try {
    // 페이지를 떠나는 중이라도 전송이 보장되게. 끝 슬래시 필수(trailingSlash:true).
    if (navigator.sendBeacon?.('/api/outbound/', new Blob([body], { type: 'application/json' })))
      return
    void fetch('/api/outbound/', { method: 'POST', body, keepalive: true })
  } catch {
    /* 기록 실패가 이동을 막지 않는다 */
  }
}

/** 앞뒤 슬래시를 떼고 글 슬러그만 남긴다(/docs/foo/ → docs/foo). */
function slug(): string {
  return window.location.pathname.replace(/^\/|\/$/g, '') || 'home'
}

export function TransportLinkTracker() {
  const pathname = usePathname()

  // ── 클릭 ──
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.('a')
      if (!el) return
      const href = el.getAttribute('href') ?? ''
      if (!href.includes(TARGET)) return
      if (window.location.pathname.startsWith(TARGET)) return
      send(JSON.stringify({ event: 'guide_link', source: 'www-article', stepId: slug() }))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // ── 노출 ── 링크가 화면에 실제로 보인 순간 글당 1건. 글이 바뀌면 다시 센다.
  useEffect(() => {
    if (window.location.pathname.startsWith(TARGET)) return
    if (typeof IntersectionObserver === 'undefined') return
    const links = document.querySelectorAll<HTMLAnchorElement>(`a[href*="${TARGET}"]`)
    if (links.length === 0) return
    let logged = false
    const io = new IntersectionObserver(
      (entries) => {
        if (logged || !entries.some((en) => en.isIntersecting)) return
        logged = true
        io.disconnect()
        send(JSON.stringify({ event: 'impression', source: 'www-article', stepId: slug() }))
      },
      { threshold: 0.5 },
    )
    links.forEach((l) => io.observe(l))
    return () => io.disconnect()
  }, [pathname])

  return null
}
