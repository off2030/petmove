'use client'

import { ClipboardList, CheckSquare, Calculator as CalculatorIcon, Settings, Trash2, Moon, Sun } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'
import { countExpiringProducts } from '@/lib/vaccine-lookup'
import { useDarkMode } from '@/lib/use-dark-mode'

export type TabId = 'cases' | 'todos' | 'calculator' | 'settings'

export const NAV_ITEMS: Array<{ id: TabId; icon: typeof ClipboardList; label: string }> = [
  { id: 'cases', icon: ClipboardList, label: '케이스' },
  { id: 'todos', icon: CheckSquare, label: '할일' },
  { id: 'calculator', icon: CalculatorIcon, label: '비용 계산기' },
]

export function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  const [showTrash, setShowTrash] = useState(false)
  const expiringCount = useMemo(() => countExpiringProducts(), [])
  const { isDark, toggle, mounted } = useDarkMode()

  return (
    <>
      <aside className="w-48 shrink-0 h-screen flex flex-col py-4 border-r border-border bg-background">
        {/* Logo */}
        <div className="mb-6 px-4 w-full">
          <h1 className="text-lg font-bold text-foreground text-center">펫무브워크</h1>
        </div>

        {/* Top nav */}
        <nav className="flex flex-col gap-1 flex-1 px-2">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg transition-colors text-sm font-medium ${
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col gap-1 px-2 border-t border-border pt-4">
          {mounted && (
            <button
              type="button"
              onClick={toggle}
              className="w-full h-10 flex items-center gap-3 px-3 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors text-sm font-medium"
            >
              {isDark ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
              <span>{isDark ? '라이트 모드' : '다크 모드'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowTrash(true)}
            className="w-full h-10 flex items-center gap-3 px-3 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors text-sm font-medium"
          >
            <Trash2 size={20} className="shrink-0" />
            <span>휴지통</span>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('settings')}
            className={`relative w-full h-10 flex items-center gap-3 px-3 rounded-lg transition-colors text-sm font-medium ${
              activeTab === 'settings'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Settings size={20} className="shrink-0" />
            <span>설정</span>
            {expiringCount > 0 && (
              <span className="absolute right-3 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </button>
        </div>
      </aside>

      {showTrash && (
        <TrashModal
          onClose={() => setShowTrash(false)}
          onRestore={() => window.location.reload()}
        />
      )}
    </>
  )
}
