'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar, type TabId } from './sidebar'
import { useCases } from '@/components/cases/cases-context'
import { CasesApp } from '@/components/cases/cases-app'
import { TodosApp } from '@/components/todos/todos-app'
import { SettingsApp } from '@/components/settings/settings-app'
import { CalculatorApp } from '@/components/calculator/calculator-app'

const MemoizedCases = memo(CasesApp)
const MemoizedTodos = memo(TodosApp)
const MemoizedSettings = memo(SettingsApp)
const MemoizedCalculator = memo(CalculatorApp)

function pathToTab(pathname: string): TabId {
  if (pathname.startsWith('/todos')) return 'todos'
  if (pathname.startsWith('/calculator')) return 'calculator'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'cases'
}

export function DashboardShell() {
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabId>(() => pathToTab(pathname))
  const [mounted, setMounted] = useState<Set<TabId>>(() => new Set([activeTab]))

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
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      <main className="flex-1 min-w-0 h-screen overflow-hidden">
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
            <MemoizedCalculator />
          </div>
        )}
{mounted.has('settings') && (
          <div className="h-full" style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
            <MemoizedSettings />
          </div>
        )}
      </main>
    </>
  )
}
