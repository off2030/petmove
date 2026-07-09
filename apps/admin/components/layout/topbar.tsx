'use client'

import { Folder, LayoutGrid, Bell, Settings, Menu, Monitor, Sun, Moon, Shield, User, LogOut, UserCog, X } from 'lucide-react'
import { SkinPicker } from './skin-picker'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaccineLookups } from '@/components/providers/vaccine-data-provider'
import { useDarkMode } from '@/lib/use-dark-mode'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export type TabId = 'cases' | 'calculator' | 'messages' | 'settings' | 'super-admin'

export const NAV_ITEMS: Array<{ id: TabId; icon: typeof Folder; label: string }> = [
  { id: 'cases', icon: Folder, label: '홈' },
  { id: 'calculator', icon: LayoutGrid, label: '도구' },
  { id: 'messages', icon: Bell, label: '알림' },
]

// 좌측 상단 로고 시안 — 시안 비교용.
//   text         : 기존 한글 워드마크 (펫무브워크)
//   wordmark     : PETMOVE / WORK 영문 두 줄 (Bodoni)
//   full         : 사람+강아지 일러스트 + PETMOVE / WORK (정사각형)
//   alonzo       : PETMOVE 단일 워드 SVG (Alonzo Extralight, Bold weight)
//   alonzo-text  : "PETMOVE Work" HTML 텍스트 (self-hosted Alonzo Cnd, bold)
//   icon-text    : 마스터 아이콘(icon.svg) + "PETMOVE Work" HTML 텍스트 (웹 기본 폰트)
const LOGO_VARIANT: 'text' | 'wordmark' | 'full' | 'alonzo' | 'alonzo-text' | 'icon-text' = 'icon-text'

function LogoMark() {
  if (LOGO_VARIANT === 'icon-text') {
    // 마스터 아이콘(발바닥 마크) + 기본 웹 폰트 워드마크. 아이콘은 100x100 라운드.
    return (
      <span className="inline-flex items-center gap-2">
        <img
          src="/icon.svg"
          alt=""
          aria-hidden
          className="h-7 w-7 select-none rounded-[6px]"
          draggable={false}
        />
        <span className="inline-flex items-baseline gap-[5px] text-foreground leading-none whitespace-nowrap">
          <span className="text-[18px] font-semibold tracking-tight">PETMOVE</span>
          <span className="text-[13px] font-medium tracking-wide text-muted-foreground">Work</span>
        </span>
      </span>
    )
  }
  if (LOGO_VARIANT === 'text') {
    return (
      <span className="font-serif text-[18px] font-medium tracking-tight text-foreground whitespace-nowrap">
        펫무브워크
      </span>
    )
  }
  if (LOGO_VARIANT === 'alonzo-text') {
    // self-hosted Alonzo ExtraLight + faux bold (font-weight: 700) — 두 줄 워드마크.
    return (
      <span
        style={{ fontFamily: "'Alonzo', 'Bodoni Moda', 'Playfair Display', serif" }}
        className="inline-flex items-baseline gap-[6px] text-foreground leading-none whitespace-nowrap"
      >
        <span className="text-[19px] font-bold tracking-wide">PETMOVE</span>
        <span className="text-[12px] font-bold tracking-[0.18em]">Work</span>
      </span>
    )
  }
  if (LOGO_VARIANT === 'wordmark') {
    // 600x220 viewBox → h-10 (40px) 기준 가로 ~109px
    return (
      <img
        src="/logo/petmove-wordmark.svg"
        alt="펫무브워크"
        className="h-10 w-auto select-none"
        draggable={false}
      />
    )
  }
  if (LOGO_VARIANT === 'alonzo') {
    // 600x140 viewBox → h-7 (28px) 기준 가로 ~120px
    return (
      <img
        src="/logo/petmove-alonzo.svg"
        alt="PETMOVE"
        className="h-7 w-auto select-none"
        draggable={false}
      />
    )
  }
  // full — 1083x865 → h-12 기준 가로 ~60px
  return (
    <img
      src="/logo/petmove-full.svg"
      alt="펫무브워크"
      className="h-12 w-auto select-none"
      draggable={false}
    />
  )
}

