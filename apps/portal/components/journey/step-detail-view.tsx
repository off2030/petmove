'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  createVaccineLookups,
  findRabiesChainBreak,
  todayKst,
  validateAdvanceNotification,
  validateJpEntryDate,
  validateJpExportReservationDate,
  validateJpExportVisitDate,
  validateJpImportDate,
  validateKrExportDate,
  validateKrImportDate,
  validateMicrochipBeforeBooster,
  validateRabiesInterval,
  validateRabiesPrimeAge,
  validateTiterAfterBooster,
  validateTiterWithinChain,
  validateVetVisitDate,
  type CheckResult,
  type ProcedureCheck,
  type StepDefinition,
  type VaccineProductsData,
} from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import {
  getCaseVaccineData,
  markAdvanceNotificationApprovalSkipped,
  markJpExportQuarantineReservationSkipped,
  markTiterResultConfirmed,
  updateAdvanceNotificationDate,
  updateCaseTripType,
  updateFlightFields,
  updateJpExportQuarantineFields,
  updateJpExportQuarantineVisitDate,
  updateJpImportQuarantineDate,
  updateKrExportQuarantineDate,
  updateKrImportQuarantineDate,
  updateMicrochipFields,
  updateRabiesEntryFields,
  updateRabiesExtraEntries,
  updateTiterExtraEntries,
  updateTiterFields,
  updateVetVisitDate,
} from '@/lib/actions/cases'
import { readCaseDocuments } from '@/lib/documents'
import { AdvanceNotificationInputs } from './advance-notification-inputs'
import { FlightInputs, type FlightForm } from './flight-inputs'
import { JpExportQuarantineInputs, type JpExportForm } from './jp-export-quarantine-inputs'
import { JpExportQuarantineVisitInputs } from './jp-export-quarantine-visit-inputs'
import { JpImportQuarantineInputs } from './jp-import-quarantine-inputs'
import { KrExportQuarantineInputs } from './kr-export-quarantine-inputs'
import { KrImportQuarantineInputs } from './kr-import-quarantine-inputs'
import { MicrochipInputs } from './microchip-inputs'
import { RabiesEntryInputs, type RabiesEntryForm, type RabiesProductHints } from './rabies-entry-inputs'
import { RabiesExtraInputs, type RabiesExtraEntry } from './rabies-extra-inputs'
import { StepAttachments } from './step-attachments'
import { StepDocChecklist } from './step-doc-checklist'
import { TiterExtraInputs, type TiterExtraEntry } from './titer-extra-inputs'
import { TiterInputs, type TiterForm } from './titer-inputs'
import { VetVisitInputs } from './vet-visit-inputs'

interface CollectedCheck {
  check: ProcedureCheck
  result: CheckResult
}

/**
 * 케이스 step 상세 화면. Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 4 영역:
 *  1) 헤더 — back link / 동그라미+title / 펫·여행
 *  2) 설명 — step.description (마크다운은 단순 줄바꿈만)
 *  3) ⚠ 경고 — 매핑된 procedure-checks 중 ok=false
 *  4) 입력 필드 — microchip·광견병1·2차·항체 검사 step 은 인터랙티브, 그 외는 read-only 스키마
 *
 * 인터랙티브 step 의 폼 state·dirty·save 는 이 컴포넌트에서 관리. 하단 sticky
 * '저장' 바가 화면 전체 폼 변경을 한 번에 commit. 입력 컴포넌트
 * (MicrochipInputs / RabiesEntryInputs / TiterInputs) 는 controlled — 입력만 담당.
 */
