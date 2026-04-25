'use client'

import { memo, useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TopBar, type TabId } from './topbar'
import { useCases } from '@/components/cases/cases-context'
import { CasesApp } from '@/components/cases/cases-app'
import { TodosApp } from '@/components/todos/todos-app'
import { SettingsApp } from '@/components/settings/settings-app'
import { CalculatorApp } from '@/components/calculator/calculator-app'
import { SuperAdminApp } from '@/components/super-admin/super-admin-app'
import { clearImpersonation } from '@/lib/actions/super-admin'
import type { SettingsBootstrap } from '@/lib/actions/settings-bootstrap'
import type { OrgSummary } from '@/lib/actions/super-admin'
import type { ExternalLinksConfig } from '@petmove/domain'

const MemoizedCases = memo(CasesApp)
const MemoizedTodos = memo(TodosApp)
const MemoizedSettings = memo(SettingsApp)
const MemoizedCalculator = memo(CalculatorApp)
const MemoizedSuperAdmin = memo(SuperAdminApp)

function pathToTab(pathname: string): TabId {
  if (pathname.startsWith('/todos')) return 'todos'
  if (pathname.startsWith('/calculator')) return 'calculator'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/super-admin')) return 'super-admin'
  return 'cases'
}

export function DashboardShell({
  isSuperAdmin = false,
  userEmail,
  currentUserId = null,
  initialSettingsBootstrap = null,
  initialOrgs = [],
  impersonation = null,
  initialExternalLinks,
}: {
  isSuperAdmin?: boolean
  userEmail?: string | null
  currentUserId?: string | null
  initialSettingsBootstrap?: SettingsBootstrap | null
  initialOrgs?: OrgSummary[]
  impersonation?: { orgId: string; orgName: string } | null
  initialExternalLinks: ExternalLinksConfig
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabId>(() => pathToTab(pathname))
  const [mounted, setMounted] = useState<Set<TabId>>(() => new Set([activeTab]))
  const [endingImpersonation, startEndImpersonation] = useTransition()

  const onEndImpersonation = useCallback(() => {
    startEndImpersonation(async () => {
      await clearImpersonation()
      router.refresh()
    })
  }, [router])

  const { selectCase } = useCases()

  const handleTabChange = useCallback((tab: TabId) => {
    if (tab === 'cases') selectCase(null)
    setActiveTab(tab)
    setMounted((prev) => {
      if (prev.has(tab)) return prev
      return new Set([...prev, tab])
    })
    window.history.pushState(null, '', `/${tab}`)
  }, [])

  // Handle browser back/forward
  useEffect(() => {
    function onPopState() {
      const tab = pathToTab(window.location.pathname)
      setActiveTab(tab)
      setMounted((prev) => {
        if (prev.has(tab)) return prev
        return new Set([...prev, tab])
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <>
      {impersonation && (
        <div className="shrink-0 flex items-center justify-center gap-md px-md py-1.5 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700/50 text-amber-900 dark:text-amber-100 text-[13px] font-serif">
          <span>
            <span className="italic">임시 보기 중</span>{' '}
            <span className="font-semibold">{impersonation.orgName}</span>
          </span>
          <button
            type="button"
            onClick={onEndImpersonation}
            disabled={endingImpersonation}
            className="px-2 py-0.5 rounded-full border border-amber-400/60 dark:border-amber-500/40 text-[12px] hover:bg-amber-200/60 dark:hover:bg-amber-800/40 transition-colors disabled:opacity-40"
          >
            원래대로
          </button>
        </div>
      )}
      <TopBar activeTab={activeTab} onTabChange={handleTabChange} isSuperAdmin={isSuperAdmin} userEmail={userEmail} />
      <main className="flex-1 min-w-0 overflow-hidden">
        {mounted.has('cases') && (
          <div className="h-full" style={{ display: activeTab === 'cases' ? 'block' : 'none' }}>
            <MemoizedCases />
          </div>
        )}
        {mounted.has('todos') && (
          <div className="h-full" style={{ display: activeTab === 'todos' ? 'block' : 'none' }}>
            <MemoizedTodos />
          </div>
        )}
        {mounted.has('calculator') && (
          <div className="h-full" style={{ display: activeTab === 'calculator' ? 'block' : 'none' }}>
            <MemoizedCalculator initialExternalLinks={initialExternalLinks} />
          </div>
        )}
{mounted.has('settings') && (
          <div className="h-full" style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <MemoizedSettings initialBootstrap={initialSettingsBootstrap} />
          </div>
        )}
        {isSuperAdmin && mounted.has('super-admin') && (
          <div className="h-full" style={{ display: activeTab === 'super-admin' ? 'block' : 'none' }}>
            <MemoizedSuperAdmin initialOrgs={initialOrgs} userEmail={userEmail ?? null} currentUserId={currentUserId} embedded />
          </div>
        )}
      </main>
    </>
  )
}
