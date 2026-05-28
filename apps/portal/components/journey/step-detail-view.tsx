'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  createVaccineLookups,
  type CheckResult,
  type ProcedureCheck,
  type StepDefinition,
  type VaccineProductsData,
} from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import {
  getCaseVaccineData,
  markAdvanceNotificationApprovalSkipped,
  markJpExportQuarantineReservationSkipped,
  unmarkAdvanceNotificationApprovalSkipped,
  unmarkJpExportQuarantineReservationSkipped,
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
 *  4) 입력 필드 — microchip·광견병1·2차·항체검사 step 은 인터랙티브, 그 외는 read-only 스키마
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
  const caseRow = useCase(caseId)
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

  // 광견병 추가 항체검사(2회차+) — 빈 상태에서도 카드 1장이 보이도록 최소 1장 유지.
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
  const [jpImportQuarantineDate, setJpImportQuarantineDate] = useState(savedJpImportQuarantineDate)

  const savedJpExportQuarantineVisitDate = readJpExportQuarantineVisitDate(caseRow?.data)
  const [jpExportQuarantineVisitDate, setJpExportQuarantineVisitDate] = useState(
    savedJpExportQuarantineVisitDate,
  )

  const savedKrImportQuarantineDate = readKrImportQuarantineDate(caseRow?.data)
  const [krImportQuarantineDate, setKrImportQuarantineDate] = useState(savedKrImportQuarantineDate)

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
    isJpImportQuarantine && jpImportQuarantineDate !== savedJpImportQuarantineDate
  const jpExportQuarantineVisitDirty =
    isJpExportQuarantineVisit && jpExportQuarantineVisitDate !== savedJpExportQuarantineVisitDate
  const krImportQuarantineDirty =
    isKrImportQuarantine && krImportQuarantineDate !== savedKrImportQuarantineDate
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
    if (!jpImportQuarantineDirty) setJpImportQuarantineDate(readJpImportQuarantineDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!jpExportQuarantineVisitDirty)
      setJpExportQuarantineVisitDate(readJpExportQuarantineVisitDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!krImportQuarantineDirty) setKrImportQuarantineDate(readKrImportQuarantineDate(caseRow?.data))
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

  function handleSave() {
    if (!dirty) return
    if (isMicrochip) {
      if (chip !== '' && chip.length !== 15) {
        setStatus('error')
        setError('마이크로칩 번호는 15자리여야 합니다.')
        return
      }
      // 시술일 ≥ 출생일 (common.microchip-after-birth — 입력 차단으로 이관).
      const birth = readBirthDate(caseRow?.data)
      if (date && birth && date < birth) {
        setStatus('error')
        setError('시술일이 출생일보다 빠릅니다. 시술일 또는 출생일을 확인하세요.')
        return
      }
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
      // 2차 한정: 입력 시점에 면역 유효 아님 → 차단 (출국 시점에 유효해야 검역 인정).
      // 1차는 면제 — 이미 추가 접종을 마친 보호자가 옛 1차 기록을 그대로 등록하는
      // 케이스에서 만료가 정상이고, 후속 검증(2차 1차유효기간 내·항체검사 chain)에서 잡힌다.
      if (isRabies2 && isRabiesEntryExpired(rabies)) {
        setStatus('error')
        setError('입력하신 접종은 면역 유효기간이 만료되었습니다.')
        return
      }
      // 1차: 생후 91일 이후만 가능 (jp.rabies-prime-after-91days-old — 입력 차단으로 이관).
      if (isRabies1 && rabies.date) {
        const birth = readBirthDate(caseRow?.data)
        if (birth && daysBetween(birth, rabies.date) < 91) {
          const eligible = addDays(birth, 91)
          setStatus('error')
          setError(`1차 광견병 접종은 생후 91일 이후(${eligible} 이후) 가능합니다.`)
          return
        }
      }
      // 2차 한정 cross-entry: 1차 접종 이후 + 1차 면역 유효기간 이내 + (1차<마이크로칩이면 2차=항체검사일)
      // + 마이크로칩 ≤ 2차 (jp.microchip-rabies-sequence 2차 시점 검증 — 입력 차단으로 이관).
      if (isRabies2) {
        const r1 = readRabiesEntryForm(caseRow?.data, 0)
        if (r1.date && rabies.date) {
          if (daysBetween(r1.date, rabies.date) < 30) {
            setStatus('error')
            setError('1·2차 접종 간격은 30일 이상이어야 합니다.')
            return
          }
          const r1Years = parseValidUntilYears(r1.valid_until)
          if (r1Years !== null && rabies.date >= addYears(r1.date, r1Years)) {
            setStatus('error')
            setError('2차 접종일이 1차 접종의 면역 유효기간을 벗어났습니다.')
            return
          }
          // 마이크로칩 ≤ 2차 (jp.microchip-rabies-sequence): 마이크로칩이 2차보다 늦으면
          // ①·② 두 조건 모두 위반이라 차단.
          const microchip = readImplantDate(caseRow?.data)
          if (microchip && microchip > rabies.date) {
            setStatus('error')
            setError('마이크로칩 시술일 이후에 광견병 백신을 접종해야 합니다.')
            return
          }
          // 1차가 마이크로칩보다 빠른 경우: 2차 = 항체검사일. 항체검사 미입력 시 검증 불가 →
          // 통과 (이후 항체검사 입력 시 procedure-check 가 잡음).
          if (microchip && r1.date < microchip) {
            const titerDates = readAllTiterDates(caseRow?.data)
            if (titerDates.length > 0 && !titerDates.includes(rabies.date)) {
              setStatus('error')
              setError(
                '마이크로칩보다 1차 접종을 먼저 한 경우, 2차 접종일은 광견병 항체검사일과 같아야 합니다.',
              )
              return
            }
          }
        }
      }
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
      // 첫 항체검사 — 만료 + 채혈 cross-entry (1차<마이크로칩 시 = 2차 룰 포함).
      if (isTiterEntryExpired(titerForm)) {
        setStatus('error')
        setError('입력하신 항체검사는 유효기간이 만료되었습니다.')
        return
      }
      const titerError = validateTiterDate(caseRow?.data, titerForm.date, true)
      if (titerError) {
        setStatus('error')
        setError(titerError)
        return
      }
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
      // 추가 항체검사 — 만료 + 채혈 cross-entry. rule 3 (=2차) 는 set-level 룰이라
      // 추가 검사 개별 입력엔 적용 X (procedure-check 가 set 평가).
      for (const entry of titerExtra) {
        if (!entry.date) continue
        if (isTiterEntryExpired(entry)) {
          setStatus('error')
          setError(`채혈일 ${entry.date}: 입력하신 항체검사는 유효기간이 만료되었습니다.`)
          return
        }
        const err = validateTiterDate(caseRow?.data, entry.date, false)
        if (err) {
          setStatus('error')
          setError(`채혈일 ${entry.date}: ${err}`)
          return
        }
      }
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
      // 입국일 cross-entry — 광견병 항체검사 + 부스터 chain + 사전 신고 40일 마감(일본 한정).
      const flightError = validateFlightEntryDate(caseRow?.data, flightForm.entry_date, destinationKey)
      if (flightError) {
        setStatus('error')
        setError(flightError)
        return
      }
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateFlightFields(caseId, {
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
        })
        if (res.ok) {
          updateCase(res.value)
          setFlightForm(readFlightForm(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isAdvanceNotification) {
      // 입국 40일 전까지 접수돼야 함 — 룰 위반 시 차단 (procedure-check '주의' 로 빠지는 것 방지).
      const advanceError = validateAdvanceNotificationDate(caseRow?.data, advanceDate)
      if (advanceError) {
        setStatus('error')
        setError(advanceError)
        return
      }
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
        const res = await updateVetVisitDate(caseId, vetVisitDate || null)
        if (res.ok) {
          updateCase(res.value)
          setVetVisitDate(readVetVisitDate(res.value.data))
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
        const res = await updateKrExportQuarantineDate(caseId, krExportQuarantineDate || null)
        if (res.ok) {
          updateCase(res.value)
          setKrExportQuarantineDate(readKrExportQuarantineDate(res.value.data))
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
        const res = await updateJpImportQuarantineDate(caseId, jpImportQuarantineDate || null)
        if (res.ok) {
          updateCase(res.value)
          setJpImportQuarantineDate(readJpImportQuarantineDate(res.value.data))
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
        )
        if (res.ok) {
          updateCase(res.value)
          setJpExportQuarantineVisitDate(readJpExportQuarantineVisitDate(res.value.data))
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
        const res = await updateKrImportQuarantineDate(caseId, krImportQuarantineDate || null)
        if (res.ok) {
          updateCase(res.value)
          setKrImportQuarantineDate(readKrImportQuarantineDate(res.value.data))
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
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    sage: '#8FA68C',
    warn: '#C26A4A',
    warnBg: 'rgba(194,106,74,0.08)',
    info: '#C9A663',
    infoBg: 'rgba(201,166,99,0.08)',
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
    isAdvanceNotification && !!savedAdvanceDate && stepDocuments.length === 0
  const isAdvanceAwaitingApproval = isAdvanceDateEntered && !advanceApprovalSkipped
  const isAdvanceApprovalSkipped = isAdvanceDateEntered && advanceApprovalSkipped
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
  const [unskippingApproval, setUnskippingApproval] = useState(false)
  const handleUnskipAdvanceApproval = () => {
    if (unskippingApproval) return
    setUnskippingApproval(true)
    startTransition(async () => {
      const res = await unmarkAdvanceNotificationApprovalSkipped(caseId)
      setUnskippingApproval(false)
      if (res.ok) {
        updateCase(res.value)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  // 일본 수출검역 신청 — 사전 신고와 동일 패턴. 신청일 입력됐는데 예약 날짜·시간 둘 다
  // 미입력 상태에서 두 분기:
  //  - skip X: 예약 확정 대기. '다음' 으로 명시적 skip.
  //  - skip O: '입력 없이 완료 처리됨'. '되돌리기' 로 awaiting 으로 복귀.
  const jpExportReservationSkipped =
    (caseRow?.data as Record<string, unknown> | undefined)?.jp_export_quarantine_reservation_skipped ===
    true
  const isJpExportApplied =
    isJpExportQuarantine && !!savedJpExport.applicationDate && savedJpExport.applicationDate.length >= 10
  const isJpExportReservationPending =
    isJpExportApplied && !(savedJpExport.date.length >= 10 && /^\d{1,2}:\d{2}$/.test(savedJpExport.time))
  const isJpExportAwaitingReservation = isJpExportReservationPending && !jpExportReservationSkipped
  const isJpExportReservationSkipped = isJpExportReservationPending && jpExportReservationSkipped
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
  const [unskippingJpExport, setUnskippingJpExport] = useState(false)
  const handleUnskipJpExportReservation = () => {
    if (unskippingJpExport) return
    setUnskippingJpExport(true)
    startTransition(async () => {
      const res = await unmarkJpExportQuarantineReservationSkipped(caseId)
      setUnskippingJpExport(false)
      if (res.ok) {
        updateCase(res.value)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  const [convertingTrip, setConvertingTrip] = useState(false)
  const router = useRouter()
  const confirm = useConfirm()
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
              href={`/cases/${caseId}/info`}
              style={{
                marginTop: 14,
                marginRight: 8,
                padding: '9px 14px',
                borderRadius: 999,
                border: `.5px solid ${C.line}`,
                background: 'rgba(255,253,247,.55)',
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
              검토하러 가기
              <span style={{ color: C.ink3 }}>→</span>
            </Link>
          )}
          {(step.id === 'vet-visit' || step.id === 'certificate-issue') && (
            <Link
              href={`/cases/${caseId}/docs`}
              style={{
                marginTop: 14,
                marginRight: 8,
                padding: '9px 14px',
                borderRadius: 999,
                border: `.5px solid ${C.line}`,
                background: 'rgba(255,253,247,.55)',
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
              서류 체크리스트
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
              background: 'rgba(255,253,247,.55)',
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
            항공권 step + 왕복 + 출국만 입력 상태에선 '편도 일정으로 전환' 토글을,
            사전 신고 step + 신청일 입력됐는데 허가증 첨부·skip 둘 다 아직 상태에선
            '다음' 으로 첨부 없이 완료 처리하는 토글을 같이 노출. */}
        {situationalDesc && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.infoBg,
              border: `.5px solid ${C.info}59`,
            }}
          >
            <div style={{ ...monoCap, color: C.info, fontWeight: 700, marginBottom: 8 }}>
              안내
            </div>
            <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
              {situationalDesc}
              {isFlightRoundEntryOnly && ' 귀국 일정이 미정인 경우는 편도 일정으로 전환할 수 있습니다.'}
            </div>
            {isAdvanceAwaitingApproval && (
              <div style={{ marginTop: 16, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                허가증 저장 없이 완료 처리 하시려면 다음 버튼을 클릭해주세요.
              </div>
            )}
            {isAdvanceApprovalSkipped && (
              <div style={{ marginTop: 16, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                허가증 첨부 대기 상태로 되돌리시려면 되돌리기 버튼을 클릭해주세요.
              </div>
            )}
            {isJpExportAwaitingReservation && (
              <div style={{ marginTop: 16, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                입력 없이 완료 처리하시려면 다음 버튼을 클릭해주세요.
              </div>
            )}
            {isJpExportReservationSkipped && (
              <div style={{ marginTop: 16, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                예약 확정 대기 상태로 되돌리시려면 되돌리기 버튼을 클릭해주세요.
              </div>
            )}
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
                  border: `.5px solid ${C.info}77`,
                  background: '#FBF7F1',
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
            {isAdvanceAwaitingApproval && (
              <button
                type="button"
                onClick={handleSkipAdvanceApproval}
                disabled={skippingApproval}
                className="pm-pressable"
                style={{
                  marginTop: 24,
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `.5px solid ${C.info}77`,
                  background: '#FBF7F1',
                  color: C.info,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: skippingApproval ? 'progress' : 'pointer',
                  opacity: skippingApproval ? 0.6 : 1,
                }}
              >
                {skippingApproval ? '처리 중…' : '다음'}
              </button>
            )}
            {isAdvanceApprovalSkipped && (
              <button
                type="button"
                onClick={handleUnskipAdvanceApproval}
                disabled={unskippingApproval}
                className="pm-pressable"
                style={{
                  marginTop: 24,
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `.5px solid ${C.info}77`,
                  background: '#FBF7F1',
                  color: C.info,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: unskippingApproval ? 'progress' : 'pointer',
                  opacity: unskippingApproval ? 0.6 : 1,
                }}
              >
                {unskippingApproval ? '처리 중…' : '되돌리기'}
              </button>
            )}
            {isJpExportAwaitingReservation && (
              <button
                type="button"
                onClick={handleSkipJpExportReservation}
                disabled={skippingJpExport}
                className="pm-pressable"
                style={{
                  marginTop: 24,
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `.5px solid ${C.info}77`,
                  background: '#FBF7F1',
                  color: C.info,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: skippingJpExport ? 'progress' : 'pointer',
                  opacity: skippingJpExport ? 0.6 : 1,
                }}
              >
                {skippingJpExport ? '처리 중…' : '다음'}
              </button>
            )}
            {isJpExportReservationSkipped && (
              <button
                type="button"
                onClick={handleUnskipJpExportReservation}
                disabled={unskippingJpExport}
                className="pm-pressable"
                style={{
                  marginTop: 24,
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `.5px solid ${C.info}77`,
                  background: '#FBF7F1',
                  color: C.info,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  cursor: unskippingJpExport ? 'progress' : 'pointer',
                  opacity: unskippingJpExport ? 0.6 : 1,
                }}
              >
                {unskippingJpExport ? '처리 중…' : '되돌리기'}
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
              border: `.5px solid ${C.warn}33`,
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
              border: `.5px solid ${C.info}59`,
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
              입력 기능은 곧 추가됩니다. 현재는 펫무브워크에서 담당 수의사가 입력합니다.
            </p>
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
              'linear-gradient(180deg, rgba(245,239,232,0) 0%, rgba(245,239,232,.92) 30%, rgba(245,239,232,.92) 100%)',
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
                border: `.5px solid ${C.warn}55`,
                color: C.warn,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {error ?? '저장 실패'}
            </div>
          )}
          {/* 저장 중·저장됨은 별도 줄 대신 버튼 라벨로 — 첨부 영역과 겹치지 않음. */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || status === 'saving'}
            aria-live="polite"
            style={{
              pointerEvents: 'auto',
              width: '100%',
              padding: '14px 0',
              borderRadius: 14,
              border: 0,
              background: justSaved
                ? C.sage
                : dirty && status !== 'saving'
                  ? C.accent
                  : 'rgba(42,38,32,.10)',
              color: justSaved || (dirty && status !== 'saving') ? '#fff' : C.ink3,
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              cursor: dirty && status !== 'saving' ? 'pointer' : 'not-allowed',
              transition: 'background .15s, color .15s',
            }}
          >
            {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
          </button>
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

/**
 * "N년" 문자열에서 연수 추출. 빈 값은 UI에서 "1년" 디폴트로 시각 선택돼 있으므로 1로 가정.
 * 파싱 실패 시 null.
 */
function parseValidUntilYears(value: string): number | null {
  const raw = value.trim() || '1년'
  const m = raw.match(/^(\d+)\s*년$/)
  if (!m) return null
  return Number(m[1])
}

/**
 * 광견병 폼의 "오늘 기준 면역 만료" 판정.
 * date 만 있어도 판정 — valid_until 빈 값은 UI 디폴트 1년으로 간주. 접종일 + N년 이
 * 오늘 이전·당일이면 만료 (1주년 -1일 까지 인정 = addYears(date, N) > today).
 */
function isRabiesEntryExpired(form: RabiesEntryForm): boolean {
  if (!form.date) return false
  const years = parseValidUntilYears(form.valid_until)
  if (years === null) return false
  return todayIso() >= addYears(form.date, years)
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
 * 추가 항체검사 카드 한 장의 빈 폼. 빈 상태에서도 사용자가 바로 입력 가능하게
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
 * 항공편 입국일 cross-entry 검증. 통과면 null, 실패면 에러 메시지.
 * - rule 1 (차단): 입국일 ≥ 채혈일 + 180일 (어떤 titer 라도 만족하면 통과). 너무
 *   이른 입국은 추가 단계로 해결 안 됨 — 실제 날짜 조정 필요.
 * - rule 2 (차단, 일본 한정): 입국일 ≥ 오늘 + 40일. 사전 신고 마감이 입국 40일 전인데
 *   더 가까운 입국일을 박으면 마감이 이미 지나 신청 자체가 불가능 — 입국일 조정 필요.
 *
 * 백신·검사 유효기간 만료 (입국일 > titer +2년, 입국일 > rabies chain) 는 차단 X —
 * 추가 접종·추가 검사로 해결 가능한 계획 사항이라 procedure-check 의 '주의' 로 노출
 * (jp.entry-within-2years-of-titer / jp.rabies-valid-until-on-departure 가 안내).
 *
 * titer 미입력 시 rule 1 만 skip — rule 2 는 destination 만으로 평가 가능.
 */
function validateFlightEntryDate(
  data: Record<string, unknown> | null | undefined,
  entryDate: string,
  destinationKey: string | null,
): string | null {
  if (!entryDate) return null
  // rule 2 — 일본 사전 신고 40일 마감.
  if (destinationKey === 'japan') {
    const today = todayIso()
    if (daysBetween(today, entryDate) < 40) {
      return '사전 신고를 위해 일본 입국 때까지 최소 40일 여유 기간이 필요합니다.'
    }
  }
  // rule 1 — titer 후 180일.
  const titerDates = readAllTiterDates(data)
  if (titerDates.length === 0) return null
  if (!titerDates.some((t) => daysBetween(t, entryDate) >= 180)) {
    return '입국일은 광견병 항체검사일로부터 180일 후여야 합니다.'
  }
  return null
}

/**
 * 사전 신고(NACCS) 신청일 cross-entry 검증. 통과면 null, 실패면 에러 메시지.
 * - 룰: 신청일 ≤ 입국일 − 40일 (procedure-check jp.advance-notification-40days-before-entry 와 동일).
 *
 * 입국일(entry_date) 미입력 시 skip — 항공편 결정 후 평가되도록 둠.
 */
function validateAdvanceNotificationDate(
  data: Record<string, unknown> | null | undefined,
  notifDate: string,
): string | null {
  if (!notifDate) return null
  const entry = typeof data?.entry_date === 'string' ? data.entry_date : ''
  if (!entry) return null
  if (daysBetween(notifDate, entry) < 40) {
    return '일본 입국 40일 전까지 신고를 해야 합니다. 신고가 늦은 경우 입국일을 변경해야 합니다.'
  }
  return null
}

/** 두 YYYY-MM-DD 날짜 사이의 일수 차이 (to - from). 형식이 깨지면 NaN. */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * 항체검사 "오늘 기준 유효기간 만료" 판정. 항체검사 유효기간은 채혈 + 2년
 * (마지막 유효일 = addYears(date,2) -1일). today >= addYears(date,2) 이면 만료.
 */
function isTiterEntryExpired(form: { date: string }): boolean {
  if (!form.date) return false
  return todayIso() >= addYears(form.date, 2)
}

/**
 * 항체검사 채혈일 cross-entry 검증. 통과면 null, 실패면 에러 메시지.
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
  if (date < r2.date) {
    return '채혈일은 2차 접종일 이후여야 합니다.'
  }
  const chainEnd = computeRabiesChainEnd(data)
  if (chainEnd && date >= chainEnd) {
    return '채혈일이 광견병 백신 면역 유효기간을 벗어났습니다.'
  }
  if (isFirstTiter) {
    const r1 = readRabiesEntryForm(data, 0)
    const microchip = readImplantDate(data)
    if (r1.date && microchip && r1.date < microchip && date !== r2.date) {
      return '마이크로칩보다 1차 접종을 먼저 한 경우, 채혈일은 2차 접종일과 같아야 합니다.'
    }
  }
  return null
}

/**
 * 광견병 부스터 chain 의 최종 만료일(anniversary, 마지막 유효일+1) 계산.
 * 2차부터 시작, 매 부스터(3차+)가 직전 chain 만료일 이전이면 chain 연장. 끊기면 멈춤.
 * 2차가 없거나 valid_until 파싱 실패 시 null — 룰 2 skip.
 */
function computeRabiesChainEnd(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null
  const arr = data['rabies_dates']
  if (!Array.isArray(arr)) return null
  const entries: Array<{ date: string; years: number }> = []
  for (let i = 1; i < arr.length; i++) {
    const rec = arr[i]
    if (!rec || typeof rec !== 'object') continue
    const r = rec as Record<string, unknown>
    const date = typeof r.date === 'string' ? r.date : ''
    if (!date) continue
    const years = parseValidUntilYears(typeof r.valid_until === 'string' ? r.valid_until : '')
    if (years === null) continue
    entries.push({ date, years })
  }
  if (entries.length === 0) return null
  entries.sort((a, b) => a.date.localeCompare(b.date))
  let chainEnd = addYears(entries[0].date, entries[0].years)
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].date < chainEnd) {
      chainEnd = addYears(entries[i].date, entries[i].years)
    } else {
      break
    }
  }
  return chainEnd
}

/**
 * 모든 항체검사 record 의 date 만 모아 반환 (index 0 + extras). 광견병 2차 cross-entry
 * 검증("2차 = 항체검사일")에서 사용 — 어느 한 검사 date 와 일치하면 통과.
 */
function readAllTiterDates(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return []
  const arr = data['rabies_titer_records']
  if (!Array.isArray(arr)) return []
  return arr
    .map((r) => (r && typeof r === 'object' ? (r as { date?: string }).date : undefined))
    .filter((d): d is string => typeof d === 'string' && d.length >= 10)
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
