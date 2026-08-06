'use client'

import { useState, useTransition } from 'react'
import { useCases } from '@/components/cases/cases-context'
import { saveTodoColumnsConfigAction } from '@/lib/actions/todo-columns-config-action'
import {
  TODO_COLUMN_META,
  type TodoTabId,
  type TodoColumnsConfig,
} from '@/lib/todo-columns-config-types'
import { SettingsCheckBox, SettingsSubsectionTitle } from './settings-layout'

/**
 * 검사/신고/서류 탭의 컬럼 노출 여부 토글 UI.
 *
 * Editorial 체크박스 리스트. 디폴트 = 모든 컬럼 표시 (hidden = []).
 * 변경 즉시 저장 (optimistic local update + background server save).
 */
export function TodoColumnsToggle({
  tabId,
  title = '표시 컬럼',
  description,
}: {
  tabId: TodoTabId
  title?: string
  description?: string
}) {
  const { todoColumnsConfig, setTodoColumnsConfig } = useCases()
  const [, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const meta = TODO_COLUMN_META[tabId]
  const hidden = new Set(todoColumnsConfig.hiddenColumns[tabId])

  function toggle(key: string) {
    const prev = todoColumnsConfig
    const nextHidden = new Set(prev.hiddenColumns[tabId])
    if (nextHidden.has(key)) nextHidden.delete(key)
    else nextHidden.add(key)
    const next: TodoColumnsConfig = {
      hiddenColumns: {
        ...prev.hiddenColumns,
        [tabId]: Array.from(nextHidden),
      },
    }
    setTodoColumnsConfig(next)
    setError(null)
    startSave(async () => {
      const r = await saveTodoColumnsConfigAction(next)
      if (!r.ok) {
        setTodoColumnsConfig(prev)
        setError(r.error)
      }
    })
  }

  return (
    <section className="mb-xl">
      <SettingsSubsectionTitle className="mb-2">{title}</SettingsSubsectionTitle>
      <p className="font-serif italic text-[13px] text-muted-foreground mb-3">
        {description ?? '체크된 컬럼만 테이블에 표시됩니다.'}
      </p>
      {error && (
        <p className="-mt-2 mb-2 font-serif text-[12px] text-destructive">저장 실패: {error}</p>
      )}
      <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-md gap-y-1.5">
        {meta.map((col) => {
          const visible = !hidden.has(col.key)
          return (
            <li key={col.key}>
              <button
                type="button"
                onClick={() => toggle(col.key)}
                className="inline-flex items-center gap-2 font-serif text-[14px] hover:text-foreground transition-colors"
                aria-pressed={visible}
              >
                <SettingsCheckBox checked={visible} />
                <span className={visible ? 'text-foreground' : 'text-muted-foreground/70'}>
                  {col.label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
