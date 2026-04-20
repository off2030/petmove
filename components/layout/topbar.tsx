'use client'

import { Folder, CheckCircle2, LayoutGrid, Settings, Moon, Sun, Menu } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { countExpiringProducts } from '@/lib/vaccine-lookup'
import { useDarkMode } from '@/lib/use-dark-mode'

export type TabId = 'cases' | 'todos' | 'calculator' | 'settings'

export const NAV_ITEMS: Array<{ id: TabId; icon: typeof Folder; label: string }> = [
  { id: 'cases', icon: Folder, label: '홈' },
  { id: 'todos', icon: CheckCircle2, label: '할일' },
  { id: 'calculator', icon: LayoutGrid, label: '도구' },
]

export function TopBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  const expiringCount = useMemo(() => countExpiringProducts(), [])
  const { isDark, toggle, mounted } = useDarkMode()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <header className="shrink-0 h-14 w-full flex items-center gap-lg px-md border-b border-border bg-[hsl(200_13%_91%)] dark:bg-[hsl(220_12%_15%)]">
        {/* Mobile hamburger — left side, hidden on md+ */}
        <div className="relative md:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            aria-label="메뉴 열기"
            className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Menu size={20} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md">
              {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
                const active = activeTab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { onTabChange(id); setMenuOpen(false) }}
                    className={`w-full flex items-center gap-sm rounded-sm px-sm py-2 text-sm transition-colors ${
                      active
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* App name — click to go home */}
        <button
          type="button"
          onClick={() => onTabChange('cases')}
          className="text-base font-bold text-foreground whitespace-nowrap hover:opacity-70 transition-opacity"
        >
          펫무브워크
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Nav tabs — right side, hidden on mobile (replaced by hamburger) */}
        <nav className="hidden md:flex items-center gap-xs">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`h-9 inline-flex items-center gap-sm px-sm rounded-md transition-colors text-sm font-medium whitespace-nowrap ${
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Vertical divider */}
        <div className="h-6 w-px bg-foreground/20" aria-hidden />

        {/* Right-side actions */}
        <div className="flex items-center gap-xs">
          {mounted && (
            <button
              type="button"
              onClick={toggle}
              title={isDark ? '라이트 모드' : '다크 모드'}
              className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => onTabChange('settings')}
            title="설정"
            className={`relative h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors ${
              activeTab === 'settings'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Settings size={18} />
            {expiringCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </button>
        </div>
      </header>
  )
}
