'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCases } from './cases-context'
import { formatDate } from '@/lib/utils'
import { CaseList, filterCases } from './case-list'
import { CaseDetail, CaseDetailEmpty } from './case-detail'
import { CaseHeader } from './case-header'
import { CaseHistory } from './case-history'
import { createCase } from '@/lib/actions/create-case'
import { deleteCase } from '@/lib/actions/delete-case'
import { undoLastChange, updateCaseField } from '@/lib/actions/cases'
import { generateFormRE, generateFormAC, generateIdentificationDeclaration, generateForm25, generateForm25AuNz, generateAU, generateAU2, generateAUCat, generateAUCat2, generateNZ, generateOVD, generateVBC, generateSGP, generateTW, generateTK, generateAQS, generateCH, generateFormR11, generateVHC, previewSiblings, generateAnnexIIIMulti, generateUKMulti, recommendForm25RabiesSelection } from '@/lib/actions/generate-pdf'
import { downloadMultipartPdfRequest, downloadPdfRequest } from '@/lib/pdf-download'
import type { MultiFormKey } from '@/lib/pdf-multi-forms'
import { MultiFormDialog } from './multi-form-dialog'
import { RabiesSelectDialog, RABIES_SLOT_CAP } from './rabies-select-dialog'
import { ChevronLeft, ChevronRight, Link2, Smartphone, Trash2 } from 'lucide-react'
import { AssigneePicker } from './assignee-picker'
import { ShareLinkDialog } from './share-link-dialog'
import { PortalPreviewDialog } from './portal-preview-dialog'
import { resolveCerts, buildCaseJourneyContext, SINGLE_DOSE_RABIES_DESTINATIONS, isRabiesTiterReturnOnly } from '@petmove/domain'
import type { CaseRow } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { evaluateCase } from './verification-context'
import { toastError } from '@/lib/toast-bus'
import { listOrgDisabledChecks } from '@/lib/actions/org-disabled-checks'
import { inspectMissingPdfFields } from '@/lib/actions/inspect-missing-pdf-fields'

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
  vbc: generateVBC,
  sgp: generateSGP,
  tw: generateTW,
  tk: generateTK,
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
  vbc: 'VBC',
  sgp: 'SGP',
  tw: 'TW',
  tk: 'TK',
  aqs: 'AQS_279',
  ch: 'CH',
  formR11: 'Form_R11',
  vhc: 'VHC',
}

/** Cert key → multi-form dialog formKey mapping */
const CERT_MULTI_KEYS: Record<string, MultiFormKey> = {
  annexIII: 'AnnexIII',
  uk: 'UK',
  nz: 'NZ',
  vbc: 'VBC',
  // 태국 R.1/1 — 양식의 좌·우 칸에 두 마리까지 한 장(2026-08-24).
  formR11: 'Form_R11',
}

/** rabies_titer_records 의 1차 (가장 오래된) 검사 날짜. FormRE 의 "기재 대상" 판정용. */
function computeFirstTiterDate(records: unknown): string | null {
  if (!Array.isArray(records)) return null
  const dates = records
    .map((r) => (r && typeof r === 'object' ? (r as { date?: unknown }).date : null))
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort()
  return dates[0] ?? null
}

/** 케이스의 표시 순서상 첫 번째 destination 만 추출. multi 일 때 신고/서류 탭은 이 값만 사용. */
function firstDestination(row: CaseRow): string | null {
  if (!row.destination) return null
  const dests = row.destination.split(',').map(s => s.trim()).filter(Boolean)
  return dests[0] ?? null
}