export function StepDetailView({
  caseId,
  step,
  done,
  stepNumber,
  checkResults,
  destinationKey,
  tripType,
  hasDownstreamData,
  activeDest,
}: {
  caseId: string
  step: StepDefinition
  done: boolean
  /** applicable step 들 안에서 1-based 순번. 일정 row 의 좌측 번호와 동일. */
  stepNumber: number
  checkResults: CollectedCheck[]
  /** 정규화된 목적지 키 ('japan' 등) — 입력 cross-validation 분기에 사용. */
  destinationKey: string | null
  tripType: 'round' | 'one_way'
  /** 이 step 보다 뒤(후행) 적용 단계에 이미 입력된 데이터가 있는지 — 수정·삭제 전 '주의' 확인창 조건. */
  hasDownstreamData: boolean
  /** 활성 목적지(?dest=) 토큰 — 다중 목적지에서 입력값 읽기·저장을 그 목적지(by_dest)로 분기. */
  activeDest?: string | null
}) {
  const isMicrochip = step.id === 'microchip'
  const isRabies1 = step.id === 'rabies-vaccine-1'
  const isRabies2 = step.id === 'rabies-vaccine-2'
  const isRabies = isRabies1 || isRabies2
  const isRabiesExtra = step.id === 'rabies-vaccine-extra'
  // rabies_dates 배열 내 위치 — 1차=0, 2차=1.
  const rabiesIndex = isRabies2 ? 1 : 0
  const isTiter = step.id === 'rabies-titer'
  const isTiterExtra = step.id === 'rabies-titer-extra'
  const isFlight = step.id === 'flight-purchase'
  const isAdvanceNotification = step.id === 'advance-notification'
  const isVetVisit = step.id === 'vet-visit'
  const isJpExportQuarantine = step.id === 'jp-export-quarantine'
  const isCertificateIssue = step.id === 'certificate-issue'
  // 일본 수입 동물검역 = 'departure' step 의 일본 override (override 가 검역일 input 을 실음).
  const isJpImportQuarantine =
    step.id === 'departure' &&
    (step.inputs ?? []).some((i) => i.key === 'jp_import_quarantine_date')
  const isJpExportQuarantineVisit = step.id === 'jp-export-quarantine-visit'
  const isKrImportQuarantine = step.id === 'kr-import-quarantine'
  const isInteractive =
    isMicrochip ||
    isRabies ||
    isRabiesExtra ||
    isTiter ||
    isTiterExtra ||
    isFlight ||
    isAdvanceNotification ||
    isVetVisit ||
    isJpExportQuarantine ||
    isCertificateIssue ||
    isJpImportQuarantine ||
    isJpExportQuarantineVisit ||
    isKrImportQuarantine
  const caseRowRaw = useCase(caseId)
  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁힌다 — 아래 모든 saved* 읽기·동기화
  // useEffect 가 그 목적지(by_dest) 기준이 된다. 단일 목적지면 뷰가 원본과 동일(무변경).
  // useMemo 로 식별자 안정화 — 매 렌더 새 객체면 [caseRow?.data] deps useEffect 가 폼을 계속
  // 되돌려 입력이 막힌다.
  const caseRow = useMemo(
    () => (caseRowRaw ? activeDestinationView(caseRowRaw, activeDest) : caseRowRaw),
    [caseRowRaw, activeDest],
  )
  const { updateCase } = useCases()

  // 인터랙티브 step 폼 state — 다른 step 에서는 렌더 안 함. hooks 는 매번 호출.
  const savedChip = caseRow?.microchip ?? ''
  const savedDate = readImplantDate(caseRow?.data)
  const [chip, setChip] = useState(savedChip)
  const [date, setDate] = useState(savedDate)

  const savedRabies = readRabiesEntryForm(caseRow?.data, rabiesIndex)
  const [rabies, setRabies] = useState<RabiesEntryForm>(savedRabies)
  // 광견병 step 한정 — org 백신 카탈로그 ("지정 약품" 힌트 계산용).
  const [vaccineData, setVaccineData] = useState<VaccineProductsData | null>(null)

  // 광견병 추가 백신(3차+) — 빈 상태에서도 입력칸 한 장이 보이도록 최소 1장 유지.
  const savedRabiesExtra = readRabiesExtraEntries(caseRow?.data)
  const [rabiesExtra, setRabiesExtra] = useState<RabiesExtraEntry[]>(
    savedRabiesExtra.length === 0 ? [makeEmptyExtra()] : savedRabiesExtra,
  )

  const savedTiterForm = readTiterForm(caseRow?.data)
  const [titerForm, setTiterForm] = useState<TiterForm>(savedTiterForm)

  // 광견병 추가 항체 검사(2회차+) — 빈 상태에서도 카드 1장이 보이도록 최소 1장 유지.
  const savedTiterExtra = readTiterExtraEntries(caseRow?.data)
  const [titerExtra, setTiterExtra] = useState<TiterExtraEntry[]>(
    savedTiterExtra.length === 0 ? [makeEmptyTiterExtra()] : savedTiterExtra,
  )

  const savedFlightForm = readFlightForm(caseRow?.data)
  const [flightForm, setFlightForm] = useState<FlightForm>(savedFlightForm)

  const savedAdvanceDate = readAdvanceDate(caseRow?.data)
  const [advanceDate, setAdvanceDate] = useState(savedAdvanceDate)

  const savedVetVisitDate = readVetVisitDate(caseRow?.data)
  const [vetVisitDate, setVetVisitDate] = useState(savedVetVisitDate)

  const savedJpExport = readJpExportForm(caseRow?.data)
  const [jpExport, setJpExport] = useState<JpExportForm>(savedJpExport)

  const savedKrExportQuarantineDate = readKrExportQuarantineDate(caseRow?.data)
  const [krExportQuarantineDate, setKrExportQuarantineDate] = useState(savedKrExportQuarantineDate)

  const savedJpImportQuarantineDate = readJpImportQuarantineDate(caseRow?.data)
  // 검역일이 비어있으면 일본 도착 항공편 날짜(입국일)를 예정일 기본값으로 — 자동 채움값(baseline)과
  // 같으면 dirty 아님(버튼 비활성). 보호자가 직접 바꿔야 dirty(활성).
  const jpImportQuarantineBaseline =
    savedJpImportQuarantineDate || (isJpImportQuarantine ? savedFlightForm.entry_date.slice(0, 10) : '')
  const [jpImportQuarantineDate, setJpImportQuarantineDate] = useState(jpImportQuarantineBaseline)

  const savedJpExportQuarantineVisitDate = readJpExportQuarantineVisitDate(caseRow?.data)
  // 검역일이 비어있으면 신청 예약일을 예정일 기본값으로 — baseline 과 같으면 dirty 아님(버튼 비활성).
  const jpExportQuarantineVisitBaseline =
    savedJpExportQuarantineVisitDate || (isJpExportQuarantineVisit ? savedJpExport.date : '')
  const [jpExportQuarantineVisitDate, setJpExportQuarantineVisitDate] =
    useState(jpExportQuarantineVisitBaseline)

  const savedKrImportQuarantineDate = readKrImportQuarantineDate(caseRow?.data)
  // 검역일이 비어있으면 귀국 항공편 날짜를 예정일 기본값으로 — baseline 과 같으면 dirty 아님(버튼 비활성).
  const krImportQuarantineBaseline =
    savedKrImportQuarantineDate || (isKrImportQuarantine ? savedFlightForm.return_date.slice(0, 10) : '')
  const [krImportQuarantineDate, setKrImportQuarantineDate] = useState(krImportQuarantineBaseline)

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 하단 sticky 저장 바가 마지막 입력 필드를 가리지 않도록 — 바 높이를 재서 컨텐츠
  // paddingBottom 을 맞춘다. 저장 에러 시 바가 커지므로 그 시점에 맨 아래로 스크롤한다.
  const scrollRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(132)
  useEffect(() => {
    if (barRef.current) setBarHeight(barRef.current.offsetHeight)
    if (status === 'error' && scrollRef.current) {
      const el = scrollRef.current
      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
    }
  }, [isInteractive, status, error])

  const microchipDirty = isMicrochip && (chip !== savedChip || date !== savedDate)
  const rabiesDirty = isRabies && !rabiesFormEqual(rabies, savedRabies)
  // 저장 검증 실패 후 사용자가 form 을 만지면 error 자동 해제 — 시각 신호로 "다시 시도
  // 가능". dirty 자체는 form vs saved 비교라 사용자 변경이 같은 값으로 돌아가면 dirty=false
  // 가 되어 button disabled, 새 값이면 활성화. error 자동 해제는 step 무관 공통 처리.
  useEffect(() => {
    if (status === 'error') {
      setStatus('idle')
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chip,
    date,
    rabies,
    rabiesExtra,
    titerForm,
    titerExtra,
    flightForm,
    advanceDate,
    vetVisitDate,
    jpExport,
    krExportQuarantineDate,
    jpImportQuarantineDate,
    jpExportQuarantineVisitDate,
    krImportQuarantineDate,
  ])
  const rabiesExtraDirty = isRabiesExtra && !rabiesExtraEqual(rabiesExtra, savedRabiesExtra)
  const titerDirty =
    isTiter &&
    (titerForm.date !== savedTiterForm.date ||
      titerForm.lab !== savedTiterForm.lab ||
      titerForm.value !== savedTiterForm.value)
  const titerExtraDirty = isTiterExtra && !titerExtraEqual(titerExtra, savedTiterExtra)
  const flightDirty = isFlight && !flightFormEqual(flightForm, savedFlightForm)
  const advanceDirty = isAdvanceNotification && advanceDate !== savedAdvanceDate
  const vetVisitDirty = isVetVisit && vetVisitDate !== savedVetVisitDate
  const jpExportDirty = isJpExportQuarantine && !jpExportFormEqual(jpExport, savedJpExport)
  const krExportQuarantineDirty =
    isCertificateIssue && krExportQuarantineDate !== savedKrExportQuarantineDate
  const jpImportQuarantineDirty =
    isJpImportQuarantine && jpImportQuarantineDate !== jpImportQuarantineBaseline
  const jpExportQuarantineVisitDirty =
    isJpExportQuarantineVisit && jpExportQuarantineVisitDate !== jpExportQuarantineVisitBaseline
  const krImportQuarantineDirty =
    isKrImportQuarantine && krImportQuarantineDate !== krImportQuarantineBaseline
  const dirty =
    microchipDirty ||
    rabiesDirty ||
    rabiesExtraDirty ||
    titerDirty ||
    titerExtraDirty ||
    flightDirty ||
    advanceDirty ||
    vetVisitDirty ||
    jpExportDirty ||
    krExportQuarantineDirty ||
    jpImportQuarantineDirty ||
    jpExportQuarantineVisitDirty ||
    krImportQuarantineDirty
  // 저장 직후 1.5s 동안 버튼에 '저장됨' 표시. 그 사이 재편집하면 dirty 가 살아나 자동 해제.
  const justSaved = status === 'saved' && !dirty
  // 검역·검사 4단계 — '저장' 클릭(확인)으로 완료하는 step. 미래 날짜=예정(저장만 됨),
  // 오늘 이하 날짜를 저장하면 완료. done(prop)=resolveDone=저장된 확인 플래그.
  // vet-visit 은 별도 모델(완료 = '완료' 버튼 또는 모든 필수 서류 ✓) 이라 이 패턴에서 제외.
  const isConfirmStep =
    isCertificateIssue ||
    isJpImportQuarantine ||
    isJpExportQuarantineVisit ||
    isKrImportQuarantine
  const confirmFormDate = isCertificateIssue
    ? krExportQuarantineDate
    : isJpImportQuarantine
      ? jpImportQuarantineDate
      : isJpExportQuarantineVisit
        ? jpExportQuarantineVisitDate
        : isKrImportQuarantine
          ? krImportQuarantineDate
          : ''
  const confirmSavedDate = isCertificateIssue
    ? savedKrExportQuarantineDate
    : isJpImportQuarantine
      ? savedJpImportQuarantineDate
      : isJpExportQuarantineVisit
        ? savedJpExportQuarantineVisitDate
        : isKrImportQuarantine
          ? savedKrImportQuarantineDate
          : ''
  const todayStr = todayKst()
  // 버튼 문구·저장 확인 여부는 form(입력 중) 날짜 기준. 미래면 '예정일로 저장', 오늘 이하면 '저장'.
  const formUpcoming = isConfirmStep && confirmFormDate.length >= 10 && confirmFormDate > todayStr
  const formArrived = isConfirmStep && confirmFormDate.length >= 10 && confirmFormDate <= todayStr
  // 저장된 검진일이 오늘 이하인데 아직 확인(done) 전 — '예정일 지남, 저장 필요' 안내 노출.
  const savedArrivedUnconfirmed =
    isConfirmStep && confirmSavedDate.length >= 10 && confirmSavedDate <= todayStr && !done
  // 저장 버튼 활성: 변경됨(dirty) OR 검진일 도래했는데 아직 확인 전(저장 클릭으로 완료).
  const canSave = dirty || (formArrived && !done)
  // 신청·신고 step(검역 5단계 외) — 신청일/신고일이 미래면 버튼 라벨을 '예정일로 저장'으로.
  // 완료 판정은 신청일이 오늘 이하로 도래한 뒤(+ 예약/허가증/skip). canSave 는 dirty 그대로.
  const jpExportApplicationUpcoming =
    isJpExportQuarantine && jpExport.applicationDate.length >= 10 && jpExport.applicationDate > todayStr
  const advanceUpcoming = isAdvanceNotification && advanceDate.length >= 10 && advanceDate > todayStr
  // 추가 백신(3차+) — 입력 entry 중 하나라도 미래면 '예정일로 저장'. 도래한 entry 만으로
  // step 완료 — has-extra-rabies done 룰이 latest.date ≤ 오늘 게이트로 동일 판정.
  const rabiesExtraUpcoming =
    isRabiesExtra &&
    rabiesExtra.some((e) => typeof e.date === 'string' && e.date.length >= 10 && e.date > todayStr)
  // 출국 전 임상검사 — 검진일이 미래면 버튼 라벨만 '예정일로 저장'으로. 완료 판정은 별도 모델
  // (필수 서류 ✓ = has-vet-visit)이라 그대로 유지, canSave 도 dirty 그대로.
  const vetVisitUpcoming =
    isVetVisit && vetVisitDate.length >= 10 && vetVisitDate > todayStr
  // 광견병 항체 검사 — 채혈일이 미래면 '예정일로 저장'. 완료 판정은 2단계 모델
  // (결과값 OR 완료 플래그 = has-titer-entry)이라 canSave 는 dirty 그대로.
  const titerUpcoming = isTiter && titerForm.date.length >= 10 && titerForm.date > todayStr

  // dirty 일 때는 외부 변경(Realtime/admin push) 무시 — 사용자 입력 보존.
  useEffect(() => {
    if (!microchipDirty) setChip(caseRow?.microchip ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.microchip])
  useEffect(() => {
    if (!microchipDirty) setDate(readImplantDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!rabiesDirty) setRabies(readRabiesEntryForm(caseRow?.data, rabiesIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!rabiesExtraDirty) {
      const next = readRabiesExtraEntries(caseRow?.data)
      setRabiesExtra(next.length === 0 ? [makeEmptyExtra()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  // 광견병 step 진입 시 org 백신 카탈로그를 1회 로드 (1·2차 입력 + 추가 접종 표시 공용).
  useEffect(() => {
    if (!isRabies && !isRabiesExtra) return
    let cancelled = false
    void getCaseVaccineData(caseId).then((r) => {
      if (!cancelled && r.ok) setVaccineData(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, isRabies, isRabiesExtra])
  useEffect(() => {
    if (!titerDirty) setTiterForm(readTiterForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!titerExtraDirty) {
      const next = readTiterExtraEntries(caseRow?.data)
      setTiterExtra(next.length === 0 ? [makeEmptyTiterExtra()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!flightDirty) setFlightForm(readFlightForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!advanceDirty) setAdvanceDate(readAdvanceDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!vetVisitDirty) setVetVisitDate(readVetVisitDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!jpExportDirty) setJpExport(readJpExportForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!krExportQuarantineDirty) setKrExportQuarantineDate(readKrExportQuarantineDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!jpImportQuarantineDirty) setJpImportQuarantineDate(jpImportQuarantineBaseline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!jpExportQuarantineVisitDirty) setJpExportQuarantineVisitDate(jpExportQuarantineVisitBaseline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!krImportQuarantineDirty) setKrImportQuarantineDate(krImportQuarantineBaseline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])

  // 광견병 "지정 약품" 힌트 — 카탈로그 + 현재 접종일 기준. 타병원 접종이면
  // RabiesEntryInputs 가 otherHospital 로 표시를 억제.
  const rabiesLookups = useMemo(
    () => (vaccineData ? createVaccineLookups(vaccineData) : null),
    [vaccineData],
  )
  const rabiesProductHints = useMemo<RabiesProductHints | null>(() => {
    if (!rabiesLookups || !rabies.date) return null
    const r = rabiesLookups.lookupRabies(rabies.date)
    if (!r) return null
    return {
      product: r.vaccine || r.product || undefined,
      manufacturer: r.manufacturer || undefined,
      lot: r.batch || undefined,
      expiry: r.expiry || undefined,
    }
  }, [rabiesLookups, rabies.date])
  const rabiesOtherHospital = useMemo(
    () => readRabiesOtherHospital(caseRow?.data, rabiesIndex),
    [caseRow?.data, rabiesIndex],
  )
  // 추가 접종(3차+) 각 entry 의 접종일 기준 카탈로그 hint — 본병원일 때만 약품 4필드에 표시.
  const rabiesExtraProductHints = useMemo(
    () =>
      rabiesExtra.map((e): RabiesProductHints | null => {
        if (!rabiesLookups || !e.date) return null
        const r = rabiesLookups.lookupRabies(e.date)
        if (!r) return null
        return {
          product: r.vaccine || r.product || undefined,
          manufacturer: r.manufacturer || undefined,
          lot: r.batch || undefined,
          expiry: r.expiry || undefined,
        }
      }),
    [rabiesExtra, rabiesLookups],
  )

  // 저장을 막아야 하는 '입력 불가' 차단 검증을 한 곳에 모은다 — 통과(null)면 저장 가능, 위반이면
  // 사람이 읽는 에러 메시지. 단계 자체의 내재적 정합성 + 앞(선행) 단계 대비 검증만 차단한다
  // (이후 일정과의 관계는 차단 X — 확인 후 저장 + 주의). 검역·증명서·내원 step 은 서버 액션과
  // 같은 @petmove/domain 함수를 클라이언트에서도 선행해, 어차피 차단될 저장에는 확인 팝업이
  // 뜨지 않게 한다(검증 → 통과 시에만 확인 → 저장).
  function getSaveBlockError(): string | null {
    if (isMicrochip) {
      if (chip !== '' && chip.length !== 15) return '15자리 숫자를 입력해주세요.'
      const birth = readBirthDate(caseRow?.data)
      if (date && birth && date < birth) {
        return '마이크로칩 삽입일이 출생일보다 빠릅니다. 날짜를 확인해주세요.'
      }
      return null
    }
    if (isRabies) {
      // 만료된 과거 이력은 사실 데이터로 입력 허용 — 갱신 여부는 추가 접종/검사 step 의 chain
      // 검증과 procedure-check 주의(jp.rabies-extra-within-previous-validity 등)가 표면화한다.
      if (isRabies1 && rabies.date) {
        // 1차 생후 91일 — procedure-check(jp.rabies-prime-after-91days-old)와 같은 domain 함수.
        const ageErr = validateRabiesPrimeAge(readBirthDate(caseRow?.data), rabies.date)
        if (ageErr) return ageErr
      }
      if (isRabies2) {
        const r1 = readRabiesEntryForm(caseRow?.data, 0)
        if (r1.date && rabies.date) {
          // 1·2차 순서·간격(30일) — procedure-check 와 같은 domain 함수(단일 출처).
          const intervalErr = validateRabiesInterval(r1.date, rabies.date)
          if (intervalErr) return intervalErr
          // 2차가 1차 면역 유효기간 이내 — 부스터 chain 검증(findRabiesChainBreak, 3차+ 와 단일 출처).
          const chainBreak = findRabiesChainBreak([
            { date: r1.date, valid_until: r1.valid_until || null },
            { date: rabies.date, valid_until: rabies.valid_until || null },
          ])
          if (chainBreak) return '2차 광견병 백신은 1차 광견병 백신 면역 유효기간 안에 해야 합니다.'
          // 마이크로칩 ≤ 2차 — procedure-check(jp.microchip-rabies-sequence)와 같은 domain 함수.
          const chipErr = validateMicrochipBeforeBooster(readImplantDate(caseRow?.data), rabies.date)
          if (chipErr) return chipErr
          // "1차<칩 → 2차=항체 같은 날" 위반은 2차 입력 시 막지 않는다 — 항체(이후 일정)가
          // 입력된 상태에서 2차를 수정하는 것이라 '주의'(jp.microchip-rabies-sequence)로
          // 표면화한다. 같은 날 입력 불가는 채혈 입력 시점(validateTiterDate)이 담당.
        }
      }
      return null
    }
    if (isRabiesExtra) {
      const r1Saved = readRabiesEntryForm(caseRow?.data, 0)
      const r2Saved = readRabiesEntryForm(caseRow?.data, 1)
      const chainBreak = findRabiesChainBreak([
        { date: r1Saved.date, valid_until: r1Saved.valid_until || null },
        { date: r2Saved.date, valid_until: r2Saved.valid_until || null },
        ...rabiesExtra.map((e) => ({ date: e.date, valid_until: e.valid_until || null })),
      ])
      if (chainBreak) {
        return `${chainBreak.brokenAt}차 접종일은 ${chainBreak.brokenAt - 1}차 백신 면역 유효기간 이내여야 합니다.`
      }
      return null
    }
    if (isTiter) {
      // 만료된 과거 검사는 사실 데이터로 입력 허용 — 갱신 여부는 추가 검사/접종 step 의 검증과
      // procedure-check 주의(만료 후 추가 접종/검사 안내)가 표면화한다.
      return validateTiterDate(caseRow?.data, titerForm.date, true)
    }
    if (isTiterExtra) {
      for (const entry of titerExtra) {
        if (!entry.date) continue
        const err = validateTiterDate(caseRow?.data, entry.date, false)
        if (err) return `채혈일 ${entry.date}: ${err}`
      }
      return null
    }
    if (isFlight) {
      // 출국 ≤ 귀국 (항공편 내재적 정합성). 이후 일정과의 관계는 차단 X.
      if (
        flightForm.entry_date &&
        flightForm.return_date &&
        flightForm.return_date < flightForm.entry_date
      ) {
        return '귀국 항공편 날짜는 출국 항공편 날짜 이후여야 합니다.'
      }
      // 일본 입국일 — 광견병 항체 검사 + 180일 이내면 server 가 거부할 입력. server roundtrip
      // 전 즉시 차단해 빨간 박스로 분명히 보이게 (server 결과는 form 변경 시 useEffect 가
      // 해제해 토스트가 짧게 사라질 수 있음).
      const jpEntryErr = validateJpEntryDate(flightForm.entry_date.trim(), {
        data: (caseRow?.data ?? {}) as Record<string, unknown>,
        destination: caseRow?.destination ?? null,
        departureDate: caseRow?.departure_date ?? null,
      })
      if (jpEntryErr) return jpEntryErr
      return null
    }
    if (isAdvanceNotification) {
      const entry = typeof caseRow?.data?.entry_date === 'string' ? (caseRow.data.entry_date as string) : ''
      return validateAdvanceNotification(advanceDate, entry)
    }
    // 검역·증명서·내원 — 서버 액션과 동일한 @petmove/domain 검증을 클라이언트에서도 선행.
    const data = (caseRow?.data ?? {}) as Record<string, unknown>
    if (isVetVisit) {
      return validateVetVisitDate(vetVisitDate.trim(), {
        data,
        destination: caseRow?.destination ?? null,
        departureDate: caseRow?.departure_date ?? null,
      })
    }
    if (isCertificateIssue) {
      return validateKrExportDate(krExportQuarantineDate.trim(), {
        data,
        destination: caseRow?.destination ?? null,
        departureDate: null,
      })
    }
    if (isJpExportQuarantine) {
      const reserved = (jpExport.date ?? '').trim()
      const resErr = validateJpExportReservationDate(reserved, { data, destination: null, departureDate: null })
      if (resErr) return resErr
      // 신청일 마감 — 예약일(없으면 귀국일) −10일. 서버 updateJpExportQuarantineFields 와 동일.
      const app = (jpExport.applicationDate ?? '').trim()
      if (app) {
        const returnDate = typeof data.return_date === 'string' ? data.return_date : ''
        const anchor = reserved || (returnDate.length >= 10 ? returnDate.slice(0, 10) : '')
        if (anchor && app > addDays(anchor, -10)) {
          return '일본 수출 동물검역은 최소 10일 전에 신청, 예약해야 합니다.'
        }
      }
      return null
    }
    if (isJpImportQuarantine) {
      return validateJpImportDate(jpImportQuarantineDate.trim(), { data, destination: null, departureDate: null })
    }
    if (isJpExportQuarantineVisit) {
      return validateJpExportVisitDate(jpExportQuarantineVisitDate.trim(), { data, destination: null, departureDate: null })
    }
    if (isKrImportQuarantine) {
      return validateKrImportDate(krImportQuarantineDate.trim(), { data, destination: null, departureDate: null })
    }
    return null
  }

  function handleSave() {
    if (!canSave) return
    const blockErr = getSaveBlockError()
    if (blockErr) {
      setStatus('error')
      setError(blockErr)
      return
    }
    if (isMicrochip) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateMicrochipFields(caseId, chip || null, date || null)
        if (res.ok) {
          updateCase(res.value)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isRabies) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateRabiesEntryFields(caseId, rabiesIndex, {
          date: rabies.date || null,
          valid_until: rabies.valid_until || null,
          product: rabies.product || null,
          manufacturer: rabies.manufacturer || null,
          lot: rabies.lot || null,
          expiry: rabies.expiry || null,
        })
        if (res.ok) {
          updateCase(res.value)
          // 서버가 trim·정규화한 값으로 폼을 맞춰 dirty 해제.
          setRabies(readRabiesEntryForm(res.value.data, rabiesIndex))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isRabiesExtra) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateRabiesExtraEntries(
          caseId,
          rabiesExtra.map((e) => ({
            date: e.date || null,
            valid_until: e.valid_until || null,
            product: e.product || null,
            manufacturer: e.manufacturer || null,
            lot: e.lot || null,
            expiry: e.expiry || null,
          })),
        )
        if (res.ok) {
          updateCase(res.value)
          const next = readRabiesExtraEntries(res.value.data)
          setRabiesExtra(next.length === 0 ? [makeEmptyExtra()] : next)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isTiter) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateTiterFields(caseId, {
          date: titerForm.date || null,
          lab: titerForm.lab || null,
          value: titerForm.value || null,
        })
        if (res.ok) {
          updateCase(res.value)
          setTiterForm(readTiterForm(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isTiterExtra) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateTiterExtraEntries(
          caseId,
          titerExtra.map((e) => ({
            date: e.date || null,
            lab: e.lab || null,
            value: e.value || null,
          })),
        )
        if (res.ok) {
          updateCase(res.value)
          const next = readTiterExtraEntries(res.value.data)
          setTiterExtra(next.length === 0 ? [makeEmptyTiterExtra()] : next)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isFlight) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateFlightFields(
          caseId,
          {
            entry_date: flightForm.entry_date || null,
            entry_departure_airport: flightForm.entry_departure_airport || null,
            entry_airport: flightForm.entry_airport || null,
            entry_flight_number: flightForm.entry_flight_number || null,
            entry_transport: flightForm.entry_transport || null,
            return_date: flightForm.return_date || null,
            return_departure_airport: flightForm.return_departure_airport || null,
            return_arrival_airport: flightForm.return_arrival_airport || null,
            return_flight_number: flightForm.return_flight_number || null,
            return_transport: flightForm.return_transport || null,
          },
          caseRow?.destination ?? null,
        )
        if (res.ok) {
          updateCase(res.value)
          // by_dest 저장 시 res.value.data 는 top-level 이 아니라 by_dest 에 있으므로, 활성
          // 목적지 뷰로 평탄화해서 폼을 동기화 (단일 목적지면 뷰가 원본과 동일).
          setFlightForm(readFlightForm(activeDestinationView(res.value, activeDest).data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isAdvanceNotification) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateAdvanceNotificationDate(caseId, advanceDate || null)
        if (res.ok) {
          updateCase(res.value)
          setAdvanceDate(readAdvanceDate(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isVetVisit) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        // 새 모델 — 저장은 데이터 저장만 (완료 처리 X). 완료는 '완료' 버튼/서류 자동.
        const res = await updateVetVisitDate(
          caseId,
          vetVisitDate || null,
          false,
          caseRow?.destination ?? null,
        )
        if (res.ok) {
          updateCase(res.value)
          setVetVisitDate(readVetVisitDate(activeDestinationView(res.value, activeDest).data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isJpExportQuarantine) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateJpExportQuarantineFields(caseId, {
          applicationDate: jpExport.applicationDate || null,
          date: jpExport.date || null,
          time: jpExport.time || null,
        })
        if (res.ok) {
          updateCase(res.value)
          setJpExport(readJpExportForm(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isCertificateIssue) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateKrExportQuarantineDate(caseId, krExportQuarantineDate || null, formArrived, activeDest)
        if (res.ok) {
          updateCase(res.value)
          setKrExportQuarantineDate(readKrExportQuarantineDate(activeDestinationView(res.value, activeDest).data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isJpImportQuarantine) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateJpImportQuarantineDate(caseId, jpImportQuarantineDate || null, formArrived, activeDest)
        if (res.ok) {
          updateCase(res.value)
          setJpImportQuarantineDate(readJpImportQuarantineDate(activeDestinationView(res.value, activeDest).data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isJpExportQuarantineVisit) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateJpExportQuarantineVisitDate(
          caseId,
          jpExportQuarantineVisitDate || null,
          formArrived,
          activeDest,
        )
        if (res.ok) {
          updateCase(res.value)
          setJpExportQuarantineVisitDate(
            readJpExportQuarantineVisitDate(activeDestinationView(res.value, activeDest).data),
          )
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isKrImportQuarantine) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateKrImportQuarantineDate(caseId, krImportQuarantineDate || null, formArrived, activeDest)
        if (res.ok) {
          updateCase(res.value)
          setKrImportQuarantineDate(readKrImportQuarantineDate(activeDestinationView(res.value, activeDest).data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    }
  }

  const C = {
    bg: 'var(--pm-bg)',
    surface: 'var(--pm-surface)',
    ink: 'var(--pm-ink)',
    ink2: 'var(--pm-ink-2)',
    ink3: 'var(--pm-ink-3)',
    line: 'var(--pm-line)',
    accent: 'var(--pm-accent)',
    sage: 'var(--pm-sage)',
    warn: 'var(--pm-warn)',
    warnBg: 'color-mix(in srgb, var(--pm-warn) 8%, transparent)',
    info: 'var(--pm-info)',
    infoBg: 'color-mix(in srgb, var(--pm-info) 8%, transparent)',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  }
  const num: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  // ok=false 체크를 톤별로 분리 — '주의'(blocker/warning) vs '안내'(info).
  const failed = checkResults.filter((c) => !c.result.ok && c.check.severity !== 'info')
  const notices = checkResults.filter((c) => !c.result.ok && c.check.severity === 'info')
  // step config 의 situational 메시지 — timeline desc 와 동일 내용을 detail 에도 노출.
  // 같은 룰을 mirror 한 procedure-check 가 동일 메시지로 이미 떴으면(예: 추가 백신
  // chain-break: catalog situational ↔ jp.rabies-extra-within-previous-validity)
  // 안내·주의 두 배너에 같은 문장이 나가니 dedup 한다.
  const rawSituationalDesc =
    caseRow && step.situational ? step.situational(caseRow)?.desc : undefined
  const situationalDup =
    !!rawSituationalDesc &&
    [...failed, ...notices].some(({ result }) => result.message === rawSituationalDesc)
  const situationalDesc = situationalDup ? undefined : rawSituationalDesc
  const stepDocuments = readCaseDocuments(caseRow?.data).filter((d) => d.stepId === step.id)

  // 항공권 step + 왕복 + 출국만 입력된 상태 — 편도 전환 affordance 노출.
  const isFlightRoundEntryOnly = (() => {
    if (!isFlight || tripType !== 'round') return false
    const data = (caseRow?.data ?? {}) as Record<string, unknown>
    const hasEntry = typeof data.entry_date === 'string' && data.entry_date.length >= 10
    const hasReturn = typeof data.return_date === 'string' && data.return_date.length >= 10
    return hasEntry && !hasReturn
  })()
  // 사전 신고 step + 신청일 입력됐는데 허가증 첨부 아직 — 두 분기:
  //  - skip X: 첨부 권장 + '다음' 으로 명시적 skip.
  //  - skip O: '첨부 없이 완료 처리됨' 안내 + '되돌리기' 로 awaiting 으로 복귀.
  // stepDocuments 는 이미 step.id === advance-notification 기준 필터링됨.
  const advanceApprovalSkipped =
    (caseRow?.data as Record<string, unknown> | undefined)?.advance_notification_approval_skipped ===
    true
  const isAdvanceDateEntered =
    isAdvanceNotification &&
    savedAdvanceDate.length >= 10 &&
    savedAdvanceDate <= todayStr &&
    stepDocuments.length === 0
  const isAdvanceAwaitingApproval = isAdvanceDateEntered && !advanceApprovalSkipped
  // 사전 신고 허가증 대기 상태에서 입력 변경이 없으면 하단 '저장' 버튼이 '완료' 로 전환되어
  // skip-approval 액션을 실행. 보호자에겐 화면에 액션 버튼이 둘(저장+완료)이 아니라 하나만
  // 보이도록 — 안내 박스 내 별도 '완료' 버튼은 제거됐다.
  const advanceSkipMode = isAdvanceAwaitingApproval && !dirty
  const [skippingApproval, setSkippingApproval] = useState(false)
  const handleSkipAdvanceApproval = () => {
    if (skippingApproval) return
    setSkippingApproval(true)
    startTransition(async () => {
      const res = await markAdvanceNotificationApprovalSkipped(caseId)
      setSkippingApproval(false)
      if (res.ok) {
        updateCase(res.value)
        router.replace(`/cases/${caseId}/journey`)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  // 일본 수출검역 신청 — 사전 신고와 동일 패턴.
  //  - 예약일·시간은 '희망' 데이터로 완료 판정에 영향 X. step 완료는 보호자가 '완료' 버튼을
  //    명시적으로 눌러야 됨 (= reservation_skipped 플래그 set).
  //  - skip X & !done: '신청 진행 중' 안내 + 하단 저장 버튼이 jpExportSkipMode 로 '완료' 전환.
  const jpExportReservationSkipped =
    (caseRow?.data as Record<string, unknown> | undefined)?.jp_export_quarantine_reservation_skipped ===
    true
  const isJpExportApplied =
    isJpExportQuarantine &&
    savedJpExport.applicationDate.length >= 10 &&
    savedJpExport.applicationDate <= todayStr
  // 'awaiting' = 신청 도래 + 아직 완료 처리 안 함. done(legacy confirmed/admin) 이면 제외.
  const isJpExportAwaitingReservation = isJpExportApplied && !jpExportReservationSkipped && !done
  // 하단 '저장' 버튼이 '완료' 로 전환되는 모드 — 변경 없을 때만(저장과 충돌 방지).
  const jpExportSkipMode = isJpExportAwaitingReservation && !dirty
  const [skippingJpExport, setSkippingJpExport] = useState(false)
  const handleSkipJpExportReservation = () => {
    if (skippingJpExport) return
    setSkippingJpExport(true)
    startTransition(async () => {
      const res = await markJpExportQuarantineReservationSkipped(caseId)
      setSkippingJpExport(false)
      if (res.ok) {
        updateCase(res.value)
        router.replace(`/cases/${caseId}/journey`)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  // 광견병 항체 검사 — 사전 신고·수출검역과 동일 2단계.
  //  - 채혈일 입력(오늘 이하) + 미완료 = '검사 진행 중'. 하단 저장 버튼이 titerCompleteMode
  //    로 '완료' 전환 → 결과 확인 플래그 set. (결과값을 직접 입력해 저장해도 done.)
  const isTiterInProgress =
    isTiter && savedTiterForm.date.length >= 10 && savedTiterForm.date <= todayStr && !done
  const titerCompleteMode = isTiterInProgress && !dirty
  const [completingTiter, setCompletingTiter] = useState(false)
  const handleCompleteTiter = () => {
    if (completingTiter) return
    setCompletingTiter(true)
    startTransition(async () => {
      const res = await markTiterResultConfirmed(caseId)
      setCompletingTiter(false)
      if (res.ok) {
        updateCase(res.value)
        router.replace(`/cases/${caseId}/journey`)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  const [convertingTrip, setConvertingTrip] = useState(false)
  const router = useRouter()
  const confirm = useConfirm()
  // 앞(선행) 단계를 수정·삭제하는데 뒤(후행) 단계에 이미 입력된 데이터가 있으면, 저장 전에
  // '이후 일정이 입력돼 있다'는 주의 확인창을 띄운다. 진행을 선택하면 그대로 저장(하드 차단 X).
  // 저장 후엔 정합성 재검증(scenario)으로 어긋난 이후 일정이 '주의'로 표면화된다.
  const handleSaveClick = async () => {
    if (!canSave) return
    // 먼저 '입력 불가' 차단 검증 — 어차피 저장이 막힐 거면 확인 팝업 없이 바로 에러만 보여준다.
    // (확인 → 저장이 막히는 헛걸음 방지. 확인 팝업은 저장이 실제로 가능할 때만 띄운다.)
    const blockErr = getSaveBlockError()
    if (blockErr) {
      setStatus('error')
      setError(blockErr)
      return
    }
    if (dirty && hasDownstreamData) {
      // 1차 광견병 접종일을 비우는(삭제) 경우 — 저장 시 빈 슬롯이 압축되어 2차가 1차로
      // 올라간다(펫무브워크와 통일된 날짜순 모델). 기존 '이후 일정' 경고에 그 결과를 덧붙여
      // 보호자가 인지하게 한다. 1차 날짜 변경(수정)·다른 단계는 기존 범용 문구 그대로.
      const isRabies1Deletion =
        isRabies1 &&
        savedRabies.date.length > 0 &&
        rabies.date.trim() === '' &&
        readRabiesEntryForm(caseRow?.data, 1).date.length > 0
      const ok = await confirm({
        message: '이후 일정이 이미 입력돼 있어요',
        description: isRabies1Deletion
          ? '이 단계를 삭제하면 이미 입력한 이후 일정과 어긋날 수 있습니다. 이후 일정을 확인해주세요.\n\n1차 광견병 기록이 삭제되고, 2차 광견병 기록이 1차로 올라갑니다. 이대로 진행할까요?'
          : '이 단계를 수정·삭제하면 이미 입력한 이후 일정과 어긋날 수 있습니다. 이후 일정을 확인해주세요.',
        okLabel: '확인',
      })
      if (!ok) return
    }
    handleSave()
  }
  const handleConvertToOneWay = async () => {
    if (convertingTrip) return
    const ok = await confirm({
      message: '편도 일정으로 전환하시겠어요?',
      description:
        '일본 수출 동물검역·한국 수입검역 등 귀국편 단계가 일정에서 빠집니다.\n\n정보탭 → 여행 정보 → 유형 메뉴에서 왕복으로 다시 전환할 수 있습니다.',
      okLabel: '편도로 전환',
    })
    if (!ok) return
    setConvertingTrip(true)
    startTransition(async () => {
      const res = await updateCaseTripType(caseId, 'one_way')
      setConvertingTrip(false)
      if (res.ok) {
        updateCase(res.value)
        // 전환 후 일정으로 — 사전 신고가 다음 할 일로 자동 승격된 상태를 보여준다.
        router.replace(`/cases/${caseId}/journey`)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

  return (
    <div
      ref={scrollRef}
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        // 측정한 sticky 저장 바 높이 + 여백 — 마지막 입력 필드가 바에 가리지 않게.
        paddingBottom: isInteractive ? barHeight + 24 : 32,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        {/* Back link — 서류 상세와 동일한 chevron + 작은 라벨 스타일. */}
        <Link
          href={`/cases/${caseId}/journey`}
          style={{
            ...monoCap,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: C.ink2,
            textDecoration: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          일정
        </Link>

        {/* Header — 일정 row 와 동일한 동그라미(완료 ✓ 또는 번호) + 항목명. */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: done ? C.sage : 'transparent',
              border: done ? 'none' : `1px solid ${C.line}`,
              color: done ? C.surface : C.ink3,
              ...num,
              fontSize: 13,
            }}
            aria-hidden
          >
            {done ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              stepNumber
            )}
          </div>
          <h1 style={{ ...serif, fontSize: 24, lineHeight: 1.2, margin: 0, color: C.ink, minWidth: 0 }}>
            {step.title}
          </h1>
        </div>

        {/* Description */}
        <section
          style={{
            marginTop: 22,
            padding: '18px 18px',
            borderRadius: 18,
            background: C.surface,
            border: `.5px solid ${C.line}`,
            fontSize: 15,
            lineHeight: 1.65,
            color: C.ink2,
          }}
        >
          {/* description 의 모든 비어있지 않은 줄을 bullet 항목으로 표시.
              \n\n 으로 구분된 단락의 경계는 marginTop 으로 단락 간 간격을 살짝 줌. */}
          {(() => {
            const lines = step.description.split('\n')
            let paraBreakBefore = false
            return (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {lines.flatMap((line, i) => {
                  if (line.trim() === '') {
                    paraBreakBefore = true
                    return []
                  }
                  const item = (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        marginTop: i === 0 ? 0 : paraBreakBefore ? 14 : 8,
                      }}
                    >
                      <span style={{ flexShrink: 0, color: C.ink3 }} aria-hidden>
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  )
                  paraBreakBefore = false
                  return [item]
                })}
              </ul>
            )
          })()}
          {step.id === 'intake' && (
            <Link
              href="/me"
              style={{
                marginTop: 14,
                marginRight: 8,
                padding: '9px 14px',
                borderRadius: 999,
                border: `.5px solid ${C.line}`,
                background: 'rgb(var(--pm-surface-rgb) / 0.55)',
                color: C.ink,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '-0.005em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
            >
              내 정보 보기
              <span style={{ color: C.ink3 }}>→</span>
            </Link>
          )}
          {step.links?.map((l) => {
            // 상대 경로(/…) = 앱 내부 페이지 → Next Link + '→', http = 외부 → 새 탭 + '↗'.
            const internal = l.url.startsWith('/')
            // 내부 링크는 inline-flex 로 한 줄에 나란히, 외부 링크는 block 으로 자기 줄.
            const pillStyle: React.CSSProperties = {
              marginTop: 14,
              marginRight: internal ? 8 : 0,
              padding: '9px 14px',
              borderRadius: 999,
              border: `.5px solid ${C.line}`,
              background: 'rgb(var(--pm-surface-rgb) / 0.55)',
              color: C.ink,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.005em',
              display: internal ? 'inline-flex' : 'flex',
              width: internal ? undefined : 'fit-content',
              alignItems: 'center',
              gap: 6,
              textDecoration: 'none',
            }
            return internal ? (
              <Link key={l.url} href={l.url} style={pillStyle}>
                {l.label}
                <span style={{ color: C.ink3 }}>→</span>
              </Link>
            ) : (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={pillStyle}>
                {l.label}
                <span style={{ color: C.ink3 }}>↗</span>
              </a>
            )
          })}
        </section>

        {/* Situational 안내 — step config 가 caseRow 상태에 따라 동적으로 만든 메시지.
            timeline 의 desc 와 동일 내용이라 detail 페이지에서도 같은 정보 전달.
            항공권 step + 왕복 + 출국만 입력 상태에선 '편도 일정으로 전환' 토글을 노출.
            사전 신고 허가증 대기(advanceSkipMode) / 일본 수출검역 신청 진행(jpExportSkipMode)
            상태의 '완료' 액션은 하단 sticky 저장 버튼이 라벨 전환으로 맡는다 — 안내 박스엔
            별도 액션 버튼 X. 완료(skip) 상태에선 situational 자체가 undefined 라 안내 박스
            미노출. */}
        {situationalDesc && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.infoBg,
              border: `.5px solid color-mix(in srgb, ${C.info} 35%, transparent)`,
            }}
          >
            <div style={{ ...monoCap, color: C.info, fontWeight: 700, marginBottom: 8 }}>
              안내
            </div>
            <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              {situationalDesc}
              {isFlightRoundEntryOnly && ' 귀국 일정이 미정인 경우는 편도 일정으로 전환할 수 있습니다.'}
            </div>
            {isFlightRoundEntryOnly && (
              <button
                type="button"
                onClick={handleConvertToOneWay}
                disabled={convertingTrip}
                className="pm-pressable"
                style={{
                  marginTop: 24,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `.5px solid color-mix(in srgb, ${C.info} 47%, transparent)`,
                  background: 'var(--pm-surface)',
                  color: C.info,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: convertingTrip ? 'progress' : 'pointer',
                  opacity: convertingTrip ? 0.6 : 1,
                }}
              >
                {convertingTrip ? '전환 중…' : '편도 일정으로 전환'}
              </button>
            )}
          </section>
        )}

        {/* Warnings */}
        {failed.length > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.warnBg,
              border: `.5px solid color-mix(in srgb, ${C.warn} 20%, transparent)`,
            }}
          >
            <div style={{ ...monoCap, color: C.warn, fontWeight: 700, marginBottom: 8 }}>
              주의 {failed.length}건
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failed.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{check.title}</div>
                  {result.message && (
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                  )}
                  {result.fixHint && (
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: result.message ? 4 : 2, lineHeight: 1.5 }}>↳ {result.fixHint}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 안내 — 오류는 아니지만 미리 알려둘 사항. 주의보다 차분한 중립 톤. */}
        {notices.length > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.infoBg,
              border: `.5px solid color-mix(in srgb, ${C.info} 35%, transparent)`,
            }}
          >
            <div style={{ ...monoCap, color: C.info, fontWeight: 700, marginBottom: 8 }}>
              안내 {notices.length}건
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notices.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{check.title}</div>
                  {result.message && (
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                  )}
                  {result.fixHint && (
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: result.message ? 4 : 2, lineHeight: 1.5 }}>↳ {result.fixHint}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Inputs — 마이크로칩·광견병1·2차 step 은 인터랙티브, 그 외는 read-only 스키마 미리보기. */}
        {isMicrochip && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <MicrochipInputs chip={chip} date={date} onChipChange={setChip} onDateChange={setDate} />
          </section>
        )}
        {isRabies && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <RabiesEntryInputs
              value={rabies}
              onChange={(key, next) => setRabies((prev) => ({ ...prev, [key]: next }))}
              productHints={rabiesProductHints}
              otherHospital={rabiesOtherHospital}
            />
          </section>
        )}
        {isRabiesExtra && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <RabiesExtraInputs
              entries={rabiesExtra}
              onChange={(idx, key, next) =>
                setRabiesExtra((prev) =>
                  prev.map((e, i) => (i === idx ? { ...e, [key]: next } : e)),
                )
              }
              onRemove={(idx) =>
                setRabiesExtra((prev) => {
                  const next = prev.filter((_, i) => i !== idx)
                  // 한 장도 없으면 빈 카드를 다시 띄움 — 사용자가 곧 입력할 자리.
                  return next.length === 0 ? [makeEmptyExtra()] : next
                })
              }
              onAdd={() => setRabiesExtra((prev) => [...prev, makeEmptyExtra()])}
              productHintsFor={(idx) => rabiesExtraProductHints[idx] ?? null}
            />
          </section>
        )}
        {isTiterExtra && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <TiterExtraInputs
              entries={titerExtra}
              onChange={(idx, key, next) =>
                setTiterExtra((prev) =>
                  prev.map((e, i) => (i === idx ? { ...e, [key]: next } : e)),
                )
              }
              onRemove={(idx) =>
                setTiterExtra((prev) => {
                  const next = prev.filter((_, i) => i !== idx)
                  return next.length === 0 ? [makeEmptyTiterExtra()] : next
                })
              }
              onAdd={() => setTiterExtra((prev) => [...prev, makeEmptyTiterExtra()])}
            />
          </section>
        )}
        {isTiter && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <TiterInputs
              form={titerForm}
              onChange={(key, next) => setTiterForm((prev) => ({ ...prev, [key]: next }))}
            />
          </section>
        )}
        {isFlight && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <FlightInputs
              value={flightForm}
              onChange={(key, next) => setFlightForm((prev) => ({ ...prev, [key]: next }))}
              showReturn={tripType === 'round'}
            />
          </section>
        )}
        {isAdvanceNotification && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <AdvanceNotificationInputs date={advanceDate} onChange={setAdvanceDate} />
          </section>
        )}
        {isVetVisit && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <VetVisitInputs date={vetVisitDate} onChange={setVetVisitDate} />
          </section>
        )}
        {isJpExportQuarantine && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <JpExportQuarantineInputs
              form={jpExport}
              onChange={(key, next) => setJpExport((prev) => ({ ...prev, [key]: next }))}
            />
          </section>
        )}
        {isCertificateIssue && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <KrExportQuarantineInputs
              date={krExportQuarantineDate}
              onChange={setKrExportQuarantineDate}
            />
          </section>
        )}
        {isJpImportQuarantine && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <JpImportQuarantineInputs
              date={jpImportQuarantineDate}
              onChange={setJpImportQuarantineDate}
            />
          </section>
        )}
        {isJpExportQuarantineVisit && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <JpExportQuarantineVisitInputs
              date={jpExportQuarantineVisitDate}
              onChange={setJpExportQuarantineVisitDate}
            />
          </section>
        )}
        {isKrImportQuarantine && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <KrImportQuarantineInputs
              date={krImportQuarantineDate}
              onChange={setKrImportQuarantineDate}
            />
          </section>
        )}
        {!isInteractive && step.inputs && step.inputs.length > 0 && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력 정보</h3>
            <div
              style={{
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 16,
                padding: '4px 14px',
              }}
            >
              {step.inputs.map((field, i) => {
                const last = i === (step.inputs?.length ?? 0) - 1
                const value = caseRow ? resolveInputValue(field.key, caseRow) : null
                return (
                  <div
                    key={field.key}
                    style={{
                      padding: '12px 0',
                      borderBottom: last ? 'none' : `.5px solid ${C.line}`,
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
                      {field.label}
                    </div>
                    {value ? (
                      <div style={{ fontSize: 14, color: C.ink, marginTop: 2 }}>{value}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                        {fieldTypeLabel(field.type)}
                        {field.helpText && ` · ${field.helpText}`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
              입력 기능을 준비 중이에요. 지금은 읽기 전용입니다.
            </p>
          </section>
        )}

        {/* 서류 체크리스트 — 출국 전 임상검사·검역증명서 발급 step. 입력 섹션 다음에 배치 —
            보호자가 검진일 먼저 입력하고 나서 서류 진행 상황을 보는 흐름. 서류 탭과 같은
            시그널을 사용해 자동 동기. */}
        {(step.id === 'vet-visit' || step.id === 'certificate-issue') && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>서류 체크리스트</h3>
            <StepDocChecklist caseId={caseId} currentStepId={step.id} activeDest={activeDest} />
          </section>
        )}

        {/* Attachments */}
        {step.allowAttachments && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>첨부</h3>
            <StepAttachments
              caseId={caseId}
              stepId={step.id}
              documents={stepDocuments}
              hint={step.attachmentHint}
            />
          </section>
        )}

        {/* 예정일이 지났는데 아직 '저장'으로 확인 안 한 상태 — 저장하면 완료, 또는 날짜 재등록 안내. */}
        {savedArrivedUnconfirmed && (
          <section
            style={{
              marginTop: 18,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.infoBg,
              border: `.5px solid color-mix(in srgb, ${C.info} 35%, transparent)`,
            }}
          >
            <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
              예정일이 지났습니다. 저장 버튼을 눌러서 완료로 전환하시거나, 새로운 예정일을 등록하실 수 있습니다.
            </div>
          </section>
        )}

      </div>

      {/* 하단 sticky 저장 바 — 인터랙티브 step 한정. 한국 모바일 앱 패턴 (토스/카카오/당근).
          dirty 일 때 accent 활성, 아니면 muted disabled. BottomNav(z40) 아래 layer
          이지만 컨텐츠는 BottomNav 위쪽에만 배치돼 시각 겹침 없음. */}
      {isInteractive && (
        <div
          ref={barRef}
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: 12,
            paddingLeft: 20,
            paddingRight: 20,
            // bottom-nav 영역(content 41px + max(safe-area, 12px)) 만큼 비워둠 + 12px gap
            paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 53px)',
            background:
              'linear-gradient(180deg, rgb(var(--pm-bg-rgb) / 0) 0%, rgb(var(--pm-bg-rgb) / .92) 30%, rgb(var(--pm-bg-rgb) / .92) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 39,
            pointerEvents: 'none',
          }}
        >
          {status === 'error' && (
            <div
              role="alert"
              style={{
                pointerEvents: 'auto',
                marginBottom: 8,
                padding: '9px 12px',
                borderRadius: 10,
                // 불투명 배경 — 뒤 콘텐츠(첨부 영역)가 비쳐 겹쳐 보이지 않도록.
                background: C.surface,
                border: `.5px solid color-mix(in srgb, ${C.warn} 33%, transparent)`,
                color: C.warn,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {error ?? '저장 실패'}
            </div>
          )}
          {/* 저장 중·저장됨은 별도 줄 대신 버튼 라벨로 — 첨부 영역과 겹치지 않음.
              미래 날짜(예정)면 라벨을 '예정일로 저장'으로 바꿔 누르기 전에 의도를 알린다.
              사전 신고 허가증 대기(advanceSkipMode) / 일본 수출검역 신청 진행
              (jpExportSkipMode) / 광견병 항체 검사 진행(titerCompleteMode)이면 같은 버튼이
              '완료'로 전환 — 저장할 변경이 없는 상태에서 명시적 완료 액션을 직접 노출. */}
          {(() => {
            const completeMode = advanceSkipMode || jpExportSkipMode || titerCompleteMode
            const processing = skippingApproval || skippingJpExport || completingTiter
            const active = (canSave || completeMode) && status !== 'saving' && !processing
            return (
          <button
            type="button"
            onClick={
              advanceSkipMode
                ? handleSkipAdvanceApproval
                : jpExportSkipMode
                  ? handleSkipJpExportReservation
                  : titerCompleteMode
                    ? handleCompleteTiter
                    : handleSaveClick
            }
            disabled={!active}
            aria-live="polite"
            style={{
              pointerEvents: 'auto',
              width: '100%',
              padding: '14px 0',
              borderRadius: 14,
              border: 0,
              background: justSaved ? C.sage : active ? C.accent : 'var(--pm-line)',
              color: justSaved || active ? '#fff' : C.ink3,
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              cursor: active ? 'pointer' : 'not-allowed',
              transition: 'background .15s, color .15s',
            }}
          >
            {status === 'saving'
              ? '저장 중…'
              : processing
                ? '처리 중…'
                : justSaved
                  ? '✓ 저장됨'
                  : completeMode
                    ? '완료'
                    : formUpcoming ||
                        jpExportApplicationUpcoming ||
                        advanceUpcoming ||
                        rabiesExtraUpcoming ||
                        vetVisitUpcoming ||
                        titerUpcoming
                      ? '예정일로 저장'
                      : '저장'}
          </button>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function fieldTypeLabel(t: string): string {
  switch (t) {
    case 'date':
      return '날짜'
    case 'date_array':
      return '날짜 (여러 건)'
    case 'text':
      return '텍스트'
    case 'number':
      return '숫자'
    case 'select':
      return '선택'
    case 'textarea':
      return '긴 텍스트'
    default:
      return t
  }
}

/**
 * step input 의 현재 저장된 값을 caseRow 에서 끌어와 화면에 표시할 문자열로 반환.
 *
 * catalog 의 input.key 는 portal 의 미래 입력 폼 스키마라 storage 키와 직접 매칭되지
 * 않는 경우가 있음 (예: rabies_1_date → data.rabies_dates[0].date). 여기서 brigde.
 * 매칭이 없거나 값이 비어있으면 null — 호출부가 placeholder 표시.
 */
function resolveInputValue(
  fieldKey: string,
  caseRow: { microchip: string | null; data?: Record<string, unknown> | null },
): string | null {
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // 마이크로칩 — top-level 컬럼 + data
  if (fieldKey === 'microchip') return caseRow.microchip || null
  if (fieldKey === 'microchip_implant_date') {
    const v = data['microchip_implant_date']
    return typeof v === 'string' && v ? v : null
  }

  // rabies_1_*, rabies_2_* → data.rabies_dates[0|1].(date|valid_until)
  const rabiesMatch = fieldKey.match(/^rabies_(\d+)_(date|valid_until)$/)
  if (rabiesMatch) {
    const idx = Number(rabiesMatch[1]) - 1
    const sub = rabiesMatch[2] as 'date' | 'valid_until'
    const arr = data['rabies_dates']
    if (!Array.isArray(arr)) return null
    const entry = arr[idx]
    if (!entry || typeof entry !== 'object') return null
    const v = (entry as Record<string, unknown>)[sub]
    return typeof v === 'string' && v ? v : null
  }

  // 날짜 배열류 (rabies_titer_records, general_vaccine_dates, civ_dates,
  // infectious_disease_records, external_parasite_dates, ...) — 첫 항목 date 만.
  if (
    fieldKey === 'rabies_titer_records' ||
    fieldKey === 'general_vaccine_dates' ||
    fieldKey === 'civ_dates' ||
    fieldKey === 'infectious_disease_records' ||
    fieldKey === 'external_parasite_dates' ||
    fieldKey === 'internal_parasite_dates'
  ) {
    const arr = data[fieldKey]
    if (!Array.isArray(arr) || arr.length === 0) return null
    // 배열 길이 표시 — n건 형태가 type 'date_array' 와 어울림.
    const dates = arr
      .map((e) => (typeof e === 'string' ? e : (e as { date?: string } | null)?.date))
      .filter((d): d is string => typeof d === 'string' && d.length >= 10)
    if (dates.length === 0) return null
    if (dates.length === 1) return dates[0]
    return `${dates[0]} 외 ${dates.length - 1}건`
  }

  // 그 외 — caseRow.data[fieldKey] 단순 조회
  const v = data[fieldKey]
  if (typeof v === 'string' && v) return v
  if (typeof v === 'number') return String(v)
  return null
}

function readImplantDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['microchip_implant_date']
  return typeof v === 'string' ? v : ''
}

function readBirthDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['birth_date']
  return typeof v === 'string' ? v : ''
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 광견병 폼 값을 caseRow.data.rabies_dates[index] 에서 읽어온다 (1차=0, 2차=1).
 * 항목·키가 없으면 빈 문자열 — 입력 컴포넌트는 controlled 라 빈 값이 필요.
 */
function readRabiesEntryForm(
  data: Record<string, unknown> | null | undefined,
  index: number,
): RabiesEntryForm {
  const empty: RabiesEntryForm = {
    date: '', valid_until: '', product: '', manufacturer: '', lot: '', expiry: '',
  }
  if (!data) return empty
  const arr = data['rabies_dates']
  if (!Array.isArray(arr) || index >= arr.length) return empty
  const entry = arr[index]
  if (!entry || typeof entry !== 'object') return empty
  const r = entry as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    date: str(r.date),
    valid_until: str(r.valid_until),
    product: str(r.product),
    manufacturer: str(r.manufacturer),
    lot: str(r.lot),
    expiry: str(r.expiry),
  }
}

/**
 * rabies_dates[index].other_hospital — 타병원 접종 여부.
 * 체크는 펫무브워크에서만 토글 — 포털은 읽기만 하고 "지정 약품" 힌트 억제에 쓴다.
 *
 * entry 가 아직 존재하지 않는 경우 (보호자가 처음 입력 중) 는 타병원(true) 기본 —
 * 펫무브 보호자는 어느 병원 약품인지 모르는 상태고, 카탈로그 hint(Rabisin 등)가
 * 자기가 입력한 양 노출되는 사고를 막는다. admin 이 본병원이면 펫무브워크에서
 * 명시적으로 체크 해제하는 흐름. 저장 시점에 updateRabiesEntryFields 가
 * other_hospital=true 를 명시 저장한다.
 */
function readRabiesOtherHospital(
  data: Record<string, unknown> | null | undefined,
  index: number,
): boolean {
  if (!data) return true
  const arr = data['rabies_dates']
  if (!Array.isArray(arr) || index >= arr.length) return true
  const entry = arr[index]
  if (!entry || typeof entry !== 'object') return true
  return (entry as Record<string, unknown>).other_hospital === true
}

function rabiesFormEqual(a: RabiesEntryForm, b: RabiesEntryForm): boolean {
  return (
    a.date === b.date &&
    a.valid_until === b.valid_until &&
    a.product === b.product &&
    a.manufacturer === b.manufacturer &&
    a.lot === b.lot &&
    a.expiry === b.expiry
  )
}

/**
 * 추가 백신 카드 한 장의 빈 폼. 빈 상태에서도 사용자가 바로 입력 가능하게
 * 기본 1장이 떠야 하므로 초기/삭제 후 폴백에서 사용.
 */
function makeEmptyExtra(): RabiesExtraEntry {
  return {
    date: '',
    valid_until: '',
    product: '',
    manufacturer: '',
    lot: '',
    expiry: '',
    other_hospital: true,
  }
}

/**
 * case.data.rabies_dates 의 index 2 이상(3차+)을 RabiesExtraEntry[] 로 읽는다.
 * other_hospital 미정의는 portal 정책상 true 로 본다 (1·2차 readRabiesOtherHospital 와 동일).
 */
function readRabiesExtraEntries(
  data: Record<string, unknown> | null | undefined,
): RabiesExtraEntry[] {
  if (!data) return []
  const arr = data['rabies_dates']
  if (!Array.isArray(arr)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: RabiesExtraEntry[] = []
  for (let i = 2; i < arr.length; i++) {
    const rec = arr[i]
    if (typeof rec === 'string') {
      out.push({
        date: rec,
        valid_until: '',
        product: '',
        manufacturer: '',
        lot: '',
        expiry: '',
        other_hospital: true,
      })
    } else if (rec && typeof rec === 'object') {
      const r = rec as Record<string, unknown>
      out.push({
        date: str(r.date),
        valid_until: str(r.valid_until),
        product: str(r.product),
        manufacturer: str(r.manufacturer),
        lot: str(r.lot),
        expiry: str(r.expiry),
        other_hospital: r.other_hospital !== false,
      })
    }
  }
  return out
}

function rabiesExtraEqual(a: RabiesExtraEntry[], b: RabiesExtraEntry[]): boolean {
  // 길이 비교 — 사용자가 빈 카드를 추가했더라도 "내용 동등성" 으로 판정해야 dirty 가 새지 않음.
  // 빈 카드(6키 모두 ''')는 저장 시 서버가 제외하므로, 비교 시에도 비-빈 항목만 본다.
  const nonEmpty = (e: RabiesExtraEntry) =>
    !!(e.date || e.valid_until || e.product || e.manufacturer || e.lot || e.expiry)
  const aF = a.filter(nonEmpty)
  const bF = b.filter(nonEmpty)
  if (aF.length !== bF.length) return false
  for (let i = 0; i < aF.length; i++) {
    const x = aF[i]
    const y = bF[i]
    if (
      x.date !== y.date ||
      x.valid_until !== y.valid_until ||
      x.product !== y.product ||
      x.manufacturer !== y.manufacturer ||
      x.lot !== y.lot ||
      x.expiry !== y.expiry ||
      x.other_hospital !== y.other_hospital
    ) {
      return false
    }
  }
  return true
}

/**
 * 추가 항체 검사 카드 한 장의 빈 폼. 빈 상태에서도 사용자가 바로 입력 가능하게
 * 기본 1장이 떠야 하므로 초기/삭제 후 폴백에서 사용.
 */
function makeEmptyTiterExtra(): TiterExtraEntry {
  return { date: '', lab: '', value: '' }
}

/**
 * case.data.rabies_titer_records 의 index 1 이상(2회차+)을 TiterExtraEntry[] 로 읽는다.
 * 비관리 키(received_date 등) 는 무시 — 서버 액션이 머지로 보존.
 */
function readTiterExtraEntries(
  data: Record<string, unknown> | null | undefined,
): TiterExtraEntry[] {
  if (!data) return []
  const arr = data['rabies_titer_records']
  if (!Array.isArray(arr)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: TiterExtraEntry[] = []
  for (let i = 1; i < arr.length; i++) {
    const rec = arr[i]
    if (rec && typeof rec === 'object') {
      const r = rec as Record<string, unknown>
      out.push({ date: str(r.date), lab: str(r.lab), value: str(r.value) })
    }
  }
  return out
}

function titerExtraEqual(a: TiterExtraEntry[], b: TiterExtraEntry[]): boolean {
  // 빈 카드(3키 모두 '')는 저장 시 제외되므로 비교에서도 제외.
  const nonEmpty = (e: TiterExtraEntry) => !!(e.date || e.lab || e.value)
  const aF = a.filter(nonEmpty)
  const bF = b.filter(nonEmpty)
  if (aF.length !== bF.length) return false
  for (let i = 0; i < aF.length; i++) {
    if (
      aF[i].date !== bF[i].date ||
      aF[i].lab !== bF[i].lab ||
      aF[i].value !== bF[i].value
    ) {
      return false
    }
  }
  return true
}

/**
 * 항체 검사 채혈일 cross-entry 검증. 통과면 null, 실패면 에러 메시지.
 * - rule 1: 채혈일 ≥ 2차 접종일
 * - rule 2: 채혈일 < 광견병 부스터 chain 최종 만료일 (2차부터 끊김 없이 이어진 부스터)
 * - rule 3: isFirstTiter && 1차 < 마이크로칩 → 채혈일 = 2차 접종일
 *
 * 2차 접종 미입력 시 모든 룰 skip (전제 조건 부족).
 */
function validateTiterDate(
  data: Record<string, unknown> | null | undefined,
  date: string,
  isFirstTiter: boolean,
): string | null {
  if (!date) return null
  const r2 = readRabiesEntryForm(data, 1)
  if (!r2.date) return null
  const r1 = readRabiesEntryForm(data, 0)
  // 규칙 A — 채혈 ≥ 1·2차 접종일. procedure-check(common.rabies-titer-chain-consistent)와 같은
  // domain 함수(단일 출처).
  const afterErr = validateTiterAfterBooster([r1.date, r2.date], date)
  if (afterErr) return afterErr
  // 규칙 B — 부스터 chain 유효기간 이내. procedure-check 와 같은 domain 함수(단일 출처).
  const rabiesArr = Array.isArray(data?.['rabies_dates']) ? (data!['rabies_dates'] as unknown[]) : []
  const boosters = rabiesArr.slice(1).map((r) => {
    const rec = (r && typeof r === 'object' ? r : {}) as { date?: string; valid_until?: string | null }
    return { date: typeof rec.date === 'string' ? rec.date : '', valid_until: rec.valid_until ?? null }
  })
  const chainErr = validateTiterWithinChain(boosters, date)
  if (chainErr) return chainErr
  if (isFirstTiter) {
    const microchip = readImplantDate(data)
    if (r1.date && microchip && r1.date < microchip && date !== r2.date) {
      return '마이크로칩보다 1차 접종을 먼저 한 경우, 채혈일은 2차 접종일과 같아야 합니다.'
    }
  }
  return null
}

/** 채혈일·검사기관·검사결과 — caseRow.data.rabies_titer_records[0] 의 date / lab / value. */
function readTiterForm(data: Record<string, unknown> | null | undefined): TiterForm {
  const empty: TiterForm = { date: '', lab: '', value: '' }
  if (!data) return empty
  const arr = data['rabies_titer_records']
  if (!Array.isArray(arr) || arr.length === 0) return empty
  const entry = arr[0]
  if (!entry || typeof entry !== 'object') return empty
  const r = entry as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return { date: str(r.date), lab: str(r.lab), value: str(r.value) }
}

/** 항공권 폼 값을 caseRow.data 의 entry_* / return_* 평탄 키에서 읽어온다 (정보 탭과 동일 키). */
function readFlightForm(data: Record<string, unknown> | null | undefined): FlightForm {
  const str = (key: string) => {
    const v = data?.[key]
    return typeof v === 'string' ? v : ''
  }
  return {
    entry_date: str('entry_date'),
    entry_departure_airport: str('entry_departure_airport'),
    entry_airport: str('entry_airport'),
    entry_flight_number: str('entry_flight_number'),
    entry_transport: str('entry_transport'),
    return_date: str('return_date'),
    return_departure_airport: str('return_departure_airport'),
    return_arrival_airport: str('return_arrival_airport'),
    return_flight_number: str('return_flight_number'),
    return_transport: str('return_transport'),
  }
}

function flightFormEqual(a: FlightForm, b: FlightForm): boolean {
  return (
    a.entry_date === b.entry_date &&
    a.entry_departure_airport === b.entry_departure_airport &&
    a.entry_airport === b.entry_airport &&
    a.entry_flight_number === b.entry_flight_number &&
    a.entry_transport === b.entry_transport &&
    a.return_date === b.return_date &&
    a.return_departure_airport === b.return_departure_airport &&
    a.return_arrival_airport === b.return_arrival_airport &&
    a.return_flight_number === b.return_flight_number &&
    a.return_transport === b.return_transport
  )
}

/** 사전 신고 신청일 — caseRow.data.advance_notification_date. */
function readAdvanceDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['advance_notification_date']
  return typeof v === 'string' ? v : ''
}

/** 내원·임상검진 검진일 — caseRow.data.vet_visit_date. */
function readVetVisitDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['vet_visit_date']
  return typeof v === 'string' ? v : ''
}

/** 한국 수출 동물검역 검역일 — caseRow.data.kr_export_quarantine_date. */
function readKrExportQuarantineDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['kr_export_quarantine_date']
  return typeof v === 'string' ? v : ''
}

/** 일본 수입 동물검역 검역일 — caseRow.data.jp_import_quarantine_date. */
function readJpImportQuarantineDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['jp_import_quarantine_date']
  return typeof v === 'string' ? v : ''
}

/** 일본 수출 동물검역 검역일 — caseRow.data.jp_export_quarantine_visit_date. */
function readJpExportQuarantineVisitDate(
  data: Record<string, unknown> | null | undefined,
): string {
  if (!data) return ''
  const v = data['jp_export_quarantine_visit_date']
  return typeof v === 'string' ? v : ''
}

/** 한국 수입 동물검역 검역일 — caseRow.data.kr_import_quarantine_date. */
function readKrImportQuarantineDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['kr_import_quarantine_date']
  return typeof v === 'string' ? v : ''
}

/**
 * 일본 수출검역 예약 — caseRow.data.jp_export_quarantine_application_date(신청일) /
 * jp_export_quarantine_date(예약일) / jp_export_quarantine_time(예약시간).
 */
function readJpExportForm(data: Record<string, unknown> | null | undefined): JpExportForm {
  const str = (key: string) => {
    const v = data?.[key]
    return typeof v === 'string' ? v : ''
  }
  return {
    applicationDate: str('jp_export_quarantine_application_date'),
    date: str('jp_export_quarantine_date'),
    time: str('jp_export_quarantine_time'),
  }
}

function jpExportFormEqual(a: JpExportForm, b: JpExportForm): boolean {
  return a.applicationDate === b.applicationDate && a.date === b.date && a.time === b.time
}
