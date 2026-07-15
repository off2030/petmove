'use client'

// 목차 — 본문(.prose)의 h2(부족하면 h3)가 3개 이상이면 맨 위에 자동 삽입.
// 본문이 dangerouslySetInnerHTML 이라 마운트 후 DOM 에서 생성(article-sample 스크립트 이식).
import { useEffect } from 'react'

export function Toc() {
  useEffect(() => {
    const p = document.querySelector('.prose')
    if (!p || p.querySelector('.toc')) return
    let hs = p.querySelectorAll('h2')
    if (hs.length < 3) hs = p.querySelectorAll('h3')
    if (hs.length < 3) return
    const t = document.createElement('nav')
    t.className = 'toc'
    const h = document.createElement('div')
    h.className = 'toc-h'
    h.textContent = '목차'
    t.appendChild(h)
    hs.forEach((el, i) => {
      if (!el.id) el.id = `sec-${i + 1}`
      const a = document.createElement('a')
      a.href = `#${el.id}`
      a.textContent = el.textContent ?? ''
      t.appendChild(a)
    })
    p.insertBefore(t, p.firstChild)
  }, [])
  return null
}
