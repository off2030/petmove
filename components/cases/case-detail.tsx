'use client'

import type { CaseRow } from '@/lib/supabase/types'
import {
  buildFieldSpecs,
  groupFieldSpecs,
  HIDDEN_EN_KEYS,
  readCaseField,
} from '@/lib/fields'
import { formatDate } from '@/lib/utils'
import { EditableField } from './editable-field'
import { PairedField } from './paired-field'
import { CustomerNameRow } from './customer-name-row'
import { useCases } from './cases-context'

/**
 * Right-pane detail. No top title — destination gets a standalone prominent
 * display at the top, then the three groups (고객정보 / 동물정보 / 절차정보),
 * then a footer with timestamps.
 */
export function CaseDetail({ caseRow }: { caseRow: CaseRow }) {
  const { fieldDefs } = useCases()
  const allSpecs = buildFieldSpecs(fieldDefs)

  // Sections exclude any spec whose key is merged into a paired row,
  // so we don't render the English half twice.
  const sectionSpecs = allSpecs.filter((s) => !HIDDEN_EN_KEYS.has(s.key))
  const groups = groupFieldSpecs(sectionSpecs)

  return (
    <div>
      {/* ─── Sections ─── */}
      {groups.map((g) => (
        <section key={g.group} className="mb-7">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.group}
          </h3>
          <div>
            {g.items.map((spec) => {
              // Customer name: special row with combined "First Last" English display
              if (spec.key === 'customer_name') {
                return (
                  <CustomerNameRow
                    key="customer_name"
                    caseId={caseRow.id}
                    caseRow={caseRow}
                  />
                )
              }
              // Paired text field: render ko + en on one row
              if (spec.pairEnKey) {
                const enSpec = allSpecs.find((s) => s.key === spec.pairEnKey)
                return (
                  <PairedField
                    key={`pair:${spec.storage}:${spec.key}`}
                    caseId={caseRow.id}
                    koSpec={spec}
                    enSpec={enSpec}
                    koRaw={readCaseField(caseRow, spec)}
                    enRaw={
                      enSpec ? readCaseField(caseRow, enSpec) : null
                    }
                  />
                )
              }
              return (
                <EditableField
                  key={`${spec.storage}:${spec.key}`}
                  caseId={caseRow.id}
                  spec={spec}
                  rawValue={readCaseField(caseRow, spec)}
                />
              )
            })}
          </div>
        </section>
      ))}

      {/* ─── Footer: timestamps ─── */}
      <footer className="mt-12 pt-4 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>접수일 {formatDate(caseRow.created_at)}</span>
          {caseRow.updated_at !== caseRow.created_at && (
            <span>수정일 {formatDate(caseRow.updated_at)}</span>
          )}
        </div>
      </footer>
    </div>
  )
}

/**
 * Empty state when no case is selected.
 */
export function CaseDetailEmpty() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-2">📖</div>
        <p>왼쪽에서 케이스를 선택하세요.</p>
      </div>
    </div>
  )
}