type TopBarProps = {
  /**
   * Currently active dashboard tab. `null`/undefined = no dashboard tab active
   * (e.g. when mounted on /super-admin).
   */
  activeTab?: TabId | null
  /**
   * Callback-driven tab switching — used by `DashboardShell` to swap mounted
   * panels without a full navigation. If omitted, tabs render as `<Link>` and
   * trigger real navigation (used from standalone pages like /super-admin).
   */
  onTabChange?: (tab: TabId) => void
  isSuperAdmin?: boolean
  userEmail?: string | null
  userName?: string | null
  userAvatarUrl?: string | null
  /** Highlight the Shield icon to indicate we're currently on /super-admin. */
  superAdminActive?: boolean
  /** 메시지 탭 위 안 읽은 메시지 수 — 0 이면 뱃지 미표시. */
  messagesUnread?: number
}

export function TopBar({
  activeTab = null,
  onTabChange,
  isSuperAdmin = false,
  userEmail,
  userName = null,
  userAvatarUrl = null,
  superAdminActive = false,
  messagesUnread = 0,
}: TopBarProps) {
  const vaccineLookups = useVaccineLookups()
  const expiringCount = useMemo(() => vaccineLookups.countExpiringProducts(), [vaccineLookups])
  const { mode, cycle } = useDarkMode()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Drawer 가 열렸을 때 — ESC 키로 닫고, body scroll 잠금.
  // outside-click 은 backdrop 이 처리하므로 별도 mousedown handler 불필요.
  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [menuOpen])

  useEffect(() => {
    if (!userMenuOpen) return
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  const tabClass = (active: boolean) =>
    cn(
      'relative h-9 inline-flex items-center gap-sm px-sm rounded-md transition-colors text-sm font-medium whitespace-nowrap',
      active
        ? 'bg-accent text-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )

  function tabBadge(id: TabId) {
    if (id !== 'messages' || messagesUnread <= 0) return null
    return (
      <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white font-mono text-[10px] font-semibold leading-none">
        {messagesUnread > 99 ? '99+' : messagesUnread}
      </span>
    )
  }

  const mobileTabClass = (active: boolean) =>
    cn(
      'w-full flex items-center gap-sm rounded-sm px-sm py-2 text-sm transition-colors',
      active
        ? 'bg-accent text-foreground font-medium'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )

  const iconSlotClass = (active: boolean) =>
    cn(
      'relative h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors',
      active
        ? 'bg-accent text-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )

  const settingsActive = activeTab === 'settings'

  // 홈 탭 클릭 시 case-list 의 mode 도 '목록'으로 리셋 (검사/신고/서류 모드 해제).
  function dispatchHomeReset() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('home-list-reset'))
    }
  }

  return (
    <header className="shrink-0 h-14 w-full flex items-center gap-lg px-md border-b border-border/80 bg-background">
        {/* Mobile hamburger — left side, hidden on md+ */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
          className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Menu size={20} />
        </button>

        {/* Mobile drawer — backdrop + slide-in panel.
            항상 마운트하고 transform/opacity 로 enter/exit (애니메이션 자연스럽게). */}
        <div
          className={cn(
            'fixed inset-0 z-50 md:hidden transition-opacity duration-200',
            menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          aria-hidden={!menuOpen}
        >
          {/* Backdrop — 클릭 시 닫힘 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />

          {/* Panel — 좌측에서 슬라이드, safe-area 패딩 */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="메인 메뉴"
            className={cn(
              'absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] flex flex-col bg-popover border-r border-border shadow-xl',
              'transform transition-transform duration-200 pt-safe-t pb-safe-b pl-safe-l',
              menuOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {/* Drawer 헤더 — 로고 + 닫기 */}
            <div className="shrink-0 flex items-center justify-between h-14 px-md border-b border-border/80">
              <LogoMark />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="메뉴 닫기"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 메인 nav + 보조 메뉴 (스크롤 가능)
                홈/도구/메시지는 데스크톱 우측 nav 와 동일하게 텍스트만 (87259c2 와 일관). */}
            <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-xs">
              {NAV_ITEMS.map(({ id, label }) => {
                const active = activeTab === id
                const close = () => setMenuOpen(false)
                if (onTabChange) {
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onTabChange(id)
                        if (id === 'cases') dispatchHomeReset()
                        close()
                      }}
                      className={mobileTabClass(active)}
                    >
                      <span>{label}</span>
                      {tabBadge(id)}
                    </button>
                  )
                }
                return (
                  <Link
                    key={id}
                    href={`/${id}`}
                    prefetch={false}
                    onClick={() => {
                      if (id === 'cases') dispatchHomeReset()
                      close()
                    }}
                    className={mobileTabClass(active)}
                  >
                    <span>{label}</span>
                    {tabBadge(id)}
                  </Link>
                )
              })}

              {/* 다크모드 토글은 topbar 우측 끝(모바일 전용 버튼)으로 이전됨 */}
            </nav>

            {/* 푸터 — 사용자 정보 + 로그아웃 (프로필 수정은 데스크톱 우측 메뉴에서만) */}
            <div className="shrink-0 border-t border-border/80 p-2 space-y-1">
              {(userAvatarUrl || userName || userEmail) && (
                <div className="flex items-center gap-sm px-sm py-2">
                  <Avatar
                    size="sm"
                    label={avatarInitial(userName || userEmail || '?')}
                    imageUrl={userAvatarUrl}
                  />
                  <div className="flex-1 min-w-0">
                    {userName ? (
                      <>
                        <div className="text-sm font-medium text-foreground truncate">{userName}</div>
                        {userEmail && (
                          <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-foreground truncate">{userEmail}</div>
                    )}
                  </div>
                </div>
              )}
              <a href="/logout" className={mobileTabClass(false)}>
                <LogOut size={16} className="shrink-0" />
                <span>로그아웃</span>
              </a>
            </div>
          </aside>
        </div>

        {/* App name / logo — 시안은 LOGO_VARIANT 상수로 전환. 항상 홈 목록 모드로 복귀. */}
        {onTabChange ? (
          <button
            type="button"
            onClick={() => { onTabChange('cases'); dispatchHomeReset() }}
            aria-label="홈"
            className="inline-flex items-center hover:opacity-70 transition-opacity"
          >
            <LogoMark />
          </button>
        ) : (
          <Link
            href="/cases"
            prefetch={false}
            onClick={dispatchHomeReset}
            aria-label="홈"
            className="inline-flex items-center hover:opacity-70 transition-opacity"
          >
            <LogoMark />
          </Link>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* 모바일 전용 — topbar 우측 끝 팔레트 + 다크모드. gap-xs 로 묶어
            header gap-lg 영향 회피. 데스크톱은 아래 우측 아이콘 영역에 동일 기능. */}
        <div className="md:hidden flex items-center gap-xs">
        <SkinPicker />
        <button
          type="button"
          onClick={cycle}
          suppressHydrationWarning
          title={`테마: ${mode === 'system' ? '시스템' : mode === 'light' ? '라이트' : '다크'} (클릭하여 전환)`}
          aria-label="테마 전환"
          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {/* 3개 아이콘 모두 렌더하고 CSS 가 [html data-theme] 따라 하나만 표시 —
              인라인 부트 스크립트가 hydration 전에 data-theme 박아 swap 깜빡임 제거. */}
          <Monitor size={18} className="theme-icon-system" />
          <Sun size={18} className="theme-icon-light" />
          <Moon size={18} className="theme-icon-dark" />
        </button>
        </div>

        {/* Nav tabs — right side, hidden on mobile (replaced by hamburger).
            '알림'은 텍스트 탭이 아니라 우측 아이콘 영역(설정 왼쪽)에 종 아이콘으로 둔다. */}
        <nav className="hidden md:flex items-center gap-xs">
          {NAV_ITEMS.filter((item) => item.id !== 'messages').map(({ id, label }) => {
            const active = activeTab === id
            if (onTabChange) {
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onTabChange(id)
                    if (id === 'cases') dispatchHomeReset()
                  }}
                  className={tabClass(active)}
                >
                  <span>{label}</span>
                  {tabBadge(id)}
                </button>
              )
            }
            return (
              <Link
                key={id}
                href={`/${id}`}
                prefetch={false}
                onClick={() => { if (id === 'cases') dispatchHomeReset() }}
                className={tabClass(active)}
              >
                <span>{label}</span>
                {tabBadge(id)}
              </Link>
            )
          })}
        </nav>

        {/* Vertical divider — 데스크톱 전용 (모바일은 drawer 로 통합) */}
        <div className="hidden md:block h-6 w-px bg-foreground/20" aria-hidden />

        {/* Right-side actions — 모바일에서는 drawer 안으로 이전, 여기선 숨김 */}
        <div className="hidden md:flex items-center gap-xs">
          {isSuperAdmin && (
            onTabChange ? (
              <button
                type="button"
                onClick={() => onTabChange('super-admin')}
                title="Super Admin"
                aria-label="Super Admin"
                className={iconSlotClass(superAdminActive || activeTab === 'super-admin')}
              >
                <Shield size={18} />
              </button>
            ) : (
              <Link
                href="/super-admin"
                prefetch={false}
                title="Super Admin"
                aria-label="Super Admin"
                className={iconSlotClass(superAdminActive)}
              >
                <Shield size={18} />
              </Link>
            )
          )}
          <SkinPicker />
          <button
            type="button"
            onClick={cycle}
            suppressHydrationWarning
            title={`테마: ${mode === 'system' ? '시스템' : mode === 'light' ? '라이트' : '다크'} (클릭하여 전환)`}
            aria-label="테마 전환"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Monitor size={18} className="theme-icon-system" />
            <Sun size={18} className="theme-icon-light" />
            <Moon size={18} className="theme-icon-dark" />
          </button>
          {/* 알림 — 설정 왼쪽. 안 읽은 개수 배지 표시. */}
          {onTabChange ? (
            <button
              type="button"
              onClick={() => onTabChange('messages')}
              title={messagesUnread > 0 ? `안 읽은 알림 ${messagesUnread}개` : '알림'}
              aria-label="알림"
              className={iconSlotClass(activeTab === 'messages')}
            >
              <Bell size={18} />
              {messagesUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-white font-mono text-[9px] font-semibold leading-none flex items-center justify-center ring-2 ring-background">
                  {messagesUnread > 99 ? '99+' : messagesUnread}
                </span>
              )}
            </button>
          ) : (
            <Link
              href="/messages"
              prefetch={false}
              title={messagesUnread > 0 ? `안 읽은 알림 ${messagesUnread}개` : '알림'}
              aria-label="알림"
              className={iconSlotClass(false)}
            >
              <Bell size={18} />
              {messagesUnread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-destructive text-white font-mono text-[9px] font-semibold leading-none flex items-center justify-center ring-2 ring-background">
                  {messagesUnread > 99 ? '99+' : messagesUnread}
                </span>
              )}
            </Link>
          )}
          {onTabChange ? (
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              title="설정"
              className={iconSlotClass(settingsActive)}
            >
              <Settings size={18} />
              {expiringCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </button>
          ) : (
            <Link
              href="/settings"
              prefetch={false}
              title="설정"
              className={iconSlotClass(settingsActive)}
            >
              <Settings size={18} />
              {expiringCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Link>
          )}

          {/* 유저 메뉴 — 이메일 + 로그아웃 */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((p) => !p)}
              title={userEmail ?? '계정'}
              aria-label="계정 메뉴"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {userAvatarUrl || userName || userEmail ? (
                <Avatar
                  size="sm"
                  label={avatarInitial(userName || userEmail || '?')}
                  imageUrl={userAvatarUrl}
                />
              ) : (
                <User size={18} />
              )}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-md border border-border bg-popover p-1 shadow-md">
                {userEmail && (
                  <div className="px-sm py-2 text-xs text-muted-foreground border-b border-border/80 mb-1 truncate">
                    {userEmail}
                  </div>
                )}
                {onTabChange ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      onTabChange('settings')
                      window.history.replaceState(null, '', '/settings#profile')
                      window.dispatchEvent(new HashChangeEvent('hashchange'))
                    }}
                    className="w-full flex items-center gap-sm rounded-sm px-sm py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <UserCog size={16} className="shrink-0" />
                    <span>프로필 수정</span>
                  </button>
                ) : (
                  <Link
                    href="/settings#profile"
                    prefetch={false}
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-sm rounded-sm px-sm py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <UserCog size={16} className="shrink-0" />
                    <span>프로필 수정</span>
                  </Link>
                )}
                <a
                  href="/logout"
                  className="w-full flex items-center gap-sm rounded-sm px-sm py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <LogOut size={16} className="shrink-0" />
                  <span>로그아웃</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </header>
  )
}
