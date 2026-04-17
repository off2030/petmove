'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCases } from './cases-context'
import { formatDate } from '@/lib/utils'
import { CaseList } from './case-list'
import { CaseDetail, CaseDetailEmpty } from './case-detail'
import { CaseHistory } from './case-history'
import { createCase } from '@/lib/actions/create-case'
import { deleteCase } from '@/lib/actions/delete-case'
import { duplicateCase } from '@/lib/actions/duplicate-case'
import { undoLastChange } from '@/lib/actions/cases'
import { generateFormRE, generateFormAC, generateIdentificationDeclaration, generateForm25, generateForm25AuNz, generateAU, generateAUCat, generateNZ, previewSiblings, generateAnnexIIIMulti, generateUKMulti } from '@/lib/actions/generate-pdf'
import { MultiFormDialog } from './multi-form-dialog'
import { ArrowLeft } from 'lucide-react'
import { getCertButtons } from '@/lib/destination-config'
import type { CertButton } from '@/lib/destination-config'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
}

/** Cert key → server action mapping for single-type buttons */
const CERT_ACTIONS: Record<string, (caseId: string, opts?: { includeSignature?: boolean }) => Promise<{ ok: true; pdf: string; filename: string } | { ok: false; error: string }>> = {
  form25: generateForm25,
  form25AuNz: generateForm25AuNz,
  formRE: generateFormRE as unknown as typeof generateForm25,
  formAC: generateFormAC as unknown as typeof generateForm25,
  idDeclaration: generateIdentificationDeclaration as unknown as typeof generateForm25,
  au: generateAU as unknown as typeof generateForm25,
  auCat: generateAUCat as unknown as typeof generateForm25,
  nz: generateNZ as unknown as typeof generateForm25,
}

/** Cert key → multi-form dialog formKey mapping */
const CERT_MULTI_KEYS: Record<string, string> = {
  annexIII: 'AnnexIII',
  uk: 'UK',
}

