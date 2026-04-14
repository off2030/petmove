'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, CheckSquare, Calculator, Settings, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { TrashModal } from '@/components/cases/trash-modal'

const NAV_ITEMS = [
  { href: '/cases', icon: ClipboardList, label: '케이스' },
  { href: '/todos', icon: CheckSquare, label: '할일' },
  { href: '/calculator', icon: Calculator, label: '계산기' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [showTrash, setShowTrash] = useState(false)

  return (
    <>
      <aside className="w-14 shrink-0 h-screen flex flex-col items-center py-4 border-r border-border bg-background">
        {/* Top nav */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon size={20} />
              </Link>
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
          <Link
            href="/settings"
            title="설정"
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
              pathname.startsWith('/settings')
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Settings size={20} />
          </Link>
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