function Inner({ moveTargetName = null }: { moveTargetName?: string | null }) {
  const { cases, selectedId, selectCase, addLocalCase, removeLocalCase, updateLocalCaseField, activeDestination, certConfig, caseAssigneeEnabled, orgMembers, searchQuery, navCaseIds } = useCases()
  const confirm = useConfirm()
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedId) ?? null,
    [cases, selectedId],
  )
  // 좌우 화살표는 현재 보고 있는 목록 안에서만 순회 — 고객 목록이면 검색 결과,
  // 검사/신고/서류 탭이면 그 탭의 정렬·필터 결과(navCaseIds 로 context 공유).
  // navCaseIds 가 아직 비어 있으면 검색 결과로 폴백.
  const { prevCase, nextCase } = useMemo(() => {
    if (!selectedCase) return { prevCase: null as CaseRow | null, nextCase: null as CaseRow | null }
    const order = navCaseIds.length > 0 ? navCaseIds : filterCases(cases, searchQuery).map((c) => c.id)
    const idx = order.indexOf(selectedCase.id)
    if (idx < 0) return { prevCase: null as CaseRow | null, nextCase: null as CaseRow | null }
    const prevId = idx > 0 ? order[idx - 1] : null
    const nextId = idx < order.length - 1 ? order[idx + 1] : null
    return {
      prevCase: prevId ? cases.find((c) => c.id === prevId) ?? null : null,
      nextCase: nextId ? cases.find((c) => c.id === nextId) ?? null : null,
    }
  }, [navCaseIds, cases, searchQuery, selectedCase])
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const [multiForm, setMultiForm] = useState<{ caseId: string; formKey: MultiFormKey; destination: string | null } | null>(null)
  const [shareOpen, setShareOpen] = useState<{ case: CaseRow; label: string } | null>(null)
  const [previewOpen, setPreviewOpen] = useState<{ caseId: string; label: string } | null>(null)
  // 별지 25호/EX 의 광견병 슬롯이 부족할 때 띄우는 선택 모달.
  const [rabiesPick, setRabiesPick] = useState<
    | { caseId: string; formKey: 'Form25' | 'Form25AuNz' | 'FormRE'; rabiesDates: unknown; destination: string | null; cap: number; eligibleAfterDate?: string | null; includeOtherHospital?: boolean; recommendedIndices?: number[] | null }
    | null
  >(null)
  const [includeSignature, setIncludeSignature] = useState(false)
  // 수의사/병원/발급일 노출 토글 — 기본 ON. 끄면 vet:*, vet_visit_date, today_* 계열 및
  // vet_/hospital_/issue_date 필드를 공백으로 출력 (서명 토글과 독립).
  const [includeVet, setIncludeVet] = useState(true)
  // org_disabled_checks 캐시 — 마운트 후 한 번 로드. PDF 발급 게이트가 사용.
  const [disabledChecks, setDisabledChecks] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    void (async () => {
      const r = await listOrgDisabledChecks()
      if (r.ok) setDisabledChecks(new Set(r.value))
    })()
  }, [])

  const confirmIfFailing = useCallback(
    async (caseRow: CaseRow, destination: string | null, formKey?: string): Promise<boolean> => {
      // 1) 절차 검증 — blocker/warning 만 노출 (info 는 안 묻고 통과)
      const results = evaluateCase(caseRow, destination, disabledChecks)
      const failing = results.filter((r) => !r.result.ok && r.check.severity !== 'info')

      // 2) PDF 빈 필드 — formKey 있을 때만 검사
      let missingLabels: string[] = []
      if (formKey) {
        const r = await inspectMissingPdfFields(formKey, [caseRow.id], destination)
        if (r.ok && r.cases.length > 0) missingLabels = r.cases[0].missingLabels
      }

      if (failing.length === 0 && missingLabels.length === 0) return true

      // 한 다이얼로그에 합쳐 표시 (①A)
      const lines: string[] = []
      if (failing.length > 0) {
        lines.push('검증 실패:')
        lines.push(...failing.slice(0, 8).map(({ result }) => `  • ${result.message}`))
        if (failing.length > 8) lines.push(`  외 ${failing.length - 8}건…`)
      }
      if (missingLabels.length > 0) {
        if (lines.length > 0) lines.push('')
        lines.push('비어 있는 정보:')
        lines.push(...missingLabels.map((l) => `  • ${l}`))
      }
      const titleParts: string[] = []
      if (failing.length > 0) titleParts.push(`검증 실패 ${failing.length}건`)
      if (missingLabels.length > 0) titleParts.push(`비어 있는 정보 ${missingLabels.length}개`)
      return confirm({
        message: `${titleParts.join(' · ')}이 있습니다. 그래도 발급할까요?`,
        description: lines.join('\n'),
        okLabel: '발급',
        cancelLabel: '취소',
        variant: 'destructive',
      })
    },
    [confirm, disabledChecks],
  )

  /**
   * Multi-form (AnnexIII / UK / NZ / VBC) 발급용 — 선택된 여러 케이스를 한 다이얼로그
   * 안에서 동물별로 묶어 절차 검증 + 빈 필드 사전 안내. MultiFormDialog 가 발급 직전 호출.
   */
  const preflightConfirmMulti = useCallback(
    async (caseIds: string[], destination: string | null, formKey: string): Promise<boolean> => {
      // 1) 케이스별 절차 검증 (cases context 에서 로드)
      const rows = caseIds
        .map((id) => cases.find((c) => c.id === id))
        .filter((c): c is CaseRow => !!c)
      const perCase = rows.map((row) => {
        const results = evaluateCase(row, destination, disabledChecks)
        const failing = results.filter((r) => !r.result.ok && r.check.severity !== 'info')
        return { row, failing: failing.map((f) => f.result.message) }
      })
      // 2) 빈 필드 — 한 번에 모든 ids 요청
      const r = await inspectMissingPdfFields(formKey, caseIds, destination)
      const missingByCase = new Map<string, string[]>()
      if (r.ok) for (const c of r.cases) missingByCase.set(c.caseId, c.missingLabels)

      // 동물별 블록 구성
      const blocks: string[] = []
      let totalFailing = 0
      let totalMissing = 0
      for (const { row, failing } of perCase) {
        const missing = missingByCase.get(row.id) ?? []
        if (failing.length === 0 && missing.length === 0) continue
        const heading = row.pet_name ?? row.pet_name_en ?? row.customer_name ?? '(이름 없음)'
        const inner: string[] = [`${heading}:`]
        if (failing.length > 0) {
          inner.push(...failing.slice(0, 5).map((m) => `  • ${m}`))
          if (failing.length > 5) inner.push(`  외 ${failing.length - 5}건…`)
          totalFailing += failing.length
        }
        if (missing.length > 0) {
          if (failing.length > 0) inner.push('  ── 비어 있는 정보:')
          inner.push(...missing.map((l) => `  • ${l}`))
          totalMissing += missing.length
        }
        blocks.push(inner.join('\n'))
      }
      if (blocks.length === 0) return true

      const titleParts: string[] = []
      if (totalFailing > 0) titleParts.push(`검증 실패 ${totalFailing}건`)
      if (totalMissing > 0) titleParts.push(`비어 있는 정보 ${totalMissing}개`)
      return confirm({
        message: `${titleParts.join(' · ')}이 있습니다. 그래도 발급할까요?`,
        description: blocks.join('\n\n'),
        okLabel: '발급',
        cancelLabel: '취소',
        variant: 'destructive',
      })
    },
    [cases, confirm, disabledChecks],
  )

  // Reset detail scroll to top when selected case changes
  useEffect(() => {
    detailScrollRef.current?.scrollTo(0, 0)
  }, [selectedId])

  const handleAdd = useCallback(async () => {
    const result = await createCase()
    if (result.ok) {
      addLocalCase(result.case)
    } else {
      toastError('케이스 생성 실패', result.error)
    }
  }, [addLocalCase])

  // Ctrl+Z: undo last change on selected case
  // Ctrl+←/→: 이전/다음 케이스로 이동 (인풋 포커스 중에는 커서 이동과 충돌하므로 무시)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && selectedId) {
        e.preventDefault()
        undoLastChange(selectedId).then((result) => {
          if (result.ok) {
            // by_dest 이력 복원이면 destination 이 내려온다 — by_dest 경로로 로컬 반영
            // (안 넘기면 top-level 에 써져 서버 복원 값과 어긋난다).
            updateLocalCaseField(
              selectedId,
              result.storage,
              result.key,
              result.restoredValue,
              result.destination ?? null,
            )
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
      const row = cases.find((c) => c.id === caseId)
      if (row && !(await confirmIfFailing(row, destination, formKey))) return
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
            | 'TW'
            | 'TK'
            | 'AQS_279'
            | 'CH'
            | 'Form_R11'
            | 'VHC',
          caseId,
          includeSignature,
          includeVet,
          destination,
          ...(rabiesIndices ? { rabiesIndices } : {}),
        })
      } catch (error) {
        toastError('PDF 다운로드 실패', error instanceof Error ? error.message : '잠시 후 다시 시도하세요.')
      }
    },
    [includeSignature, includeVet, cases, confirmIfFailing],
  )

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
  const handleMultiForm = useCallback(async (caseId: string, formKey: MultiFormKey, destination: string | null) => {
    const row = cases.find((c) => c.id === caseId)
    if (row && !(await confirmIfFailing(row, destination))) return
    const p = await previewSiblings(caseId, formKey, destination)
    if (!p.ok) { toastError('서류 준비 실패', p.error); return }
    if (p.preview.cases.length <= 1) {
      const ids = p.preview.cases.map(c => c.id)
      try {
        await downloadMultipartPdfRequest({ kind: 'multi', formKey, caseIds: ids, includeVet, destination }, p.preview.docCount)
      } catch (error) {
        toastError('PDF 다운로드 실패', error instanceof Error ? error.message : '잠시 후 다시 시도하세요.')
      }
      return
    }
    setMultiForm({ caseId, formKey, destination })
  }, [cases, confirmIfFailing, includeVet])

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
          <div className="h-full overflow-hidden px-md md:px-lg py-md md:py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
            <div className="h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
              <CaseList onAdd={handleAdd} moveTargetName={moveTargetName} />
            </div>
          </div>
        </div>

        {multiForm && (
          <MultiFormDialog
            caseId={multiForm.caseId}
            formKey={multiForm.formKey}
            includeVet={includeVet}
            destination={multiForm.destination}
            onPreflightConfirm={preflightConfirmMulti}
            onClose={() => setMultiForm(null)}
          />
        )}

        {shareOpen && (
          <ShareLinkDialog
            caseRow={shareOpen.case}
            caseLabel={shareOpen.label}
            onClose={() => setShareOpen(null)}
          />
        )}

        {previewOpen && (
          <PortalPreviewDialog
            caseId={previewOpen.caseId}
            caseLabel={previewOpen.label}
            destination={activeDestination}
            onClose={() => setPreviewOpen(null)}
          />
        )}

        <RabiesSelectDialog
          open={!!rabiesPick}
          formLabel={
            rabiesPick?.formKey === 'Form25AuNz' ? '별지 25호 EX (호주/뉴질랜드)' :
            rabiesPick?.formKey === 'FormRE' ? '일본 재입국 (FormRE)' :
            '별지 25호'
          }
          slotCount={rabiesPick?.cap ?? 3}
          rabiesDates={rabiesPick?.rabiesDates}
          eligibleAfterDate={rabiesPick?.eligibleAfterDate}
          includeOtherHospital={rabiesPick?.includeOtherHospital}
          recommendedIndices={rabiesPick?.recommendedIndices}
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
          <div className="h-full overflow-hidden px-md md:px-lg py-md md:py-10 2xl:px-xl 3xl:px-2xl 4xl:px-3xl">
            <div className="relative h-full mx-auto max-w-5xl 3xl:max-w-6xl 4xl:max-w-7xl">
              {selectedCase && (
                <>
                  {/* 데스크톱 전용 — 컨테이너 바깥쪽 화살표. 모바일에선 화면 밖이라 숨김
                      (모바일은 좌측 슬라이드로 목록 복귀 → 다른 케이스 선택 흐름). */}
                  <button
                    type="button"
                    onClick={() => prevCase && selectCase(prevCase.id)}
                    disabled={!prevCase}
                    aria-label="이전 케이스 (Ctrl+←)"
                    title="이전 케이스 (Ctrl+←)"
                    className="hidden md:block absolute -left-12 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    onClick={() => nextCase && selectCase(nextCase.id)}
                    disabled={!nextCase}
                    aria-label="다음 케이스 (Ctrl+→)"
                    title="다음 케이스 (Ctrl+→)"
                    className="hidden md:block absolute -right-12 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
              <div className="h-full flex flex-col gap-4">
              {/* Top menu bar: 돌아가기 / 변경이력 · 복제 · 삭제 — Editorial 서브 메뉴 */}
              <div className="h-9 shrink-0 px-md md:px-lg flex items-center justify-between">
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
                  className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[13px] uppercase tracking-[0.5px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  돌아가기
                </button>
                {selectedCase && (
                  <div className="flex items-center gap-1">
                    {caseAssigneeEnabled && (
                      <AssigneePicker
                        caseId={selectedCase.id}
                        currentAssigneeId={selectedCase.assigned_to ?? null}
                        members={orgMembers}
                        onChanged={(next) =>
                          updateLocalCaseField(selectedCase.id, 'column', 'assigned_to', next)
                        }
                      />
                    )}
                    <CaseHistory caseId={selectedCase.id} />
                    <button
                      type="button"
                      onClick={() => setPreviewOpen({
                        caseId: selectedCase.id,
                        label: `${selectedCase.customer_name || '(이름 없음)'}${selectedCase.pet_name ? ` / ${selectedCase.pet_name}` : ''}`,
                      })}
                      title="고객앱 미리보기"
                      aria-label="고객앱 미리보기"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareOpen({
                        case: selectedCase,
                        label: `${selectedCase.customer_name || '(이름 없음)'}${selectedCase.pet_name ? ` · ${selectedCase.pet_name}` : ''}`,
                      })}
                      title="정보 요청 링크 (보호자에게 추가 정보 요청)"
                      aria-label="정보 요청 링크"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                    {/* 삭제는 파괴적 동작 — 안전한 아이콘들과 얇은 구분선으로 시각적으로 떼어 눈에 띄게(오클릭 방지는 확인 팝업이 담당). */}
                    <span aria-hidden className="mx-0.5 h-4 w-px bg-border/70" />
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedCase.id)}
                      title="삭제"
                      aria-label="삭제"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* 상세 상단 고정 헤더 — 스크롤되는 필드 위에 남아 케이스 정체성을 잡아준다. */}
              {selectedCase && <CaseHeader caseRow={selectedCase} />}

              {/* Card (scrolls inside) — 홈과 동일 패턴
                  peer: 모바일에서 카드 내부 input/textarea 포커스 시
                  형제 footer 가 max-md:peer-focus-within:hidden 으로 숨겨져
                  키보드 올라온 좁은 공간을 확보. 데스크톱(md+) 무영향. */}
              <div className="peer flex-1 min-h-0 flex flex-col">
                {selectedCase ? (
                  <CaseDetail caseRow={selectedCase} scrollRef={detailScrollRef} />
                ) : (
                  <CaseDetailEmpty />
                )}
              </div>

              {/* Footer: 접수일/수정일 + 이력/삭제 */}
              <div className="shrink-0 px-md md:px-lg pt-2 text-[13px] text-muted-foreground flex items-center justify-between flex-wrap gap-y-2 max-md:peer-focus-within:hidden">
                {selectedCase ? (
                  <>
                    <span className="hidden md:inline">
                      접수일 {formatDate(selectedCase.created_at)}
                      {selectedCase.updated_at !== selectedCase.created_at && (
                        <span className="ml-4">수정일 {formatDate(selectedCase.updated_at)}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 flex-nowrap overflow-x-auto scrollbar-hide pr-20 justify-start w-full md:w-auto md:flex-wrap md:overflow-visible md:pr-0 md:justify-end">
                      <label className="shrink-0 whitespace-nowrap flex items-center gap-xs select-none cursor-pointer rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors">
                        <input
                          type="checkbox"
                          checked={includeSignature}
                          onChange={(e) => setIncludeSignature(e.target.checked)}
                          className="cursor-pointer"
                        />
                        서명
                      </label>
                      <label
                        className="shrink-0 whitespace-nowrap flex items-center gap-xs select-none cursor-pointer rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                        title="해제 시 수의사·병원 정보 및 서류 발행일을 비웁니다"
                      >
                        <input
                          type="checkbox"
                          checked={includeVet}
                          onChange={(e) => setIncludeVet(e.target.checked)}
                          className="cursor-pointer"
                        />
                        수의사
                      </label>
                      {(() => {
                        const focusDest = activeDestination ?? firstDestination(selectedCase)
                        return resolveCerts(focusDest, certConfig, (selectedCase.data as Record<string, unknown>)?.species as string | undefined).map((btn) =>
                          btn.type === 'multi' ? (
                            <button
                              key={btn.key}
                              type="button"
                              onClick={() => handleMultiForm(selectedCase.id, (CERT_MULTI_KEYS[btn.key] ?? btn.key) as MultiFormKey, focusDest)}
                              className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {btn.label}
                            </button>
                          ) : (
                            <button
                              key={btn.key}
                              type="button"
                              onClick={async () => {
                                const formKey = CERT_FORM_KEYS[btn.key]
                                if (!formKey) return
                                const cap = RABIES_SLOT_CAP[formKey]
                                if (cap !== undefined) {
                                  const dataObj = (selectedCase.data ?? {}) as Record<string, unknown>
                                  const rabiesAll = Array.isArray(dataObj.rabies_dates) ? dataObj.rabies_dates : []
                                  if (formKey === 'FormRE') {
                                    // FormRE: 타병원 포함 모든 접종 중 1차 항체검사 이후가 2개 이상이면 모달.
                                    const firstTiter = computeFirstTiterDate(dataObj.rabies_titer_records)
                                    if (firstTiter) {
                                      const postTiterCount = rabiesAll.filter((r) => {
                                        const d = typeof r === 'string' ? r : (r && typeof r === 'object' ? (r as { date?: string }).date : null)
                                        return typeof d === 'string' && d > firstTiter
                                      }).length
                                      if (postTiterCount >= 2) {
                                        setRabiesPick({
                                          caseId: selectedCase.id,
                                          formKey: 'FormRE',
                                          rabiesDates: dataObj.rabies_dates,
                                          eligibleAfterDate: firstTiter,
                                          destination: focusDest,
                                          cap,
                                          includeOtherHospital: true,
                                        })
                                        return
                                      }
                                    }
                                  } else {
                                    // 별지 25호/EX: 타병원 접종 제외하고 카운트
                                    const rabies = rabiesAll.filter((r) => {
                                      if (r && typeof r === 'object' && !Array.isArray(r)) {
                                        return !(r as { other_hospital?: boolean }).other_hospital
                                      }
                                      return true
                                    })
                                    // "최근 1건이면 충분한" 모델 국가(1회+항체검사: EU·태국·필리핀, 또는
                                    // 입국 항체검사 없음: 미국·캐나다 등) + 접종 2건 이상이면, 국가 규칙으로
                                    // 추천 선택(기본 최근 1건, 규정 미달 시 anchor 까지)을 받아 모달을
                                    // 프리셀렉트로 연다. cap(3) 이하라도 "최근 것만" 이 기본이라 모달 노출.
                                    const destKey = buildCaseJourneyContext({ ...selectedCase, destination: focusDest }).destinationKey
                                    const smartModel =
                                      (!!destKey && SINGLE_DOSE_RABIES_DESTINATIONS.includes(destKey)) ||
                                      isRabiesTiterReturnOnly(focusDest)
                                    if (smartModel && rabies.length >= 2) {
                                      const rec = await recommendForm25RabiesSelection(
                                        selectedCase.id,
                                        formKey as 'Form25' | 'Form25AuNz',
                                        focusDest,
                                      )
                                      setRabiesPick({
                                        caseId: selectedCase.id,
                                        formKey: formKey as 'Form25' | 'Form25AuNz',
                                        rabiesDates: dataObj.rabies_dates,
                                        destination: focusDest,
                                        cap,
                                        recommendedIndices: rec.applies ? rec.indices : null,
                                      })
                                      return
                                    }
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
                                }
                                void downloadCertPdf(formKey, selectedCase.id, focusDest)
                              }}
                              className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {btn.label}
                            </button>
                          ),
                        )
                      })()}
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

export function CasesApp({ moveTargetName = null }: { moveTargetName?: string | null }) {
  return <Inner moveTargetName={moveTargetName} />
}
