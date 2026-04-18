'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCases } from './cases-context'
import { formatDate } from '@/lib/utils'
import { CaseList } from './case-list'
import { CaseDetail, CaseDetailEmpty } from './case-detail'
import { CaseHistory } from './case-history'
import { createCase } from '@/lib/actions/create-case'
import { createCaseWithData } from '@/lib/actions/create-case-with-data'
import { deleteCase } from '@/lib/actions/delete-case'
import { duplicateCase } from '@/lib/actions/duplicate-case'
import { undoLastChange, updateCaseField } from '@/lib/actions/cases'
import { extractAll } from '@/lib/actions/extract-all'
import { extractResultToSeed } from '@/lib/extract-to-seed'
import { filesToBase64 } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { lookupCaseByMicrochip } from '@/lib/actions/lookup-case-by-chip'
import { generateFormRE, generateFormAC, generateIdentificationDeclaration, generateForm25, generateForm25AuNz, generateAU, generateAU2, generateAUCat, generateAUCat2, generateNZ, generateOVD, generateSGP, generateAQS, generateFormR11, previewSiblings, generateAnnexIIIMulti, generateUKMulti } from '@/lib/actions/generate-pdf'
import { MultiFormDialog } from './multi-form-dialog'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { getCertButtons } from '@/lib/destination-config'
import type { CertButton } from '@/lib/destination-config'
import type { CaseRow } from '@/lib/supabase/types'

function downloadBase64Pdf(base64: string, filename: string) {
  const link = document.createElement('a')
  link.href = `data:application/pdf;base64,${base64}`
  link.download = filename
  link.click()
}

/** Cert key → server action mapping for single-type buttons */
type CertAction = (
  caseId: string,
  opts?: { includeSignature?: boolean; destination?: string | null },
) => Promise<{ ok: true; pdf: string; filename: string } | { ok: false; error: string }>

const CERT_ACTIONS: Record<string, CertAction> = {
  form25: generateForm25,
  form25AuNz: generateForm25AuNz,
  formRE: generateFormRE,
  formAC: generateFormAC,
  idDeclaration: generateIdentificationDeclaration,
  au: generateAU,
  au2: generateAU2,
  auCat: generateAUCat,
  auCat2: generateAUCat2,
  nz: generateNZ,
  ovd: generateOVD,
  sgp: generateSGP,
  aqs: generateAQS,
  formR11: generateFormR11,
}

/** Cert key → multi-form dialog formKey mapping */
const CERT_MULTI_KEYS: Record<string, string> = {
  annexIII: 'AnnexIII',
  uk: 'UK',
}

/**
 * 신고 탭 포함 토글. 이미 자동 포함(일본/태국/필리핀/하와이/스위스 + 출국일)
 * 이면 버튼은 잠겨 있음 표시만 한다. 아닌 케이스에서는 눌러 `data.import_report_manual`
 * 을 토글해 신고 탭에 수동으로 나타나게 한다.
 */
const AUTO_IMPORT_REPORT_COUNTRIES = new Set(['일본', '하와이', '스위스', '태국', '필리핀'])

function isAutoImportReportCase(row: CaseRow): boolean {
  if (!row.departure_date || !row.destination) return false
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests.some(d => AUTO_IMPORT_REPORT_COUNTRIES.has(d))
}

