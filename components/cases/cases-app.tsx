'use client'

import { useMemo } from 'react'
import type { CaseRow, FieldDefinition } from '@/lib/supabase/types'
import { CasesProvider, useCases } from './cases-context'
import { CaseList } from './case-list'
import { CaseDetail, CaseDetailEmpty } from './case-detail'

function Inner() {
  const { cases, selectedId } = useCases()
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Left pane (1/2) — list
          Base ≤ 1536 : pt-32 pb-24 px-14   (128 top / 96 bottom / 56 x)
          2xl (1536+) : pt-36 pb-28 px-16
          3xl (2000+) : pt-44 pb-36 px-20
          4xl (2560+) : pt-52 pb-44 px-24
          6xl (3840+) : pt-64 pb-52 px-28                                 */}
      <aside className="basis-1/2 min-w-0">
        <div className="h-full overflow-hidden pt-32 pb-24 px-14 2xl:pt-36 2xl:pb-28 2xl:px-16 3xl:pt-44 3xl:pb-36 3xl:px-20 4xl:pt-52 4xl:pb-44 4xl:px-24 6xl:pt-64 6xl:pb-52 6xl:px-28">
          <div className="h-full mx-auto max-w-lg 4xl:max-w-xl 6xl:max-w-2xl">
            <CaseList />
          </div>
        </div>
      </aside>

      {/* Right pane (2/3) — detail
          Base ≤ 1536 : pt-32 pb-24 px-20
          2xl (1536+) : pt-36 pb-28 px-24
          3xl (2000+) : pt-44 pb-36 px-32
          4xl (2560+) : pt-52 pb-44 px-40
          6xl (3840+) : pt-64 pb-52 px-56                                 */}
      <main className="basis-1/2 min-w-0">
        <div className="h-full overflow-hidden pt-32 pb-24 px-20 2xl:pt-36 2xl:pb-28 2xl:px-24 3xl:pt-44 3xl:pb-36 3xl:px-32 4xl:pt-52 4xl:pb-44 4xl:px-40 6xl:pt-64 6xl:pb-52 6xl:px-56">
          <div className="h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl flex flex-col gap-4">
            {/* Menu bar — same height as left pane search input (h-9).
                Placeholder for future controls (edit/delete/export etc.) */}
            <div className="h-9 shrink-0">
              {/* future: menu items */}
            </div>

            {/* Scrollable content — starts at same vertical position as left list */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal">
              {selectedCase ? (
                <CaseDetail caseRow={selectedCase} />
              ) : (
                <CaseDetailEmpty />
              )}
            </div>

            {/* Bottom spacer — matches left pane's "N건" height so scroll ends align */}
            <div className="shrink-0 pt-2 text-xs">&nbsp;</div>
          </div>
        </div>
      </main>
    </div>
  )
}

export function CasesApp({
  initialCases,
  fieldDefs,
}: {
  initialCases: CaseRow[]
  fieldDefs: FieldDefinition[]
}) {
  return (
    <CasesProvider initialCases={initialCases} fieldDefs={fieldDefs}>
      <Inner />
    </CasesProvider>
  )
}
