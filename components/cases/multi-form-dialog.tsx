'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  previewSiblings,
  generateAnnexIIIMulti,
  generateUKMulti,
  type SiblingPreview,
} from '@/lib/actions/generate-pdf'

interface Props {
  caseId: string
  formKey: 'AnnexIII' | 'UK'
  onClose: () => void
}

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
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
    const ids = preview.cases.filter(c => selected.has(c.id)).map(c => c.id)
    if (ids.length === 0) return
    startGen(async () => {
      const result = formKey === 'AnnexIII'
        ? await generateAnnexIIIMulti(ids)
        : await generateUKMulti(ids)
      if (!result.ok) { setError(result.error); return }
      for (const doc of result.docs) downloadBase64Pdf(doc.pdf, doc.filename)
      onClose()
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

            <div className="flex justify-end gap-sm">
              <button
                type="button"
                onClick={onClose}
                disabled={generating}
                className="px-sm py-1.5 text-sm rounded-md border border-border hover:bg-accent/60 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={generating || selected.size === 0}
                className="px-sm py-1.5 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {generating ? '생성 중…' : '발급'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
