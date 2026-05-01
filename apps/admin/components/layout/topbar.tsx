'use client'

import { Folder, LayoutGrid, MessageSquare, Settings, Menu, Monitor, Sun, Moon, Shield, User, LogOut, UserCog } from 'lucide-react'
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
  { id: 'messages', icon: MessageSquare, label: '메시지' },
]

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
  const { mode, mounted, cycle } = useDarkMode()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
      <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white font-mono text-[10px] font-semibold leading-none">
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
        <div className="relative md:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            aria-label="메뉴 열기"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md">
              {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
                const active = activeTab === id
                if (onTabChange) {
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onTabChange(id)
                        if (id === 'cases') dispatchHomeReset()
                        setMenuOpen(false)
                      }}
                      className={mobileTabClass(active)}
                    >
                      <Icon size={16} className="shrink-0" />
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
                      setMenuOpen(false)
                    }}
                    className={mobileTabClass(active)}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                    {tabBadge(id)}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* App name — serif wordmark. 항상 홈 목록 모드로 복귀 (검사/신고/서류 모드도 리셋). */}
        {onTabChange ? (
          <button
            type="button"
            onClick={() => { onTabChange('cases'); dispatchHomeReset() }}
            className="font-serif text-[18px] font-medium tracking-tight text-foreground whitespace-nowrap hover:opacity-70 transition-opacity"
          >
            펫무브워크
          </button>
        ) : (
          <Link
            href="/cases"
            prefetch={false}
            onClick={dispatchHomeReset}
            className="font-serif text-[18px] font-medium tracking-tight text-foreground whitespace-nowrap hover:opacity-70 transition-opacity"
          >
            펫무브워크
          </Link>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Nav tabs — right side, hidden on mobile (replaced by hamburger) */}
        <nav className="hidden md:flex items-center gap-xs">
          {NAV_ITEMS.map(({ id, label }) => {
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

        {/* Vertical divider */}
        <div className="h-6 w-px bg-foreground/20" aria-hidden />

        {/* Right-side actions */}
        <div className="flex items-center gap-xs">
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
          {mounted && (
            <button
              type="button"
              onClick={cycle}
              title={`테마: ${mode === 'system' ? '시스템' : mode === 'light' ? '라이트' : '다크'} (클릭하여 전환)`}
              aria-label="테마 전환"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {mode === 'system' ? <Monitor size={18} /> : mode === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
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
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
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
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
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
