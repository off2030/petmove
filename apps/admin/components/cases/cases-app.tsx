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
import { filesToBase64, filesToPdfText } from '@/lib/file-to-base64'
import { uploadFileToNotes } from '@/lib/notes-upload'
import { lookupCaseByMicrochip } from '@/lib/actions/lookup-case-by-chip'
import { generateFormRE, generateFormAC, generateIdentificationDeclaration, generateForm25, generateForm25AuNz, generateAU, generateAU2, generateAUCat, generateAUCat2, generateNZ, generateOVD, generateSGP, generateAQS, generateCH, generateFormR11, generateVHC, previewSiblings, generateAnnexIIIMulti, generateUKMulti } from '@/lib/actions/generate-pdf'
import { downloadMultipartPdfRequest, downloadPdfRequest } from '@/lib/pdf-download'
import { MultiFormDialog } from './multi-form-dialog'
import { RabiesSelectDialog, RABIES_SLOT_CAP } from './rabies-select-dialog'
import { ChevronLeft, ChevronRight, Copy, Trash2 } from 'lucide-react'
import { resolveCerts } from '@petmove/domain'
import type { CaseRow } from '@/lib/supabase/types'
import { useConfirm } from '@/components/ui/confirm-dialog'

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
  ch: generateCH,
  formR11: generateFormR11,
  vhc: generateVHC,
}

const CERT_FORM_KEYS: Record<string, string> = {
  form25: 'Form25',
  form25AuNz: 'Form25AuNz',
  formRE: 'FormRE',
  formAC: 'FormAC',
  idDeclaration: 'IdentificationDeclaration',
  au: 'AU',
  au2: 'AU_2',
  auCat: 'AU_Cat',
  auCat2: 'AU_Cat_2',
  nz: 'NZ',
  ovd: 'OVD',
  sgp: 'SGP',
  aqs: 'AQS_279',
  ch: 'CH',
  formR11: 'Form_R11',
  vhc: 'VHC',
}

/** Cert key → multi-form dialog formKey mapping */
const CERT_MULTI_KEYS: Record<string, string> = {
  annexIII: 'AnnexIII',
  uk: 'UK',
}

/**
 * 신고 탭 포함 토글. 두 종류의 국가 목록을 사용한다(설정 > 신고 에서 편집):
 *  - buttonCountries: 신고 버튼이 노출되는 국가
 *  - autoCountries:   buttonCountries 의 부분집합. 출국일 입력 시 자동 포함
 *
 * - buttonCountries 아님 → 버튼 숨김(신고 대상이 아님)
 * - autoCountries + 출국일 → "신고 자동" (회색 읽기전용)
 * - 그 외(buttonCountries 안에 있고 자동 조건 미충족) → "신고 추가" 클릭해 수동 포함
 */
/** 케이스의 표시 순서상 첫 번째 destination 만 추출. multi 일 때 신고/서류 탭은 이 값만 사용. */
function firstDestination(row: CaseRow): string | null {
  if (!row.destination) return null
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests[0] ?? null
}

function ImportReportToggle({
  caseRow,
  onUpdate,
}: {
  caseRow: CaseRow
  onUpdate: (caseId: string, storage: 'column' | 'data', key: string, value: unknown) => void
}) {
  const { importReportCountries, importReportButtonCountries, activeDestination } = useCases()
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // 토글 노출 여부는 활성 목적지(사용자 칩 선택) 기준. 미선택 시 첫 목적지로 폴백.
  const focusDest = activeDestination ?? firstDestination(caseRow)
  if (!focusDest || !importReportButtonCountries.includes(focusDest)) return null

  const manual = data.import_report_manual === true
  const dismissed = data.import_report_dismissed === true
  // 자동 포함 = 출국일 있음 + 활성 목적지가 신고 대상국 (= isAutoImportReport와 동일 의도)
  const auto = !!caseRow.departure_date && importReportCountries.includes(focusDest)
  const included = auto || manual

  // "신고 내리기" 로 비활성화된 상태 — 회색 라벨 + 리셋 버튼.
  if (dismissed) {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="rounded-md px-2 py-1 text-muted-foreground/40 select-none cursor-default line-through"
          title="신고 탭에서 내려진 상태"
        >
          신고
        </span>
        <button
          type="button"
          onClick={async () => {
            onUpdate(caseRow.id, 'data', 'import_report_dismissed', null)
            await updateCaseField(caseRow.id, 'data', 'import_report_dismissed', null)
          }}
          className="rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-[13px]"
          title="신고 탭으로 다시 올리기"
        >
          ↻ 리셋
        </button>
      </span>
    )
  }

  if (auto) {
    return (
      <span
        className="rounded-md px-2 py-1 text-muted-foreground/40 select-none cursor-default"
        title={`${focusDest} 자동 포함됨 (출국일+신고 대상국)`}
      >
        신고
      </span>
    )
  }

  const label = included ? '신고 제외' : '신고'
  const nextVal = !manual
  return (
    <button
      type="button"
      onClick={async () => {
        onUpdate(caseRow.id, 'data', 'import_report_manual', nextVal || null)
        await updateCaseField(caseRow.id, 'data', 'import_report_manual', nextVal || null)
        // 신고 등록 시 활성 목적지를 신고 탭 active_dest에 영속 저장.
        if (nextVal) {
          onUpdate(caseRow.id, 'data', 'import_report_active_dest', focusDest)
          await updateCaseField(caseRow.id, 'data', 'import_report_active_dest', focusDest)
        }
      }}
      className={included
        ? 'rounded-md px-2 py-1 text-blue-500/70 hover:bg-accent hover:text-blue-600 transition-colors'
        : 'rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors'}
      title={included ? `신고 탭에서 제거 (${focusDest})` : `신고 탭에 추가 (${focusDest})`}
    >
      {label}
    </button>
  )
}