function Inner() {
  const { cases, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField } = useCases()
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  )
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const [multiForm, setMultiForm] = useState<{ caseId: string; formKey: 'AnnexIII' | 'UK' } | null>(null)
  const [includeSignature, setIncludeSignature] = useState(false)

  // Reset detail scroll to top when selected case changes
  useEffect(() => {
    detailScrollRef.current?.scrollTo(0, 0)
  }, [selectedId])

  const handleAdd = useCallback(async () => {
    const result = await createCase()
    if (result.ok) {
      addLocalCase(result.case)
    }
  }, [addLocalCase])

  // Ctrl+Z: undo last change on selected case
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && selectedId) {
        e.preventDefault()
        undoLastChange(selectedId).then((result) => {
          if (result.ok) {
            updateLocalCaseField(selectedId, result.storage, result.key, result.restoredValue)
          }
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, updateLocalCaseField])

  const handleDuplicate = useCallback(async (id: string) => {
    const result = await duplicateCase(id)
    if (result.ok) {
      addLocalCase(result.case)
      selectCase(result.case.id)
    }
  }, [addLocalCase, selectCase])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('이 케이스를 삭제하시겠습니까?')) return
    const result = await deleteCase(id)
    if (result.ok) {
      removeLocalCase(id)
      selectCase(null)
    }
  }, [removeLocalCase, selectCase])

  // Annex III / UK: if the case has siblings (same customer + destination +
  // departure date), show the multi-animal preview modal. Otherwise skip the
  // modal and generate a single-animal document directly.
  const handleMultiForm = useCallback(async (caseId: string, formKey: 'AnnexIII' | 'UK') => {
    const p = await previewSiblings(caseId, formKey)
    if (!p.ok) { alert(p.error); return }
    if (p.preview.cases.length <= 1) {
      const ids = p.preview.cases.map(c => c.id)
      const r = formKey === 'AnnexIII' ? await generateAnnexIIIMulti(ids) : await generateUKMulti(ids)
      if (!r.ok) { alert(r.error); return }
      for (const doc of r.docs) downloadBase64Pdf(doc.pdf, doc.filename)
      return
    }
    setMultiForm({ caseId, formKey })
  }, [])

  const showDetail = selectedId !== null

  return (
    <div className="h-full overflow-hidden bg-background">
      <div
        className="flex h-full transition-transform duration-300 ease-in-out"
        style={{
          width: '200%',
          transform: showDetail ? 'translateX(-50%)' : 'translateX(0)',
        }}
      >
        {/* Panel 1: List (full width = 50% of 200%) */}
        <div className="w-1/2 h-full">
          <div className="h-full overflow-hidden pt-32 pb-24 px-14 2xl:pt-36 2xl:pb-28 2xl:px-16 3xl:pt-44 3xl:pb-36 3xl:px-20 4xl:pt-52 4xl:pb-44 4xl:px-24 6xl:pt-64 6xl:pb-52 6xl:px-28">
            <div className="h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl">
              <CaseList onAdd={handleAdd} />
            </div>
          </div>
        </div>

        {multiForm && (
          <MultiFormDialog
            caseId={multiForm.caseId}
            formKey={multiForm.formKey}
            onClose={() => setMultiForm(null)}
          />
        )}

        {/* Panel 2: Detail (full width = 50% of 200%) */}
        <div className="w-1/2 h-full">
          <div className="h-full overflow-hidden pt-32 pb-24 px-20 2xl:pt-36 2xl:pb-28 2xl:px-24 3xl:pt-44 3xl:pb-36 3xl:px-32 4xl:pt-52 4xl:pb-44 4xl:px-40 6xl:pt-64 6xl:pb-52 6xl:px-56">
            <div className="h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl flex flex-col gap-4">
              {/* Back button + menu bar */}
              <div className="h-9 shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={() => selectCase(null)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={16} />
                  목록
                </button>
              </div>

              {/* Scrollable content */}
              <div ref={detailScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-minimal">
                {selectedCase ? (
                  <CaseDetail caseRow={selectedCase} />
                ) : (
                  <CaseDetailEmpty />
                )}
              </div>

              {/* Footer: 접수일/수정일 + 이력/삭제 */}
              <div className="shrink-0 pt-2 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-y-2">
                {selectedCase ? (
                  <>
                    <span>
                      접수일 {formatDate(selectedCase.created_at)}
                      {selectedCase.updated_at !== selectedCase.created_at && (
                        <span className="ml-4">수정일 {formatDate(selectedCase.updated_at)}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1 text-muted-foreground/50 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeSignature}
                          onChange={(e) => setIncludeSignature(e.target.checked)}
                          className="cursor-pointer"
                        />
                        서명
                      </label>
                      {getCertButtons(selectedCase.destination, (selectedCase.data as Record<string, unknown>)?.species as string | undefined).map((btn) =>
                        btn.type === 'multi' ? (
                          <button
                            key={btn.key}
                            type="button"
                            onClick={() => handleMultiForm(selectedCase.id, (CERT_MULTI_KEYS[btn.key] ?? btn.key) as 'AnnexIII' | 'UK')}
                            className="text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            {btn.label}
                          </button>
                        ) : (
                          <button
                            key={btn.key}
                            type="button"
                            onClick={async () => {
                              const action = CERT_ACTIONS[btn.key]
                              if (!action) return
                              const r = await action(selectedCase.id, { includeSignature })
                              if (r.ok) downloadBase64Pdf(r.pdf, r.filename)
                              else alert(r.error)
                            }}
                            className="text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            {btn.label}
                          </button>
                        ),
                      )}
                      <CaseHistory caseId={selectedCase.id} />
                      <button
                        type="button"
                        onClick={() => handleDuplicate(selectedCase.id)}
                        className="text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedCase.id)}
                        className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </>
                ) : '\u00A0'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CasesApp() {
  return <Inner />
}
