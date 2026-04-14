'use client'

import { ClipboardList, CheckSquare, Calculator, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'

export type TabId = 'cases' | 'todos' | 'calculator' | 'settings'

export const NAV_ITEMS: Array<{ id: TabId; icon: typeof ClipboardList; label: string }> = [
  { id: 'cases', icon: ClipboardList, label: '케이스' },
  { id: 'todos', icon: CheckSquare, label: '할일' },
  { id: 'calculator', icon: Calculator, label: '계산기' },
]

export function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  const [showTrash, setShowTrash] = useState(false)

  return (
    <>
      <aside className="w-14 shrink-0 h-screen flex flex-col items-center py-4 border-r border-border bg-background">
        {/* Top nav */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                title={label}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon size={20} />
              </button>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            title="휴지통"
            onClick={() => setShowTrash(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Trash2 size={20} />
          </button>
          <button
            type="button"
            onClick={() => onTabChange('settings')}
            title="설정"
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              activeTab === 'settings'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Settings size={20} />
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
