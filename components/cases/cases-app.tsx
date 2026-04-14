'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useCases } from './cases-context'
import { formatDate } from '@/lib/utils'
import { CaseList } from './case-list'
import { CaseDetail, CaseDetailEmpty } from './case-detail'
import { CaseHistory } from './case-history'
import { createCase } from '@/lib/actions/create-case'
import { deleteCase } from '@/lib/actions/delete-case'
import { duplicateCase } from '@/lib/actions/duplicate-case'
import { undoLastChange } from '@/lib/actions/cases'
import { generateKoreaVetCert } from '@/lib/actions/generate-pdf'
import { ArrowLeft } from 'lucide-react'

function Inner() {
  const { cases, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField } = useCases()
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  )
  const detailScrollRef = useRef<HTMLDivElement>(null)

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
            <div className="h-full mx-auto max-w-2xl 4xl:max-w-3xl 6xl:max-w-4xl">
              <CaseList onAdd={handleAdd} />
            </div>
          </div>
        </div>

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
              <div ref={detailScrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal">
                {selectedCase ? (
                  <CaseDetail caseRow={selectedCase} />
                ) : (
                  <CaseDetailEmpty />
                )}
              </div>

              {/* Footer: 접수일/수정일 + 이력/삭제 */}
              <div className="shrink-0 pt-2 text-xs text-muted-foreground flex items-center justify-between">
                {selectedCase ? (
                  <>
                    <span>
                      접수일 {formatDate(selectedCase.created_at)}
                      {selectedCase.updated_at !== selectedCase.created_at && (
                        <span className="ml-4">수정일 {formatDate(selectedCase.updated_at)}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await generateKoreaVetCert(selectedCase.id)
                          if (result.ok) {
                            const link = document.createElement('a')
                            link.href = `data:application/pdf;base64,${result.pdf}`
                            link.download = result.filename
                            link.click()
                          } else {
                            alert(result.error)
                          }
                        }}
                        className="text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        📄 증명서
                      </button>
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
