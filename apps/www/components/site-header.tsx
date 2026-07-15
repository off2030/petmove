'use client'

// 공통 헤더 + 모바일 드로어 — 프로토타입의 burger/drawer DOM 스크립트를 React 상태로 이식.
import { useState } from 'react'
import { LogoMark } from '@/components/logo-mark'
import { AppLink } from '@/components/app-link'

export function SiteHeader({ active }: { active?: 'service' | 'guide' | 'contact' }) {
  const [open, setOpen] = useState(false)
  const cls = (name: string) => (name === active ? 'on' : undefined)

  return (
    <>
      <header>
        <div className="container">
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogoMark />
            <span className="wm">펫무브</span>
          </a>
          <span className="nav-links">
            <a href="/#service" className={cls('service')}>서비스</a>
            <a href="/guide/" className={cls('guide')}>가이드</a>
            <a href="/contact/" className={cls('contact')}>문의</a>
          </span>
          <span className="nav-right">
            <AppLink className="nav-app">앱 다운로드</AppLink>
            <i
              className="ti ti-menu-2 burger"
              role="button"
              tabIndex={0}
              aria-label="메뉴"
              onClick={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(true)
                }
              }}
            />
          </span>
        </div>
      </header>
      <div className={`drawer-ov${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`drawer${open ? ' open' : ''}`} onClick={(e) => {
        if ((e.target as HTMLElement).tagName === 'A') setOpen(false)
      }}>
        <button className="drawer-close" aria-label="닫기" onClick={() => setOpen(false)}>
          <i className="ti ti-x" />
        </button>
        <nav className="drawer-nav">
          <a href="/">홈</a>
          <a href="/#service">서비스</a>
          <a href="/guide/">가이드</a>
          <a href="/contact/">문의</a>
        </nav>
        <AppLink className="drawer-app">앱 다운로드</AppLink>
      </aside>
    </>
  )
}
