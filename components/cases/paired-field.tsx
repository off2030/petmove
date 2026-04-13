'use client'

import type { FieldSpec } from '@/lib/fields'
import { renderFieldValue } from '@/lib/fields'
import { EditableField } from './editable-field'
import { CopyButton } from './copy-button'

/**
 * One row that shows a Korean + English paired text field side-by-side.
 * Both halves are independently editable and independently copyable.
 *
 * CopyButtons use absolute positioning so they take zero layout space
 * in the normal flow — this keeps Korean and English text close together
 * regardless of text length.
 */
export function PairedField({
  caseId,
  koSpec,
  enSpec,
  koRaw,
  enRaw,
}: {
  caseId: string
  koSpec: FieldSpec
  enSpec: FieldSpec | undefined
  koRaw: unknown
  enRaw: unknown
}) {
  const koDisplay = renderFieldValue(koSpec, koRaw)
  const enDisplay = enSpec ? renderFieldValue(enSpec, enRaw) : ''

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 py-1 border-b border-border/40 last:border-0">
      <div className="pt-1 text-sm text-muted-foreground">{koSpec.label}</div>

      <div className="flex items-baseline gap-[10px] min-w-0 flex-wrap">
        {/* Korean half — no copy button */}
        <div className="inline-flex items-baseline">
          <EditableField
            inline
            caseId={caseId}
            spec={koSpec}
            rawValue={koRaw}
          />
        </div>

        {/* Divider */}
        <span className="text-muted-foreground/30 select-none">|</span>

        {/* English half */}
        {enSpec && (
          <div className="group/en relative inline-flex items-baseline">
            <EditableField
              inline
              lang="en"
              caseId={caseId}
              spec={enSpec}
              rawValue={enRaw}
            />
            <CopyButton
              value={enDisplay === '—' ? '' : enDisplay}
              className="absolute left-full ml-1 z-10 opacity-0 group-hover/en:opacity-100 shrink-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
