'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  previewSiblings,
  type SiblingPreview,
} from '@/lib/actions/generate-pdf'
import { downloadMultipartPdfRequest } from '@/lib/pdf-download'
import { DialogFooter } from '@/components/ui/dialog-footer'

interface Props {
  caseId: string
  formKey: 'AnnexIII' | 'UK'
  onClose: () => void
}

function simulatePackCount(
  formKey: 'AnnexIII' | 'UK',
  cases: Array<{ rabiesDoseCount: number }>,
): number {
  const cap = formKey === 'AnnexIII' ? { animals: 3, vaccRows: 5 } : { animals: 5, vaccRows: 5 }
  let docs = 0
  let remaining = cases.slice()

  while (remaining.length > 0) {
    const fit: Array<{ rabiesDoseCount: number }> = []
    const leftover: Array<{ rabiesDoseCount: number }> = []
    let vaccRows = 0

    for (const c of remaining) {
      const doseCount = Math.max(1, c.rabiesDoseCount)
      if (fit.length < cap.animals && vaccRows + doseCount <= cap.vaccRows) {
        fit.push(c)
        vaccRows += doseCount
      } else {
        leftover.push(c)
      }
    }

    if (fit.length === 0) return docs
    docs += 1
    remaining = leftover
  }

  return docs
}

export function MultiFormDialog({ caseId, formKey, onClose }: Props) {
  const [preview, setPreview] = useState<SiblingPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoad] = useTransition()
  const [generating, startGen] = useTransition()

  useEffect(() => {
    startLoad(async () => {
      const r = await previewSiblings(caseId, formKey)
      if (r.ok) {
        setPreview(r.preview)
        setSelected(new Set(r.preview.cases.map(c => c.id)))
      } else setError(r.error)
    })
  }, [caseId, formKey])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    if (!preview) return
    const selectedCases = preview.cases.filter(c => selected.has(c.id))
    const ids = selectedCases.map(c => c.id)
    if (ids.length === 0) return
    startGen(async () => {
      try {
        await downloadMultipartPdfRequest(
          { kind: 'multi', formKey, caseIds: ids },
          simulatePackCount(formKey, selectedCases),
        )
        onClose()
      } catch (error) {
        setError(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
      }
    })
  }

  const formLabel = formKey === 'AnnexIII' ? 'Annex III' : 'UK'

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-[420px] max-w-[90vw] rounded-lg border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium mb-4">{formLabel} 증명서 발급</h2>

        {loading && <div className="text-sm text-muted-foreground">불러오는 중…</div>}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {preview && (
          <>
            <div className="space-y-1.5 mb-5">
              {preview.cases.map((c, i) => (
                <label key={c.id} className="flex items-center gap-sm text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-4 w-4 accent-foreground"
                  />
                  <span className="text-muted-foreground/60">{i + 1}.</span>
                  {c.pet_name_en || c.pet_name || '(이름 없음)'}
                </label>
              ))}
            </div>

            <DialogFooter
              onCancel={onClose}
              onPrimary={handleConfirm}
              primaryLabel="발급"
              savingLabel="생성 중…"
              primaryDisabled={selected.size === 0}
              saving={generating}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