function ImportReportToggle({
  caseRow,
  onUpdate,
}: {
  caseRow: CaseRow
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const manual = data.import_report_manual === true
  const auto = isAutoImportReportCase(caseRow)
  const included = auto || manual

  if (auto) {
    return (
      <span
        className="text-muted-foreground/40 select-none cursor-default"
        title="목적지+출국일로 자동 포함됨"
      >
        신고 자동
      </span>
    )
  }

  const label = included ? '신고 제외' : '신고 추가'
  const nextVal = !manual
  return (
    <button
      type="button"
      onClick={async () => {
        onUpdate(caseRow.id, 'data', 'import_report_manual', nextVal || null)
        await updateCaseField(caseRow.id, 'data', 'import_report_manual', nextVal || null)
      }}
      className={included
        ? 'text-blue-500/70 hover:text-blue-600 transition-colors'
        : 'text-muted-foreground/50 hover:text-foreground transition-colors'}
      title={included ? '신고 탭에서 제거' : '신고 탭에 추가'}
    >
      {label}
    </button>
  )
}

function Inner() {
  const { cases, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField, activeDestination } = useCases()
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  )
  const { prevCase, nextCase } = useMemo(() => {
    if (!selectedCase) return { prevCase: null as CaseRow | null, nextCase: null as CaseRow | null }
    const idx = cases.findIndex((c) => c.id === selectedCase.id)
    return {
      prevCase: idx > 0 ? cases[idx - 1] : null,
      nextCase: idx >= 0 && idx < cases.length - 1 ? cases[idx + 1] : null,
    }
  }, [cases, selectedCase])
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const [multiForm, setMultiForm] = useState<{ caseId: string; formKey: 'AnnexIII' | 'UK' } | null>(null)
  const [includeSignature, setIncludeSignature] = useState(false)
  const [addingFromFiles, setAddingFromFiles] = useState(false)

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

  // 파일(이미지/PDF) 여러 개를 한 케이스로 묶어 처리:
  // 1) 이미지화 → extractAll로 한 번에 정보 추출
  // 2) 추출된 마이크로칩이 기존 케이스에 있으면 그 케이스를 선택해 파일만 첨부
  //    (유령/중복 케이스 방지)
  // 3) 없으면 새 케이스 생성 후 파일 첨부
  const uploadFilesToNotes = useCallback(
    async (caseRow: CaseRow, files: File[]) => {
      let runningData = { ...((caseRow.data as Record<string, unknown>) ?? {}) }
      for (const file of files) {
        const snapshot = { ...caseRow, data: runningData } as CaseRow
        const captured: Record<string, unknown> = runningData
        await uploadFileToNotes(caseRow.id, snapshot, file, (cid, storage, key, val) => {
          if (storage === 'data' && cid === caseRow.id) {
            if (val === null || val === undefined || val === '') delete captured[key]
            else captured[key] = val
          }
          updateLocalCaseField(cid, storage, key, val)
        })
        runningData = captured
      }
    },
    [updateLocalCaseField],
  )

  const handleAddFromFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setAddingFromFiles(true)
    try {
      // 1. 파일 → AI 입력용 이미지 배열
      const images = await filesToBase64(files)

      // 2. 추출 (실패해도 빈 케이스는 만든다 — 사용자가 수동 입력할 수 있도록)
      const extract = images.length > 0 ? await extractAll({ images }) : { ok: false as const, error: 'no images' }
      const seed = extract.ok ? extractResultToSeed(extract.data) : { column: {}, data: {} }

      // 3. 마이크로칩으로 기존 케이스 찾기 — 있으면 그쪽에 파일만 추가
      const chip = seed.column?.microchip as string | undefined
      if (chip) {
        const existing = await lookupCaseByMicrochip(chip)
        if (existing.ok && existing.case) {
          selectCase(existing.case.id)
          await uploadFilesToNotes(existing.case, files)
          alert(
            `이미 등록된 마이크로칩입니다 — 기존 케이스(${existing.case.pet_name ?? existing.case.customer_name ?? '이름없음'})에 파일을 추가했습니다.`,
          )
          return
        }
      }

      // 4. 새 케이스 생성
      const created = await createCaseWithData(seed)
      if (!created.ok) { alert(created.error); return }
      addLocalCase(created.case)  // context가 자동 선택

      // 5. 파일을 새 케이스의 notes에 업로드
      await uploadFilesToNotes(created.case, files)

      if (!extract.ok) console.warn('extract failed:', extract.error)
    } finally {
      setAddingFromFiles(false)
    }
  }, [addLocalCase, selectCase, uploadFilesToNotes])

  // Ctrl+Z: undo last change on selected case
  // Ctrl+←/→: 이전/다음 케이스로 이동 (인풋 포커스 중에는 커서 이동과 충돌하므로 무시)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && selectedId) {
        e.preventDefault()
        undoLastChange(selectedId).then((result) => {
          if (result.ok) {
            updateLocalCaseField(selectedId, result.storage, result.key, result.restoredValue)
          }
        })
        return
      }
      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement | null
        const inTextField =
          !!target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
          )
        if (inTextField) return
        if (e.key === 'ArrowLeft' && prevCase) {
          e.preventDefault()
          selectCase(prevCase.id)
          return
        }
        if (e.key === 'ArrowRight' && nextCase) {
          e.preventDefault()
          selectCase(nextCase.id)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, updateLocalCaseField, prevCase, nextCase, selectCase])

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
              <CaseList onAdd={handleAdd} onAddFromFiles={handleAddFromFiles} busy={addingFromFiles} />
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
            <div className="relative h-full mx-auto max-w-3xl 4xl:max-w-4xl 6xl:max-w-5xl">
              {selectedCase && (
                <>
                  <button
                    type="button"
                    onClick={() => prevCase && selectCase(prevCase.id)}
                    disabled={!prevCase}
                    aria-label="이전 케이스 (Ctrl+←)"
                    title="이전 케이스 (Ctrl+←)"
                    className="absolute -left-12 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    onClick={() => nextCase && selectCase(nextCase.id)}
                    disabled={!nextCase}
                    aria-label="다음 케이스 (Ctrl+→)"
                    title="다음 케이스 (Ctrl+→)"
                    className="absolute -right-12 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
              <div className="h-full flex flex-col gap-4">
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
                      {getCertButtons(activeDestination ?? selectedCase.destination, (selectedCase.data as Record<string, unknown>)?.species as string | undefined).map((btn) =>
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
                              const r = await action(selectedCase.id, {
                                includeSignature,
                                destination: activeDestination ?? selectedCase.destination,
                              })
                              if (r.ok) downloadBase64Pdf(r.pdf, r.filename)
                              else alert(r.error)
                            }}
                            className="text-muted-foreground/50 hover:text-foreground transition-colors"
                          >
                            {btn.label}
                          </button>
                        ),
                      )}
                      <ImportReportToggle caseRow={selectedCase} onUpdate={updateLocalCaseField} />
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
    </div>
  )
}

export function CasesApp() {
  return <Inner />
}
