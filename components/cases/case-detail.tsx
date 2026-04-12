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
import { AddressField } from './address-field'
import { BreedField } from './breed-field'
import { ColorField } from './color-field'
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
              // Address: combined Korean + English with Daum Postcode search
              if (spec.key === 'phone') {
                // Insert AddressField AFTER phone (before email)
                const addrKrSpec = allSpecs.find((s) => s.key === 'address_kr')
                const addrEnSpec = allSpecs.find((s) => s.key === 'address_en')
                return (
                  <div key="phone+address">
                    <EditableField
                      caseId={caseRow.id}
                      spec={spec}
                      rawValue={readCaseField(caseRow, spec)}
                    />
                    {addrKrSpec && (
                      <AddressField
                        caseId={caseRow.id}
                        krSpec={addrKrSpec}
                        enSpec={addrEnSpec}
                        krRaw={readCaseField(caseRow, addrKrSpec)}
                        enRaw={addrEnSpec ? readCaseField(caseRow, addrEnSpec) : null}
                      />
                    )}
                  </div>
                )
              }

              // Breed: searchable breed selector with ko/en auto-fill
              if (spec.key === 'species') {
                // Insert BreedField + ColorField after species (종)
                return (
                  <div key="species+breed+color">
                    <EditableField
                      caseId={caseRow.id}
                      spec={spec}
                      rawValue={readCaseField(caseRow, spec)}
                    />
                    <BreedField caseId={caseRow.id} caseRow={caseRow} />
                    <ColorField caseId={caseRow.id} caseRow={caseRow} />
                  </div>
                )
              }

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