function Inner() {
  const { cases, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField, activeDestination, certConfig } = useCases()
  const confirm = useConfirm()
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
  // 별지 25호/EX 의 광견병 슬롯이 부족할 때 띄우는 선택 모달.
  const [rabiesPick, setRabiesPick] = useState<
    | { caseId: string; formKey: 'Form25' | 'Form25AuNz'; rabiesDates: unknown; destination: string | null; cap: number }
    | null
  >(null)
  const [includeSignature, setIncludeSignature] = useState(false)
  // 심플 모드 — 상세 패널에서 모든 편집 어포던스(버튼·copy 아이콘·hover 등)
  // 숨기고 인쇄된 텍스트처럼 정보만 표시. CSS 의 [data-simple-mode] selector 가
  // 일괄 처리.
  const [simpleMode, setSimpleMode] = useState(false)
  const [addingFromFiles, setAddingFromFiles] = useState(false)

  // Reset detail scroll to top when selected case changes
  useEffect(() => {
    detailScrollRef.current?.scrollTo(0, 0)
  }, [selectedId])

  const handleAdd = useCallback(async () => {
    const result = await createCase()
    if (result.ok) {
      addLocalCase(result.case)
    } else {
      alert(`케이스 생성 실패: ${result.error}`)
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
      const [images, pdfTexts] = await Promise.all([
        filesToBase64(files),
        filesToPdfText(files),
      ])

      // 2. 추출 (실패해도 빈 케이스는 만든다 — 사용자가 수동 입력할 수 있도록)
      const extract = images.length > 0 || pdfTexts.length > 0
        ? await extractAll({ images, pdfTexts })
        : { ok: false as const, error: 'no images' }
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

  const downloadCertPdf = useCallback(
    async (formKey: string, caseId: string, destination: string | null, rabiesIndices?: number[]) => {
      try {
        await downloadPdfRequest({
          kind: 'single',
          formKey: formKey as
            | 'Form25'
            | 'Form25AuNz'
            | 'FormRE'
            | 'FormAC'
            | 'IdentificationDeclaration'
            | 'AU'
            | 'AU_2'
            | 'AU_Cat'
            | 'AU_Cat_2'
            | 'NZ'
            | 'OVD'
            | 'SGP'
            | 'AQS_279'
            | 'CH'
            | 'Form_R11'
            | 'VHC',
          caseId,
          includeSignature,
          destination,
          ...(rabiesIndices ? { rabiesIndices } : {}),
        })
      } catch (error) {
        alert(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
      }
    },
    [includeSignature],
  )

  const handleDuplicate = useCallback(async (id: string) => {
    const result = await duplicateCase(id)
    if (result.ok) {
      addLocalCase(result.case)
      selectCase(result.case.id)
    }
  }, [addLocalCase, selectCase])

  const handleDelete = useCallback(async (id: string) => {
    if (!await confirm({ message: '이 케이스를 삭제하시겠습니까?', okLabel: '삭제', variant: 'destructive' })) return
    const result = await deleteCase(id)
    if (result.ok) {
      removeLocalCase(id)
      selectCase(null)
    }
  }, [removeLocalCase, selectCase, confirm])

  // Annex III / UK: if the case has siblings (same customer + destination +
  // departure date), show the multi-animal preview modal. Otherwise skip the
  // modal and generate a single-animal document directly.
  const handleMultiForm = useCallback(async (caseId: string, formKey: 'AnnexIII' | 'UK') => {
    const p = await previewSiblings(caseId, formKey)
    if (!p.ok) { alert(p.error); return }
    if (p.preview.cases.length <= 1) {
      const ids = p.preview.cases.map(c => c.id)
      try {
        await downloadMultipartPdfRequest({ kind: 'multi', formKey, caseIds: ids }, p.preview.docCount)
      } catch (error) {
        alert(error instanceof Error ? error.message : 'PDF 다운로드 중 오류가 발생했습니다.')
      }
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
          <div className="h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
            <div className="h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
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

        <RabiesSelectDialog
          open={!!rabiesPick}
          formLabel={
            rabiesPick?.formKey === 'Form25AuNz' ? '별지 25호 EX (호주/뉴질랜드)' : '별지 25호'
          }
          slotCount={rabiesPick?.cap ?? 3}
          rabiesDates={rabiesPick?.rabiesDates}
          onClose={(indices) => {
            const pick = rabiesPick
            setRabiesPick(null)
            if (pick && indices) {
              void downloadCertPdf(pick.formKey, pick.caseId, pick.destination, indices)
            }
          }}
        />


        {/* Panel 2: Detail (full width = 50% of 200%) */}
        <div className="w-1/2 h-full">
          <div className="h-full overflow-hidden px-lg py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
            <div className="relative h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
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
              {/* Top menu bar: 목록 / 변경이력 · 복제 · 삭제 — Editorial 서브 메뉴 */}
              <div className="h-9 shrink-0 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    // 검사/신고/서류 탭에서 열고 들어왔으면 이전 탭으로 복귀,
                    // 그 외(케이스 목록에서 선택)는 단순히 선택 해제.
                    const state = typeof window !== 'undefined' ? window.history.state : null
                    if (state?.caseDetailOrigin) {
                      window.history.back()
                    } else {
                      selectCase(null)
                    }
                  }}
                  className="px-2 py-1 font-mono text-[12px] uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  목록
                </button>
                {selectedCase && (
                  <div className="flex items-center gap-1">
                    <CaseHistory caseId={selectedCase.id} />
                    <button
                      type="button"
                      onClick={() => handleDuplicate(selectedCase.id)}
                      title="복제"
                      aria-label="복제"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedCase.id)}
                      title="삭제"
                      aria-label="삭제"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Card (scrolls inside) — 홈과 동일 패턴 */}
              <div className="flex-1 min-h-0 flex flex-col">
                {selectedCase ? (
                  <CaseDetail caseRow={selectedCase} scrollRef={detailScrollRef} simpleMode={simpleMode} />
                ) : (
                  <CaseDetailEmpty />
                )}
              </div>

              {/* Footer: 접수일/수정일 + 이력/삭제 */}
              <div className="shrink-0 pt-2 text-[13px] text-muted-foreground flex items-center justify-between flex-wrap gap-y-2">
                {selectedCase ? (
                  <>
                    <span>
                      접수일 {formatDate(selectedCase.created_at)}
                      {selectedCase.updated_at !== selectedCase.created_at && (
                        <span className="ml-4">수정일 {formatDate(selectedCase.updated_at)}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => setSimpleMode((v) => !v)}
                        title={simpleMode ? '편집 모드로 전환' : '심플 모드로 전환 (편집 UI 숨김)'}
                        className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                      >
                        {simpleMode ? '편집' : '심플'}
                      </button>
                      <label className="flex items-center gap-xs select-none cursor-pointer rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors">
                        <input
                          type="checkbox"
                          checked={includeSignature}
                          onChange={(e) => setIncludeSignature(e.target.checked)}
                          className="cursor-pointer"
                        />
                        서명
                      </label>
                      {(() => {
                        const focusDest = activeDestination ?? firstDestination(selectedCase)
                        return resolveCerts(focusDest, certConfig, (selectedCase.data as Record<string, unknown>)?.species as string | undefined).map((btn) =>
                          btn.type === 'multi' ? (
                            <button
                              key={btn.key}
                              type="button"
                              onClick={() => handleMultiForm(selectedCase.id, (CERT_MULTI_KEYS[btn.key] ?? btn.key) as 'AnnexIII' | 'UK')}
                              className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {btn.label}
                            </button>
                          ) : (
                            <button
                              key={btn.key}
                              type="button"
                              onClick={() => {
                                const formKey = CERT_FORM_KEYS[btn.key]
                                if (!formKey) return
                                const cap = RABIES_SLOT_CAP[formKey]
                                if (cap !== undefined) {
                                  const dataObj = (selectedCase.data ?? {}) as Record<string, unknown>
                                  const rabiesAll = Array.isArray(dataObj.rabies_dates) ? dataObj.rabies_dates : []
                                  // 별지 25호/EX 는 타병원 접종 제외하므로 그 수만 cap 비교.
                                  const rabies = rabiesAll.filter((r) => {
                                    if (r && typeof r === 'object' && !Array.isArray(r)) {
                                      return !(r as { other_hospital?: boolean }).other_hospital
                                    }
                                    return true
                                  })
                                  if (rabies.length > cap) {
                                    setRabiesPick({
                                      caseId: selectedCase.id,
                                      formKey: formKey as 'Form25' | 'Form25AuNz',
                                      rabiesDates: dataObj.rabies_dates,
                                      destination: focusDest,
                                      cap,
                                    })
                                    return
                                  }
                                }
                                void downloadCertPdf(formKey, selectedCase.id, focusDest)
                              }}
                              className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {btn.label}
                            </button>
                          ),
                        )
                      })()}
                      <ImportReportToggle caseRow={selectedCase} onUpdate={updateLocalCaseField} />
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
