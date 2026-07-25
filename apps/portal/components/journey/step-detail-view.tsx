'use client'


import { C } from '@/lib/palette'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  createVaccineLookups,
  findRabiesChainBreak,
  rabiesChainBreakMessage,
  readEffectiveExtraValue,
  todayKst,
  validateAdvanceNotification,
  validateExportQuarantineDate,
  validateImportQuarantineDate,
  validateJpExportReservationDate,
  validateJpExportVisitDate,
  validateJpImportDate,
  validateKrExportDate,
  validateKrImportDate,
  validateMicrochipBeforeBooster,
  validateRabiesInterval,
  validateRabiesPrimeAge,
  validateCyAdvanceNoticeDate,
  validateImportPermitFiledDate,
  validateSgQuarantineReservationDate,
  validateSgDepartureVsQuarantineReservation,
  validateSgQuarantineReservationFiled,
  validateSgReservationVsDeparture,
  validateEntryDateForDestination,
  validateEchinococcusWindow,
  validatePhInternalParasiteWindow,
  readScopedImportPermitFiled,
  TITER_MIN_DAYS_AFTER_VACCINE,
  validateEuTiterAfterVaccine,
  validateIeAdvanceNoticeDate,
  validateIlAdvanceNoticeDate,
  validateMtAdvanceNoticeDate,
  validateNoAdvanceNoticeDate,
  EU_ENTRY_FAMILY,
  SINGLE_DOSE_RABIES_DESTINATIONS,
  TITER_EXTRA_CARD_DESTINATIONS,
  RABIES_ONE_YEAR_VALIDITY_DESTINATIONS,
  destinationKoLabel,
  TITER_REQUIRED_FOR_ENTRY_DESTINATIONS,
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
import { monoCap, num, serif } from '@/components/me/settings-shared'
import { subTitle } from '@/lib/tokens'
import { CloudIcon, StormCloudIcon } from '@/components/ui/weather-icons'
import { useUnsavedGuard } from '@/components/portal-shell/nav-guard'
import { replaceTab } from '@/components/portal-shell/tab-nav'
import {
  getCaseVaccineData,
  markAdvanceNotificationApprovalSkipped,
  markApplicationIssued,
  markImportPermitIssued,
  markJpExportQuarantineReservationSkipped,
  markExtraTiterResultConfirmed,
  markTiterResultConfirmed,
  updateAdvanceNotificationDate,
  updateApplicationDate,
  updateCaseTripType,
  updateFlightFields,
  updateGeneralVaccineEntries,
  updateImportPermitFields,
  updateJpExportQuarantineFields,
  updateImportQuarantineDate,
  updateJpExportQuarantineVisitDate,
  updateJpImportQuarantineDate,
  updateKrExportQuarantineDate,
  updateKrImportQuarantineDate,
  updateMicrochipFields,
  updateParasiteEntries,
  updateRabiesEntryFields,
  updateRabiesExtraEntries,
  updateSimpleDateField,
  updateTiterExtraEntries,
  updateTiterFields,
  updateVetVisitDate,
} from '@/lib/actions/cases'
import { rabiesSaveWorking } from '@/lib/journey/rabies-scheduled'
import { readCaseDocuments } from '@/lib/documents'
import { openExternalUrl } from '@/lib/native/open-external'
import { AdvanceNotificationInputs } from './advance-notification-inputs'
import { FlightInputs, type FlightForm } from './flight-inputs'
import {
  GeneralVaccineInputs,
  type GeneralVaccineEntry,
  type ProductPlaceholders,
} from './general-vaccine-inputs'
import { ImportPermitInputs, type ImportPermitForm } from './import-permit-inputs'
import { JpExportQuarantineInputs, type JpExportForm } from './jp-export-quarantine-inputs'
import { JpExportQuarantineVisitInputs } from './jp-export-quarantine-visit-inputs'
import { ImportQuarantineInputs } from './import-quarantine-inputs'
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
 * 항공권 '도착 공항'(현지) 예시 placeholder — 기본값이 일본(나리타 NRT) 기준이라 목적지별
 * 현지 공항으로 교체(entry_airport = 도착 공항, return_departure_airport = 귀국편 출발 공항).
 * 출발 공항·귀국 도착 공항은 한국(인천)이라 기본값 유지. 태국은 departureFirst 레이아웃이
 * 자체 상수(방콕 BKK)를 써서 제외. 'eu' 는 여러 나라를 묶은 키라 대표 허브(파리 CDG)로 둠.
 */
const FLIGHT_ARRIVAL_AIRPORT_EXAMPLE: Record<string, string> = {
  japan: '예: 나리타 NRT',
  china: '예: 베이징 PEK',
  taiwan: '예: 타오위안 TPE',
  philippines: '예: 마닐라 MNL',
  // 말레이시아·인도네시아 — 태국 복제(2026-07-22). departureFirst 세부 필드의 기본
  // placeholder(방콕 BKK)가 태국 기준이라 현지 공항으로 교체.
  malaysia: '예: 쿠알라룸푸르 KUL',
  indonesia: '예: 자카르타 CGK',
  vietnam: '예: 호치민 SGN',
  cambodia: '예: 프놈펜 PNH',
  mongolia: '예: 울란바토르 UBN',
  uzbekistan: '예: 타슈켄트 TAS',
  canada: '예: 밴쿠버 YVR',
  argentina: '예: 부에노스아이레스 EZE',
  morocco: '예: 카사블랑카 CMN',
  mexico: '예: 멕시코시티 MEX',
  brazil: '예: 상파울루 GRU',
  kazakhstan: '예: 알마티 ALA',
  uae: '예: 두바이 DXB',
  // 러시아·튀르키예 — 카자흐스탄 복제(2026-07-22).
  russia: '예: 모스크바 SVO',
  turkey: '예: 이스탄불 IST',
  // 우크라이나는 예시 공항을 넣지 않는다 — 전시로 민항 운항이 정상화되지 않은 상태라
  // 특정 공항을 예시로 들면 잘못된 안내가 된다(2026-07-20 조사 반영).
  eu: '예: 파리 CDG',
  uk: '예: 런던 히드로 LHR',
  ireland: '예: 더블린 DUB',
  malta: '예: 몰타 MLA',
  norway: '예: 오슬로 OSL',
  finland: '예: 헬싱키 HEL',
  switzerland: '예: 취리히 ZRH',
  cyprus: '예: 라르나카 LCA',
  singapore: '예: 창이 SIN',
  israel: '예: 텔아비브 TLV',
}

/**
 * 신고·허가·통지 절차가 없어 항공편 상세(도착일·공항·편명)가 어느 절차에도 쓰이지 않는
 * 목적지 — 항공권 카드는 출국일·귀국일(+미정) + 첨부만(2026-07-25 사용자 결정).
 * 기존 저장값은 보존되고 표시만 축소된다. 새 목적지 추가 시 절차 카드(신고·허가·통지·검사
 * 예약) 유무로 판단해 여기 또는 접기형(절차국)에 넣는다.
 */
const SIMPLE_FLIGHT_DESTINATIONS: readonly string[] = [
  'argentina', 'brazil', 'cambodia', 'canada', 'china', 'eu', 'finland', 'hawaii',
  'kazakhstan', 'mexico', 'mongolia', 'morocco', 'russia', 'turkey', 'uk', 'ukraine',
  'uzbekistan', 'vietnam',
  // 절차는 있으나 펫무브가 대행하지 않는 목적지(2026-07-25 사용자 결정) — 신청은 보호자/
  // 현지 에이전트 몫이라 앱이 항공편 상세를 들고 있을 이유가 없다. 필요하면 첨부로 보관.
  // 세부(상세 접기)를 받는 곳은 **일본·태국·필리핀·스위스 넷뿐**(대행 절차에 항공편 사용).
  'taiwan', 'malaysia', 'indonesia', 'uae', 'ireland', 'malta', 'israel', 'singapore',
  'norway', 'cyprus',
]

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
  // 1회 접종국(태국·필리핀·EU)에서 광견병 1차 카드는 단일 카드 + 목록(1·2·3차) 입력으로 통합한다
  // (종합백신과 동일 모델). 일본·하와이(2회국)는 기존 1차 단일 + 별도 추가 백신 카드 유지.
  const isRabiesSingleCard =
    isRabies1 && !!destinationKey && SINGLE_DOSE_RABIES_DESTINATIONS.includes(destinationKey)
  // 광견병 백신 면역 유효기간 1년만 인정(2·3년 입력불가) — 중국·태국·필리핀. YearSelect 비활성 +
  // getSaveBlockError 저장 거부. 단일 출처 = domain RABIES_ONE_YEAR_VALIDITY_DESTINATIONS.
  const rabiesOneYearOnly =
    !!destinationKey && RABIES_ONE_YEAR_VALIDITY_DESTINATIONS.includes(destinationKey)
  // '제품 유효기간'(약품 expiry 행)은 호주·뉴질랜드 입국 요건에만 필요하다. 그 외 목적지
  // (일본·태국·필리핀·EU 등)에선 광견병·종합백신 약품 정보에서 이 행을 숨긴다.
  const showProductExpiry = destinationKey === 'australia' || destinationKey === 'new_zealand'
  const hideRabiesExpiry = !showProductExpiry
  // rabies_dates 배열 내 위치 — 1차=0, 2차=1.
  const rabiesIndex = isRabies2 ? 1 : 0
  const isTiter = step.id === 'rabies-titer'
  const isTiterExtra = step.id === 'rabies-titer-extra'
  // 추가 검사를 별도 카드로 두지 않는 목적지(일본·대만 외)는 본 검사 카드가 목록을 통째로
  // 다룬다 — 1회 접종국 광견병 카드(isRabiesSingleCard)와 같은 모델. 예전엔 본 카드가
  // rabies_titer_records[0] 한 칸만 편집해서 재검사를 넣으면 이전 기록이 사라졌다.
  const isTiterSingleCard =
    isTiter && !!destinationKey && !TITER_EXTRA_CARD_DESTINATIONS.includes(destinationKey)
  const isFlight = step.id === 'flight-purchase'
  /**
   * 출발일(departure_date)을 **별도 입력칸으로 노출**하는 목적지인지.
   *
   * 태국·필리핀·EU 패밀리만 출발일·도착일을 따로 받는다. 그 외(일본·대만·중국 등)는 날짜가
   * 하나뿐이고 출발일은 저장 시 entry_date 에서 파생된다.
   *
   * 같은 조건이 레이아웃(departureFirst)·저장 payload·입력불가 가드 세 곳에 필요한데
   * 따로 적혀 있어 가드만 빠졌다 — 화면에 없는 stale 출발일이 '도착일이 출발일보다 빨라요'로
   * 저장을 막았고, 출발일 입력칸이 없어 고칠 방법도 없었다(2026-07-19). 단일 출처로 모은다.
   */
  // 신고·허가·통지 절차가 없어 항공편 상세(도착일·공항·편명)가 어느 절차에도 쓰이지 않는
  // 목적지 — 항공권 카드는 출국일·귀국일 + 첨부만 받는다(2026-07-25 사용자 결정).
  // 기존에 저장된 상세 값은 보존되고 표시만 축소된다. 날짜는 여정 앵커·검증·D-day 용.
  const isSimpleFlightDest =
    !!destinationKey && SIMPLE_FLIGHT_DESTINATIONS.includes(destinationKey)
  const showsSeparateDepartureDate =
    // 대행 절차국(태국·필리핀·스위스 등 EU 패밀리) — 출발일 주필드 + 신청에 필요한 상세 접기.
    destinationKey === 'thailand' ||
    destinationKey === 'philippines' ||
    (!!destinationKey && EU_ENTRY_FAMILY.includes(destinationKey)) ||
    // 단순 항공권 목적지 — 주필드 '출발일'(departure_date 저장 경로 공유), 세부 없음.
    // (말레이·인니·UAE·이스라엘·대만 등 비대행 절차국 포함 — SIMPLE_FLIGHT_DESTINATIONS.)
    isSimpleFlightDest
  const isAdvanceNotification = step.id === 'advance-notification'
  const isVetVisit = step.id === 'vet-visit'
  const isJpExportQuarantine = step.id === 'jp-export-quarantine'
  const isCertificateIssue = step.id === 'certificate-issue'
  // 일본 수입 검역 = 'departure' step 의 일본 override (override 가 검역일 input 을 실음).
  const isJpImportQuarantine =
    step.id === 'departure' &&
    (step.inputs ?? []).some((i) => i.key === 'jp_import_quarantine_date')
  // 나라별 도착 수입검역(일본 외) — departure override 가 '{국가}_import_quarantine_date' input 을
  // 싣는다. 검역일 필드 key·부제 문구를 override 에서 동적으로 읽어 한 벌의 배선으로 모든 나라 처리.
  // 나라별 도착(수입)·출국(수출) 검역 — done 시그널 'quarantine:<검역일필드>' 가 그 나라 필드를
  // 실어 한 벌의 배선으로 모든 나라·도착/출국을 처리. 검역일 필드 key·부제(input.helpText)를 동적으로 읽음.
  // 순수 날짜 완료 카드(dated:<field> — 발급일·예약일 자체가 완료 증거. 싱가포르 GST 허가·
  // 국경검사 예약). quarantine 과 같은 날짜 입력 UI 를 재사용하되 '완료' 확인 게이트는 없다
  // (isConfirmStep 제외 + 저장은 updateSimpleDateField 로 분기). 완료 판정은 done-resolver
  // dated:<field> 가 날짜(≤오늘)만으로 한다.
  const isSimpleDatedStep = typeof step.done === 'string' && step.done.startsWith('dated:')
  const importQuarantineField =
    typeof step.done === 'string' && step.done.startsWith('quarantine:')
      ? step.done.slice('quarantine:'.length)
      : isSimpleDatedStep
        ? (step.done as string).slice('dated:'.length)
        : null
  const isImportQuarantine = importQuarantineField !== null
  const importQuarantineSubtitle =
    (step.inputs ?? []).find((i) => i.key === importQuarantineField)?.helpText ?? ''
  const isJpExportQuarantineVisit = step.id === 'jp-export-quarantine-visit'
  const isKrImportQuarantine = step.id === 'kr-import-quarantine'
  const isGeneralVaccine = step.id === 'general-vaccine'
  const isImportPermit = step.id === 'import-permit'
  // 신청 → 발급 2단계 모델(신청일 입력=진행 중, 확인서 첨부·완료 버튼=완료). 수입 허가가 원형이고
  // 싱가포르 계류장 예약·강아지 라이센스가 같은 모델을 공유한다. 필드 키만 다르다.
  const isSgQuarantineReservation = step.id === 'sg-quarantine-reservation'
  const isSgDogLicence = step.id === 'sg-dog-licence'
  const isApplicationStep = isImportPermit || isSgQuarantineReservation || isSgDogLicence
  const applicationDateField = isImportPermit
    ? 'import_permit_application_date'
    : isSgQuarantineReservation
      ? 'sg_quarantine_reservation_application_date'
      : isSgDogLicence
        ? 'sg_dog_licence_application_date'
        : ''
  // 신청일 아래 설명(카드별) + 부가 예약일(계류장 예약 날짜, 정보성 — 일본 수출검역 예약일 패턴).
  const applicationHelp = isImportPermit
    ? '동물검역소에 수입 허가를 신청한 날짜'
    : isSgQuarantineReservation
      ? '계류장 예약을 신청한 날짜'
      : isSgDogLicence
        ? '강아지 라이센스를 신청한 날짜'
        : ''
  const applicationReservationField = isSgQuarantineReservation ? 'sg_quarantine_reservation_date' : ''
  const applicationReservation = isSgQuarantineReservation
    ? { label: '예약일', help: '계류를 시작하는 날짜' }
    : undefined
  // 구충(내·외부·촌충) — 종합백신과 같은 date_array 입력 모델. 필드 키는 base catalog input 과
  // 동일. 촌충(에키노코쿠스, EU 5국)은 내부구충과 데이터 키(internal_parasite_dates)를 공유.
  const isExternalParasite = step.id === 'external-parasite'
  const isInternalParasite = step.id === 'internal-parasite'
  const isEchinococcus = step.id === 'echinococcus-treatment'
  const isParasite = isExternalParasite || isInternalParasite || isEchinococcus
  const parasiteFieldKey = isExternalParasite
    ? 'external_parasite_dates'
    : 'internal_parasite_dates'
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
    isKrImportQuarantine ||
    isImportQuarantine ||
    isGeneralVaccine ||
    isApplicationStep ||
    isParasite
  // 일정 화면 복귀 경로 — 다중 목적지에서 활성 목적지(?dest=)를 보존해야 저장·완료 후
  // 다른 목적지(기본=첫 토큰)로 튕기지 않는다. 뒤로 링크·완료 후 replace 모두 이걸 사용.
  const journeyHref = activeDest
    ? `/cases/${caseId}/journey?dest=${encodeURIComponent(activeDest)}`
    : `/cases/${caseId}/journey`
  const caseRowRaw = useCase(caseId)
  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁힌다 — 아래 모든 saved* 읽기·동기화
  // useEffect 가 그 목적지(by_dest) 기준이 된다. 단일 목적지면 뷰가 원본과 동일(무변경).
  // useMemo 로 식별자 안정화 — 매 렌더 새 객체면 [caseRow?.data] deps useEffect 가 폼을 계속
  // 되돌려 입력이 막힌다.
  const caseRow = useMemo(
    () => (caseRowRaw ? activeDestinationView(caseRowRaw, activeDest) : caseRowRaw),
    [caseRowRaw, activeDest],
  )
  const { updateCase, profile } = useCases()
  // 자기책임 모드 — 입력불가 차단(전부) 해제. 형식·필드키 검증은 server 가 유지(데이터 파싱
  // 가능성 보존). '주의'/'안내'는 scenario(buildJourney prefs)가 담당.
  const freeInput = profile?.free_input_mode === true

  // 인터랙티브 step 폼 state — 다른 step 에서는 렌더 안 함. hooks 는 매번 호출.
  // 미래(예정) 일정은 서버 저장 시 *_scheduled 별도 자리로 분리된다(예정→도래→재입력 모델).
  // 실제 기록 키에는 ≤오늘만 남으므로 입력칸은 저장값을 그대로 보여주면 된다.
  const savedChip = caseRow?.microchip ?? ''
  const savedDate = readImplantDate(caseRow?.data)
  const [chip, setChip] = useState(savedChip)
  const [date, setDate] = useState(savedDate)

  const savedRabies = readRabiesEntryForm(caseRow?.data, rabiesIndex)
  const [rabies, setRabies] = useState<RabiesEntryForm>(savedRabies)
  // 광견병 step 한정 — org 백신 카탈로그 ("지정 약품" 힌트 계산용).
  const [vaccineData, setVaccineData] = useState<VaccineProductsData | null>(null)

  // 1회 접종국 단일 카드 — rabies_dates 전체(index 0~)를 가변 목록으로 관리. 빈 상태 1장 유지.
  const savedRabiesList = readRabiesExtraEntries(caseRow?.data, 0)
  const [rabiesList, setRabiesList] = useState<RabiesExtraEntry[]>(
    savedRabiesList.length === 0 ? [makeEmptyExtra()] : savedRabiesList,
  )

  // 광견병 추가 백신 — 일본은 3차+(index 2~), 1회 접종국(태국·필리핀·EU)은 2차+(index 1~).
  // 빈 상태에서도 입력칸 한 장이 보이도록 최소 1장 유지.
  const rabiesExtraBase =
    destinationKey && SINGLE_DOSE_RABIES_DESTINATIONS.includes(destinationKey) ? 1 : 2
  const savedRabiesExtra = readRabiesExtraEntries(caseRow?.data, rabiesExtraBase)
  const [rabiesExtra, setRabiesExtra] = useState<RabiesExtraEntry[]>(
    savedRabiesExtra.length === 0 ? [makeEmptyExtra()] : savedRabiesExtra,
  )

  const savedTiterForm = readTiterForm(caseRow?.data)
  const [titerForm, setTiterForm] = useState<TiterForm>(savedTiterForm)

  // 광견병 추가 항체 검사(2회차+) — 빈 상태에서도 카드 1장이 보이도록 최소 1장 유지.
  const savedTiterExtra = isTiterSingleCard
    ? readTiterAllEntries(caseRow?.data)
    : readTiterExtraEntries(caseRow?.data)
  const [titerExtra, setTiterExtra] = useState<TiterExtraEntry[]>(
    savedTiterExtra.length === 0 ? [makeEmptyTiterExtra()] : savedTiterExtra,
  )

  const savedFlightForm = readFlightForm(caseRow?.data, caseRow?.departure_date)
  const [flightForm, setFlightForm] = useState<FlightForm>(savedFlightForm)

  const savedAdvanceDate = readAdvanceDate(caseRow?.data)
  const [advanceDate, setAdvanceDate] = useState(savedAdvanceDate)

  const savedVetVisitDate = readVetVisitDate(caseRow?.data)
  const [vetVisitDate, setVetVisitDate] = useState(savedVetVisitDate)

  const savedJpExport = readJpExportForm(caseRow?.data)
  const [jpExport, setJpExport] = useState<JpExportForm>(savedJpExport)

  const savedKrExportQuarantineDate = readKrExportQuarantineDate(caseRow?.data)
  const [krExportQuarantineDate, setKrExportQuarantineDate] = useState(savedKrExportQuarantineDate)

  // 입력칸은 자기 검역일만(항공편 날짜 자동 채움 X) — 한국 수출 검역(certificate-issue)과
  // 동일하게 비운 채로 시작해 보호자가 직접 검역일을 입력한다. 타임라인 '예정' 배지는
  // scenario.ts 가 항공편 날짜를 폴백으로 계속 띄우므로(기본 동작 유지) 상세 입력만 비운다.
  const savedJpImportQuarantineDate = readJpImportQuarantineDate(caseRow?.data)
  const jpImportQuarantineBaseline = savedJpImportQuarantineDate
  const [jpImportQuarantineDate, setJpImportQuarantineDate] = useState(jpImportQuarantineBaseline)

  const savedJpExportQuarantineVisitDate = readJpExportQuarantineVisitDate(caseRow?.data)
  const jpExportQuarantineVisitBaseline = savedJpExportQuarantineVisitDate
  const [jpExportQuarantineVisitDate, setJpExportQuarantineVisitDate] =
    useState(jpExportQuarantineVisitBaseline)

  const savedKrImportQuarantineDate = readKrImportQuarantineDate(caseRow?.data)
  const krImportQuarantineBaseline = savedKrImportQuarantineDate
  const [krImportQuarantineDate, setKrImportQuarantineDate] = useState(krImportQuarantineBaseline)

  // 나라별 도착 수입검역 — 동적 필드(importQuarantineField)에서 저장값. baseline 자동채움 없음
  // (비일본은 항공권 step 부재). 입력해야 dirty.
  const importQData = (caseRow?.data ?? {}) as Record<string, unknown>
  const savedImportQuarantineDate =
    importQuarantineField && typeof importQData[importQuarantineField] === 'string'
      ? (importQData[importQuarantineField] as string)
      : ''
  const [importQuarantineDate, setImportQuarantineDate] = useState(savedImportQuarantineDate)

  // 종합백신 — 가변 길이 entries. 빈 상태에서도 입력칸 한 장이 보이도록 최소 1장 유지.
  const savedGeneralVaccine = readGeneralVaccineForm(caseRow?.data)
  const [generalVaccine, setGeneralVaccine] = useState<GeneralVaccineEntry[]>(
    savedGeneralVaccine.length === 0 ? [makeEmptyGeneralVaccine()] : savedGeneralVaccine,
  )

  // 신청형 절차(수입 허가·싱가포르 계류장 예약·강아지 라이센스) — 신청일 + (수입 허가만)허가 번호.
  // 스코핑 필드 — 활성 목적지로 flatten 된 caseRow 기준. permit_no 는 수입 허가 전용이라 SG
  // 카드에선 읽지 않는다(같은 싱가포르 케이스에 import-permit permit_no 가 있어도 누수 방지).
  const savedImportPermit = readImportPermitForm(
    caseRow?.data,
    applicationDateField,
    isImportPermit,
    applicationReservationField,
  )
  const [importPermit, setImportPermit] = useState<ImportPermitForm>(savedImportPermit)

  // 구충(내·외부) — 가변 길이 entries (종합백신과 동일 모델, 유효기간 없음).
  const savedParasite = readParasiteForm(caseRow?.data, parasiteFieldKey)
  const [parasite, setParasite] = useState<GeneralVaccineEntry[]>(
    savedParasite.length === 0 ? [makeEmptyGeneralVaccine()] : savedParasite,
  )

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
  // 단일 카드(1회국)는 rabies 단일 폼이 아니라 목록(rabiesList)을 본다.
  const rabiesDirty = isRabies && !isRabiesSingleCard && !rabiesFormEqual(rabies, savedRabies)
  // 가변 목록은 빈 상태에서도 입력칸 1장을 띄운다(state) — 저장값(빈 카드 제외)과 length 가
  // 어긋나 항상 dirty 로 잡히던 버그. 비교 전 양쪽에서 빈 카드를 걸러 실제 입력만 비교한다.
  const rabiesListDirty =
    isRabiesSingleCard &&
    !rabiesExtraEqual(rabiesList.filter(vaccineEntryFilled), savedRabiesList.filter(vaccineEntryFilled))
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
    rabiesList,
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
    generalVaccine,
    importPermit,
    parasite,
  ])
  const rabiesExtraDirty =
    isRabiesExtra &&
    !rabiesExtraEqual(rabiesExtra.filter(vaccineEntryFilled), savedRabiesExtra.filter(vaccineEntryFilled))
  const titerDirty =
    isTiter &&
    !isTiterSingleCard &&
    (titerForm.date !== savedTiterForm.date ||
      titerForm.lab !== savedTiterForm.lab ||
      titerForm.value !== savedTiterForm.value)
  const titerExtraDirty =
    (isTiterExtra || isTiterSingleCard) &&
    !titerExtraEqual(titerExtra.filter(titerEntryFilled), savedTiterExtra.filter(titerEntryFilled))
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
  const importQuarantineDirty =
    isImportQuarantine && importQuarantineDate !== savedImportQuarantineDate
  const generalVaccineDirty =
    isGeneralVaccine &&
    !generalVaccineEqual(generalVaccine.filter(vaccineEntryFilled), savedGeneralVaccine.filter(vaccineEntryFilled))
  const importPermitDirty =
    isApplicationStep &&
    (importPermit.applicationDate !== savedImportPermit.applicationDate ||
      importPermit.permitNo !== savedImportPermit.permitNo ||
      importPermit.reservationDate !== savedImportPermit.reservationDate)
  const parasiteDirty =
    isParasite &&
    !generalVaccineEqual(parasite.filter(vaccineEntryFilled), savedParasite.filter(vaccineEntryFilled))
  const dirty =
    microchipDirty ||
    rabiesDirty ||
    rabiesListDirty ||
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
    krImportQuarantineDirty ||
    importQuarantineDirty ||
    generalVaccineDirty ||
    importPermitDirty ||
    parasiteDirty
  useUnsavedGuard(dirty)
  // 저장 직후 1.5s 동안 버튼에 '저장됨' 표시. 그 사이 재편집하면 dirty 가 살아나 자동 해제.
  const justSaved = status === 'saved' && !dirty
  // 검역·검사 4단계 — '저장' 클릭(확인)으로 완료하는 step. 미래 날짜=예정(저장만 됨),
  // 오늘 이하 날짜를 저장하면 완료. done(prop)=resolveDone=저장된 확인 플래그.
  // vet-visit 은 별도 모델(완료 = '완료' 버튼 또는 모든 필수 서류 ✓) 이라 이 패턴에서 제외.
  const isConfirmStep =
    isCertificateIssue ||
    isJpImportQuarantine ||
    isJpExportQuarantineVisit ||
    isKrImportQuarantine ||
    // 순수 날짜 완료 카드(dated)는 quarantine 입력 UI 를 공유하지만 '완료' 확인 게이트가 없다.
    (isImportQuarantine && !isSimpleDatedStep)
  const confirmFormDate = isCertificateIssue
    ? krExportQuarantineDate
    : isJpImportQuarantine
      ? jpImportQuarantineDate
      : isJpExportQuarantineVisit
        ? jpExportQuarantineVisitDate
        : isKrImportQuarantine
          ? krImportQuarantineDate
          : isImportQuarantine
            ? importQuarantineDate
            : ''
  const confirmSavedDate = isCertificateIssue
    ? savedKrExportQuarantineDate
    : isJpImportQuarantine
      ? savedJpImportQuarantineDate
      : isJpExportQuarantineVisit
        ? savedJpExportQuarantineVisitDate
        : isKrImportQuarantine
          ? savedKrImportQuarantineDate
          : isImportQuarantine
            ? savedImportQuarantineDate
            : ''
  const todayStr = todayKst()
  // 버튼 문구·저장 확인 여부는 form(입력 중) 날짜 기준. 미래면 '예정일로 저장', 오늘 이하면 '저장'.
  const formUpcoming = isConfirmStep && confirmFormDate.length >= 10 && confirmFormDate > todayStr
  const formArrived = isConfirmStep && confirmFormDate.length >= 10 && confirmFormDate <= todayStr
  // 저장된 예정일이 '오늘'이면(savedDueToday) '오늘이 예정일' 안내, '지난 후'면
  // (savedArrivedUnconfirmed) '예정일 지남' 안내. 둘 다 아직 확인(done) 전일 때만 — 검역 후
  // 완료 버튼을 누르도록(지난 경우엔 예정일 변경도) 유도한다. 어느 쪽이든 버튼은 '완료'(formArrived).
  const savedDueToday =
    isConfirmStep && confirmSavedDate.length >= 10 && confirmSavedDate === todayStr && !done
  const savedArrivedUnconfirmed =
    isConfirmStep && confirmSavedDate.length >= 10 && confirmSavedDate < todayStr && !done
  // 예정으로 저장한 검역일이 도래(≤ 오늘)했고 아직 미완료 — 변경 없이 누르면 완료 확정이므로
  // 버튼 라벨을 '완료'로 한다. 입력·변경 중(dirty)이면 '저장'/'예정일로 저장' 유지 — 즉
  // '검역일을 넣을 때 = 저장', '예정 저장분이 당일 도래 = 완료'. (추가 백신·검사와 동일 톤.)
  const confirmArrivedComplete = isConfirmStep && formArrived && !dirty && !done
  // 기록형(A부류 — 마이크로칩·광견병·백신·항체·구충·임상검사) 예정 모델 재정립(2026-07-24
  // 사용자안): 미래 입력=예정 배지 → 당일 도래=하단 버튼 '완료'(=그 예정 날짜 그대로 저장 —
  // 저장 경로의 splitScheduledDoses/splitRabiesByDate 가 ≤오늘을 실제 기록으로 편입해 승격)
  // → 하루 지나도록 안 누르면 안내("예정일이 지났습니다…"). 구 '도래=빈칸+재입력' 모델 폐기.
  const readSchedStr = (key: string): string => {
    const v = (caseRow?.data as Record<string, unknown> | undefined)?.[key]
    return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : ''
  }
  const recordScheduledDates: string[] = isMicrochip
    ? [readSchedStr('microchip_implant_date_scheduled')]
    : isVetVisit
      ? [readSchedStr('vet_visit_date_scheduled')]
      : isGeneralVaccine
        ? [readSchedStr('general_vaccine_dates_scheduled')]
        : isParasite
          ? [readSchedStr(`${parasiteFieldKey}_scheduled`)]
          : isTiterSingleCard
            ? [readSchedStr('rabies_titer_scheduled'), readSchedStr('rabies_titer_extra_scheduled')]
            : isTiter
              ? [readSchedStr('rabies_titer_scheduled')]
              : isTiterExtra
                ? [readSchedStr('rabies_titer_extra_scheduled')]
                : isRabies || isRabiesSingleCard || isRabiesExtra
                  ? (Array.isArray(caseRow?.data?.['rabies_dates_scheduled'])
                      ? (caseRow!.data!['rabies_dates_scheduled'] as unknown[]).map((e) =>
                          e && typeof e === 'object' && typeof (e as Record<string, unknown>).date === 'string'
                            ? ((e as Record<string, unknown>).date as string).slice(0, 10)
                            : '',
                        )
                      : [])
                  : []
  const recordScheduledArrived =
    !done && recordScheduledDates.some((d) => d.length >= 10 && d <= todayStr)
  const recordScheduledOverdue =
    !done && recordScheduledDates.some((d) => d.length >= 10 && d < todayStr)
  const recordScheduledComplete = recordScheduledArrived && !dirty
  // 저장 버튼 활성: 변경됨(dirty) OR 검역 confirm 예정 도래 OR 기록형 예정 도래(완료=승격 저장).
  const canSave = dirty || (formArrived && !done) || recordScheduledComplete
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
  // ⚠️ 다중카드(일본 등) 전용 — 단일카드에서 titerForm 은 화면에 안 쓰는 state 인데
  //   readTiterForm 이 예정(scheduled)을 surface 하면서, 목록에서 날짜를 지워도 이게 미래를
  //   물고 있어 '예정일로 저장' 라벨이 안 내려가던 버그(2026-07-25). 실제 폼(titerExtra)
  //   기준은 아래 titerExtraUpcoming 이 담당.
  const titerUpcoming =
    isTiter && !isTiterSingleCard && titerForm.date.length >= 10 && titerForm.date > todayStr
  // 추가 검사·단일카드(목록형 폼) — 입력 entry 중 하나라도 미래면 '예정일로 저장'.
  const titerExtraUpcoming =
    (isTiterExtra || isTiterSingleCard) &&
    titerExtra.some((e) => typeof e.date === 'string' && e.date.length >= 10 && e.date > todayStr)
  // 종합백신 — 입력 entry 중 하나라도 미래면 '예정일로 저장'. (추가 백신과 동일.)
  const generalVaccineUpcoming =
    isGeneralVaccine &&
    generalVaccine.some((e) => typeof e.date === 'string' && e.date.length >= 10 && e.date > todayStr)
  // 신청형 절차(수입 허가·계류장 예약·강아지 라이센스) — 신청일이 미래면 '예정일로 저장'.
  const importPermitUpcoming =
    isApplicationStep &&
    importPermit.applicationDate.length >= 10 &&
    importPermit.applicationDate > todayStr
  // 순수 날짜 완료 카드 — 발급일·예약일이 미래면 '예정일로 저장'(완료는 도래 후 dated resolver).
  const simpleDatedUpcoming =
    isSimpleDatedStep && importQuarantineDate.length >= 10 && importQuarantineDate > todayStr
  // 구충 — 입력 entry 중 하나라도 미래면 '예정일로 저장'.
  const parasiteUpcoming =
    isParasite &&
    parasite.some((e) => typeof e.date === 'string' && e.date.length >= 10 && e.date > todayStr)
  // 마이크로칩 — 시술일이 미래면 '예정일로 저장'.
  const microchipUpcoming = isMicrochip && date.length >= 10 && date > todayStr
  // 광견병 1·2차(2회국) — 폼 날짜가 미래면 '예정일로 저장'. 단일카드(1회국)는 목록 중 미래.
  const rabiesUpcoming =
    isRabies && !isRabiesSingleCard && rabies.date.length >= 10 && rabies.date > todayStr
  const rabiesSingleUpcoming =
    isRabiesSingleCard &&
    rabiesList.some((e) => typeof e.date === 'string' && e.date.length >= 10 && e.date > todayStr)

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
    if (!rabiesListDirty) {
      const next = readRabiesExtraEntries(caseRow?.data, 0)
      setRabiesList(next.length === 0 ? [makeEmptyExtra()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!rabiesExtraDirty) {
      const next = readRabiesExtraEntries(caseRow?.data, rabiesExtraBase)
      setRabiesExtra(next.length === 0 ? [makeEmptyExtra()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  // 광견병·종합백신 step 진입 시 org 백신 카탈로그를 1회 로드 (약품 자동추천 공용).
  useEffect(() => {
    if (!isRabies && !isRabiesExtra && !isGeneralVaccine) return
    let cancelled = false
    void getCaseVaccineData(caseId).then((r) => {
      if (!cancelled && r.ok) setVaccineData(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, isRabies, isRabiesExtra, isGeneralVaccine])
  useEffect(() => {
    if (!titerDirty) setTiterForm(readTiterForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  // 의존성을 caseRow.data 객체 정체성이 아니라 **항체 기록의 값**으로 잡는다.
  // 정체성으로 두면 매 렌더마다 effect 가 돌아, 방금 '+ 검사 기록 추가'로 만든 빈 칸이
  // (아직 dirty 가 아니라서) 즉시 지워진다 — 화면상 버튼이 안 먹는 것처럼 보였다.
  const titerRecordsKey = JSON.stringify(
    (caseRow?.data as Record<string, unknown> | undefined)?.rabies_titer_records ?? null,
  )
  useEffect(() => {
    if (!titerExtraDirty) {
      // 단일 카드 목적지는 1회차(index 0)도 이 목록 소관 — 초기값과 같은 리더를 써야 한다.
      // (예전엔 여기서만 readTiterExtraEntries 를 써서 저장된 1회차가 화면에서 지워졌다.)
      const next = isTiterSingleCard
        ? readTiterAllEntries(caseRow?.data)
        : readTiterExtraEntries(caseRow?.data)
      setTiterExtra(next.length === 0 ? [makeEmptyTiterExtra()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titerRecordsKey])
  useEffect(() => {
    // 출발일은 departure_date 컬럼 — data 만 넘기면 ''로 초기화돼 저장 직후 출발일이 사라진다.
    if (!flightDirty) setFlightForm(readFlightForm(caseRow?.data, caseRow?.departure_date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data, caseRow?.departure_date])
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
    if (!importQuarantineDirty) {
      const d = (caseRow?.data ?? {}) as Record<string, unknown>
      setImportQuarantineDate(
        importQuarantineField && typeof d[importQuarantineField] === 'string'
          ? (d[importQuarantineField] as string)
          : '',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!generalVaccineDirty) {
      const next = readGeneralVaccineForm(caseRow?.data)
      setGeneralVaccine(next.length === 0 ? [makeEmptyGeneralVaccine()] : next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!importPermitDirty)
      setImportPermit(
        readImportPermitForm(
          caseRow?.data,
          applicationDateField,
          isImportPermit,
          applicationReservationField,
        ),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!parasiteDirty) {
      const next = readParasiteForm(caseRow?.data, parasiteFieldKey)
      setParasite(next.length === 0 ? [makeEmptyGeneralVaccine()] : next)
    }
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
  // 1회국 단일 카드 — 각 entry 접종일 기준 광견병 카탈로그 hint (추가 백신과 동일).
  const rabiesListProductHints = useMemo(
    () =>
      rabiesList.map((e): RabiesProductHints | null => {
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
    [rabiesList, rabiesLookups],
  )
  // 종합백신 각 entry 의 접종일 기준 카탈로그 hint — 종(개/고양이)별 lookupComprehensive.
  // 본병원일 때만 약품 4필드에 읽기 전용 표시 (광견병과 동일 모델).
  const generalSpecies: 'dog' | 'cat' | null = useMemo(() => {
    const raw =
      typeof caseRow?.data?.species === 'string' ? (caseRow.data.species as string).toLowerCase() : ''
    if (raw === 'dog' || raw === '강아지' || raw === '개') return 'dog'
    if (raw === 'cat' || raw === '고양이') return 'cat'
    return null
  }, [caseRow])
  const generalVaccineProductHints = useMemo(
    () =>
      generalVaccine.map((e): RabiesProductHints | null => {
        if (!rabiesLookups || !e.date || !generalSpecies) return null
        const r = rabiesLookups.lookupComprehensive(generalSpecies, e.date)
        if (!r) return null
        return {
          product: r.vaccine || r.product || undefined,
          manufacturer: r.manufacturer || undefined,
          lot: r.batch || undefined,
          expiry: r.expiry || undefined,
        }
      }),
    [generalVaccine, rabiesLookups, generalSpecies],
  )

  // 내부 기생충 치료 약품 예시(placeholder) — 백신이 아니라 내부구충제, 종별로 다름.
  // 케이스 org 의 약품정보(org_vaccine_products)에서 종별 카탈로그의 최신(유효기간 늦은) 항목을
  // 그대로 예시로 보여준다 → 펫무브워크 약품관리와 항상 일치(예: 강아지 Drontal Plus/Elanco,
  // 고양이 Panacur/Intervet + 제조번호). org 에 등록이 없으면 표준 브랜드명만 기본 예시로.
  const internalParasitePlaceholders = useMemo<ProductPlaceholders | undefined>(() => {
    // org 카탈로그가 없을 때의 기본 예시 — 표준 브랜드 + 대표 제조번호(형식 안내용 예시).
    // org 약품관리에 등록돼 있으면 아래 동적 경로가 실제 제조번호로 덮어쓴다.
    const fallback: ProductPlaceholders =
      generalSpecies === 'cat'
        ? { product: '예: Panacur', manufacturer: '예: Intervet', lot: '예: A492A02' }
        : { product: '예: Drontal Plus', manufacturer: '예: Elanco', lot: '예: KV035S6' }
    const list =
      generalSpecies === 'cat'
        ? vaccineData?.parasite_internal_cat
        : vaccineData?.parasite_internal_dog
    const pick = (list ?? [])
      .slice()
      .sort((a, b) => ((a.expiry ?? '') < (b.expiry ?? '') ? 1 : -1))[0]
    const name = pick?.product || pick?.vaccine
    if (!name) return fallback
    return {
      product: `예: ${name}`,
      manufacturer: pick?.manufacturer ? `예: ${pick.manufacturer}` : fallback.manufacturer,
      // 제조번호는 케이스 org 카탈로그 값. batch 미기록이면 기본 예시로(빈칸 방지).
      lot: pick?.batch ? `예: ${pick.batch}` : fallback.lot,
    }
  }, [generalSpecies, vaccineData])

  // 저장을 막아야 하는 '입력 불가' 차단 검증을 한 곳에 모은다 — 통과(null)면 저장 가능, 위반이면
  // 사람이 읽는 에러 메시지. 단계 자체의 내재적 정합성 + 앞(선행) 단계 대비 검증만 차단한다
  // (이후 일정과의 관계는 차단 X — 확인 후 저장 + 주의). 검역·증명서·내원 step 은 서버 액션과
  // 같은 @petmove/domain 함수를 클라이언트에서도 선행해, 어차피 차단될 저장에는 확인 팝업이
  // 뜨지 않게 한다(검증 → 통과 시에만 확인 → 저장).
  function getSaveBlockError(): string | null {
    // 자기책임 모드 — 모든 입력불가 차단을 통과시킨다(아무 날짜·정보 저장). 책임은 보호자.
    if (freeInput) return null
    // 광견병 면역 유효기간 1년만 인정(RABIES_ONE_YEAR_VALIDITY_DESTINATIONS = 프로파일
    // oneYearVaccineOnly 파생) — 2·3년 저장 거부. YearSelect 비활성의 backstop.
    // 나라 이름은 예전엔 여기 손으로 적은 매핑이 유일한 출처라, 새 1년-백신국을 올릴 때
    // 빠뜨리면 "이 여행지"로 나갔다(베트남이 실제로 그랬음). 이제 domain 의 라벨에서 파생해
    // 나라를 추가해도 이 파일을 고칠 일이 없다(2026-07-20 — 4개국 추가하며 일반화).
    const oneYearKo = (destinationKey && destinationKoLabel(destinationKey)) || '이 여행지'
    const ONE_YEAR_VALIDITY_BLOCK_MSG = `${oneYearKo} 입국 시 광견병 백신은 1년까지만 유효합니다. 면역 유효기간을 1년으로 선택하세요.`
    const isMultiYearValidity = (vu: string | null | undefined): boolean => {
      const m = (vu ?? '').match(/^(\d+)\s*년$/)
      return !!m && Number(m[1]) > 1
    }
    if (isMicrochip) {
      if (chip !== '' && chip.length !== 15) return '15자리 숫자를 입력하세요.'
      const birth = readBirthDate(caseRow?.data)
      if (date && birth && date < birth) {
        return '마이크로칩 삽입일이 출생일보다 빨라요. 날짜를 확인하세요.'
      }
      return null
    }
    if (isRabiesSingleCard) {
      // 1회국 단일 카드 — 첫 접종(index 0)에 생후 최소 일령·칩 이후 차단, 전체에 chain 검증.
      const first = rabiesList[0]
      if (first?.date) {
        const minAgeDays =
          step.earliest?.anchor === 'birth' ? step.earliest.daysAfter : undefined
        // 달력 개월 기준 목적지(베트남 3개월)는 일수 대신 이 값으로 판정 — date-rules 가 처리.
        const minAgeMonths =
          step.earliest?.anchor === 'birth' ? step.earliest.monthsAfter : undefined
        const ageErr = validateRabiesPrimeAge(readBirthDate(caseRow?.data), first.date, minAgeDays, minAgeMonths)
        if (ageErr) return ageErr
        // 칩 선행은 그 나라가 *.microchip-before-rabies 를 선언할 때만 막는다 — 아래 isRabies1
        // 분기와 같은 게이트. 예전엔 1회 접종국이면 무조건 막아서, 칩이 입국 요건도 아닌
        // 베트남에서 칩을 접종보다 늦게 넣으면 저장이 거부됐다(2026-07-20 사용자 지적).
        if ((step.validationIds ?? []).some((id) => id.endsWith('.microchip-before-rabies'))) {
          const chipErr = validateMicrochipBeforeBooster(readImplantDate(caseRow?.data), first.date)
          if (chipErr) return chipErr
        }
      }
      const chainBreak = findRabiesChainBreak(
        rabiesList.map((e) => ({ date: e.date, valid_until: e.valid_until || null })),
      )
      if (chainBreak) {
        return rabiesChainBreakMessage(chainBreak)
      }
      if (rabiesOneYearOnly && rabiesList.some((e) => isMultiYearValidity(e.valid_until))) {
        return ONE_YEAR_VALIDITY_BLOCK_MSG
      }
      return null
    }
    if (isRabies) {
      if (rabiesOneYearOnly && isMultiYearValidity(rabies.valid_until)) {
        return ONE_YEAR_VALIDITY_BLOCK_MSG
      }
      // 만료된 과거 이력은 사실 데이터로 입력 허용 — 갱신 여부는 추가 접종/검사 step 의 chain
      // 검증과 procedure-check 주의(jp.rabies-extra-within-previous-validity 등)가 표면화한다.
      if (isRabies1 && rabies.date) {
        // 1차 생후 최소 일령 — procedure-check(jp 91일·th 84일 등)와 같은 domain 함수.
        // 기준 일수는 목적지별 카탈로그 override 의 earliest(birth anchor)가 단일 출처 —
        // 일본 91일, 태국 84일(12주). override 없는 나라는 기본 91일.
        const minAgeDays =
          step.earliest?.anchor === 'birth' ? step.earliest.daysAfter : undefined
        // 달력 개월 기준 목적지(베트남 3개월)는 일수 대신 이 값으로 판정 — date-rules 가 처리.
        const minAgeMonths =
          step.earliest?.anchor === 'birth' ? step.earliest.monthsAfter : undefined
        const ageErr = validateRabiesPrimeAge(readBirthDate(caseRow?.data), rabies.date, minAgeDays, minAgeMonths)
        if (ageErr) return ageErr
        // 칩 시술 이후 접종 — 1회 접종 국가(태국·필리핀·EU 패밀리)는 1차(유일한 접종)가
        // 칩 이전이면 무효라 입력 차단. 단일 출처는 목적지 override 의
        // *.microchip-before-rabies 매핑 (일본은 2차 입력 시 차단하는 기존 모델 유지 —
        // 1차는 jp.rabies-prime-before-microchip 주의가 다음 단계에서 안내).
        if ((step.validationIds ?? []).some((id) => id.endsWith('.microchip-before-rabies'))) {
          const chipErr = validateMicrochipBeforeBooster(readImplantDate(caseRow?.data), rabies.date)
          if (chipErr) return chipErr
        }
      }
      if (isRabies2) {
        const r1 = readRabiesEntryForm(caseRow?.data, 0)
        // 1차가 비어 있는데 2차를 넣으면 '날짜순 압축' 모델상 저장 시 1차로 당겨져 슬롯이
        // 어긋난다. 말없이 옮기는 대신 1차를 먼저 입력하도록 막는다(server 동일 차단 — 단일 출처).
        if (rabies.date && !r1.date) {
          return '1차 접종일을 먼저 입력하세요.'
        }
        if (r1.date && rabies.date) {
          // 1·2차 순서·간격(30일) — procedure-check 와 같은 domain 함수(단일 출처).
          // 중국은 30일 간격이 GACC 공식 근거 없는 보수 추정이라(cn.rabies-doses-30days-to-1year-apart
          // 'info' 주의로만 표면화) 하드 차단하지 않는다. 순서(2차 ≥ 1차)만 지킨다.
          if (destinationKey === 'china') {
            if (rabies.date < r1.date) {
              return '2차 접종일이 1차 접종일보다 빨라요. 날짜를 확인하세요.'
            }
          } else {
            const intervalErr = validateRabiesInterval(r1.date, rabies.date)
            if (intervalErr) return intervalErr
          }
          // 2차가 1차 면역 유효기간 이내 — 부스터 chain 검증(findRabiesChainBreak, 3차+ 와 단일 출처).
          const chainBreak = findRabiesChainBreak([
            { date: r1.date, valid_until: r1.valid_until || null },
            { date: rabies.date, valid_until: rabies.valid_until || null },
          ])
          // 순서(2차 ≥ 1차)는 위 validateRabiesInterval 이 담당 — 여기선 유효기간 경과만.
          if (chainBreak && chainBreak.reason === 'expired')
            return '2차 광견병 백신은 1차 광견병 백신 면역 유효기간 안에 해야 해요.'
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
      if (rabiesOneYearOnly && rabiesExtra.some((e) => isMultiYearValidity(e.valid_until))) {
        return ONE_YEAR_VALIDITY_BLOCK_MSG
      }
      // 프라임 시리즈 = 일본 1·2차(index 0·1) / 1회 접종국 1차(index 0)만.
      const primes = Array.from({ length: rabiesExtraBase }, (_, i) =>
        readRabiesEntryForm(caseRow?.data, i),
      )
      const chainBreak = findRabiesChainBreak([
        ...primes.map((p) => ({ date: p.date, valid_until: p.valid_until || null })),
        ...rabiesExtra.map((e) => ({ date: e.date, valid_until: e.valid_until || null })),
      ])
      if (chainBreak) {
        return rabiesChainBreakMessage(chainBreak)
      }
      return null
    }
    // 단일 카드 목적지는 아래 목록 분기가 검증한다 — 여기서 옛 단일 폼(titerForm)을 보면
    // 화면에 없는 값으로 저장이 막힌다(2026-07-19: 목록 저장이 통째로 거부되던 원인).
    if (isTiter && !isTiterSingleCard) {
      // 중국 — 항체검사는 2차 접종 후에 해야 한다(카드 문구와 짝). 2차 접종이 없는데 채혈일을
      // 넣으면 차단해 2차를 먼저 입력하게 한다. (2차가 있으면 아래 validateTiterDate 가 '채혈 ≥ 2차'를 막음.)
      if (destinationKey === 'china' && titerForm.date.trim()) {
        const r2 = readRabiesEntryForm(caseRow?.data, 1)
        if (!r2.date) {
          // 어투는 카드 문구·주의 메시지와 통일 — '광견병 항체 검사는 2차 접종 후에'
          // (2026-07-19 사용자 지시). 뒤에 조치 안내를 덧붙이는 것만 이 층의 차이.
          return '광견병 항체 검사는 2차 접종 후에 받아야 해요. 2차 접종일을 먼저 입력하세요.'
        }
      }
      // 접종 → 채혈 순서 — 채혈 전 접종이 하나도 없으면 잴 항체가 없어 논리적으로 불가능.
      // **입국 요건인 목적지에서만** 차단한다: 태국·필리핀은 입국에 항체 검사가 불필요하고
      // 카드가 뜨는 건 한국 귀국용인데, 그 검사는 광견병 접종 여부·순서와 무관하게 결과만
      // 있으면 되므로 이 제약을 붙이면 안 된다(2026-07-18 사용자 확인).
      //
      // 일본·중국은 2차 접종 기준의 더 강한 룰을 아래 validateTiterDate 가 이미 담당하고,
      // EU 는 30일 룰이 순서까지 잡는다. 실질 신규 대상은 1회 접종 + 입국 요건인 대만.
      if (
        destinationKey &&
        TITER_REQUIRED_FOR_ENTRY_DESTINATIONS.includes(destinationKey) &&
        titerForm.date.trim()
      ) {
        const orderErr = validateTiterAfterBooster(
          readRabiesDoseList(caseRow?.data).map((d) => d.date),
          titerForm.date.trim(),
        )
        if (orderErr) return orderErr
      }
      // EU 패밀리 — 채혈은 직전 유효 접종 + 30일 이후 (chain 유지 시 시계 리셋 X).
      // procedure-check(eu.titer-min-30days-after-vaccine)와 같은 알고리즘의 입력 차단.
      // EU 하드코딩 목록 ∪ 프로파일 선언(titer.minDaysAfterVaccine) — 같은 30일 요건인
      // 모로코·우크라이나가 목록에 없어 차단이 빠져 있었다(2026-07-20). EU 프로파일에 선언을
      // 채우면 합집합을 걷어내고 파생만 볼 것(titer-validity.ts 주석 참고).
      if (
        destinationKey &&
        (EU_ENTRY_FAMILY.includes(destinationKey) ||
          TITER_MIN_DAYS_AFTER_VACCINE[destinationKey] !== undefined)
      ) {
        const errMin = validateEuTiterAfterVaccine(
          readRabiesDoseList(caseRow?.data),
          titerForm.date.trim(),
          // 목적지별 최소 대기(싱가포르 28일 등) — 없으면 EU 기본 30일.
          TITER_MIN_DAYS_AFTER_VACCINE[destinationKey] ?? 30,
        )
        if (errMin) return errMin
      }
      // 만료된 과거 검사는 사실 데이터로 입력 허용 — 갱신 여부는 추가 검사/접종 step 의 검증과
      // procedure-check 주의(만료 후 추가 접종/검사 안내)가 표면화한다.
      // 4번째 인자 = 일본(1·2차 모델)에서만 '1차<칩 → 채혈=2차' 룰 적용.
      return validateTiterDate(
        caseRow?.data,
        titerForm.date,
        true,
        destinationKey === 'japan',
        !destinationKey || !TITER_REQUIRED_FOR_ENTRY_DESTINATIONS.includes(destinationKey),
      )
    }
    if (isTiterExtra || isTiterSingleCard) {
      for (const entry of titerExtra) {
        if (!entry.date) continue
        // 채혈 < 접종(순서) 저장 거부 — 단일카드(1회 접종 입국요건국)는 validateTiterAfterBooster
        //   가 안 걸리고 validateTiterDate 도 2차 없으면 통과라, 접종보다 빠른 채혈이 저장되던
        //   갭(2026-07-24 발견). extra 카드(일본·대만·하와이)는 validateTiterDate 담당이라 제외.
        if (
          isTiterSingleCard &&
          destinationKey &&
          TITER_REQUIRED_FOR_ENTRY_DESTINATIONS.includes(destinationKey)
        ) {
          const orderErr = validateTiterAfterBooster(
            readRabiesDoseList(caseRow?.data).map((x) => x.date),
            entry.date.trim(),
          )
          if (orderErr) return orderErr
        }
        // 접종 N일 후 저장 거부 — 1회 접종 입국요건국(싱가포르·EU 등)은 단일카드 경로라
        //   validateTiterDate(2차 없으면 통과)만으론 이 차단이 빠져 경고만 떴다(2026-07-24 발견).
        //   조건은 다중카드 경로와 동일(EU 패밀리 ∪ 프로파일 minDaysAfterVaccine 선언국).
        //   일본·대만·하와이는 이 집합에 없어 extra 카드 동작 무영향.
        if (
          destinationKey &&
          (EU_ENTRY_FAMILY.includes(destinationKey) ||
            TITER_MIN_DAYS_AFTER_VACCINE[destinationKey] !== undefined)
        ) {
          const minErr = validateEuTiterAfterVaccine(
            readRabiesDoseList(caseRow?.data),
            entry.date.trim(),
            TITER_MIN_DAYS_AFTER_VACCINE[destinationKey] ?? 30,
          )
          // 접두사('채혈일 날짜:') 없이 문구만 — 일본 차단 톤과 통일(2026-07-24 사용자안).
          if (minErr) return minErr
        }
        const err = validateTiterDate(
          caseRow?.data,
          entry.date,
          false,
          destinationKey === 'japan',
          !destinationKey || !TITER_REQUIRED_FOR_ENTRY_DESTINATIONS.includes(destinationKey),
        )
        if (err) return `채혈일 ${entry.date}: ${err}`
      }
      return null
    }
    if (isFlight) {
      // 출국편 기준일 — 태국 등 출발일 별도 입력 카드는 departure_date(출발일), 그 외는 entry_date.
      const outboundDate = (flightForm.departure_date || flightForm.entry_date).trim()
      // 출국 ≤ 귀국 (항공편 내재적 정합성) — 왕복에서만. 편도는 귀국 leg 가 없어, 왕복에서
      // 전환되며 남은 잔존 귀국일을 무시한다(서버 updateFlightFields·정보 저장과 동일 가드).
      if (
        tripType === 'round' &&
        outboundDate &&
        flightForm.return_date &&
        flightForm.return_date < outboundDate
      ) {
        return '귀국 항공편 날짜가 출국 항공편 날짜보다 빨라요. 날짜를 확인하세요.'
      }
      // 출발일 ≤ 도착일 (항공편 내재적 정합성) — 태국·필리핀·EU 패밀리처럼 출발일·도착일을
      // 둘 다 따로 입력받는 목적지에서, 도착일이 출발일보다 빠른 논리적 불가능 조합을 차단.
      // 둘 다 입력됐을 때만 비교(한쪽만 있으면 비교 불가라 통과).
      // 별도 입력칸이 없는 목적지는 비교하지 않는다 — 사용자가 만들 수 없는 조합인데
      // 폼에 남은 stale 값으로 막히고, 고칠 입력칸도 없다.
      if (
        showsSeparateDepartureDate &&
        // 단순 항공권 목적지는 도착일 입력칸이 없다 — stale 도착일로 막히면 고칠 칸도 없다.
        !isSimpleFlightDest &&
        flightForm.departure_date &&
        flightForm.entry_date &&
        flightForm.entry_date < flightForm.departure_date
      ) {
        return '도착일이 출발일보다 빨라요. 날짜를 확인하세요.'
      }
      // 일본 입국일 — 광견병 항체 검사 + 180일 이내면 server 가 거부할 입력. server roundtrip
      // 전 즉시 차단해 빨간 박스로 분명히 보이게 (server 결과는 form 변경 시 useEffect 가
      // 해제해 토스트가 짧게 사라질 수 있음).
      const entryRuleCtx = {
        data: (caseRow?.data ?? {}) as Record<string, unknown>,
        destination: caseRow?.destination ?? null,
        departureDate: caseRow?.departure_date ?? null,
      }
      // 싱가포르 — 출국일은 계류장 예약일 당일/하루 전(예약일을 먼저 잡는 흐름). 도메인 단일
      // 출처(validateSgDepartureVsQuarantineReservation) — sg.ts 주의 룰과 같은 함수(2026-07-25).
      if (destinationKey === 'singapore') {
        const resRaw = (caseRow?.data as Record<string, unknown> | undefined)?.[
          'sg_quarantine_reservation_date'
        ]
        const sgErr = validateSgDepartureVsQuarantineReservation(
          flightForm.departure_date.trim(),
          typeof resRaw === 'string' ? resRaw : '',
        )
        if (sgErr) return sgErr
      }
      // 목적지별 분기·기준일(일본=입국일 / 태국=출발일 / 그 외=입국일→출발일 폴백)은 도메인
      // 단일 출처(validateEntryDateForDestination)에 있다 — lint:behavior 가 같은 함수를
      // 태워 이 층을 스냅샷으로 기록한다.
      return validateEntryDateForDestination(
        flightForm.entry_date,
        flightForm.departure_date,
        entryRuleCtx,
      )
    }
    if (isGeneralVaccine) {
      const birth = readBirthDate(caseRow?.data)
      for (const e of generalVaccine) {
        // 출생일 이전 접종 — 논리적 불가능 조건이라 저장 거부.
        if (e.date && birth && e.date < birth) {
          return '접종일이 출생일보다 빨라요. 날짜를 확인하세요.'
        }
        // (면역 유효기간 valid_until 은 '1년/2년/3년' 기간 선택이라 '접종일보다 빠름' 자체가
        //  성립 안 함 — 옛 raw 비교는 "1년" < 날짜가 lexically true 라 1년 선택 시 오차단됐다.
        //  진짜 유효기간 검증은 아래 findRabiesChainBreak('expired')가 resolveValidUntil 로 처리.)
      }
      // 칩 이후 접종 — 광견병과 동일. 가장 이른 접종이 칩보다 빠르면 차단(칩 식별 연계).
      // 단일 출처는 목적지 override 의 *.microchip-before-general-vaccine 매핑(태국·필리핀).
      if ((step.validationIds ?? []).some((id) => id.endsWith('.microchip-before-general-vaccine'))) {
        const earliest = generalVaccine
          .map((e) => e.date)
          .filter((d) => d.length >= 10)
          .sort()[0]
        if (earliest) {
          const chipErr = validateMicrochipBeforeBooster(
            readImplantDate(caseRow?.data),
            earliest,
            '종합백신',
          )
          if (chipErr) return chipErr
        }
      }
      // 추가 접종 chain — 각 접종은 직전 접종 면역 유효기간 이내여야 부스터로 인정(광견병과 동일).
      // 만료 후 접종은 새 기초접종이라 직전 유효기간 이내 입력만 허용 — findRabiesChainBreak(범용)로
      // 광견병·종합백신 단일 출처. 서버(updateGeneralVaccineEntries)도 같은 검증으로 거부.
      const chainBreak = findRabiesChainBreak(
        generalVaccine.map((e) => ({ date: e.date, valid_until: e.valid_until || null })),
      )
      if (chainBreak) {
        return rabiesChainBreakMessage(chainBreak)
      }
      return null
    }
    if (isParasite) {
      // 출생일 이전 처치 — 논리적 불가능 조건이라 저장 거부.
      const birth = readBirthDate(caseRow?.data)
      for (const e of parasite) {
        if (e.date && birth && e.date < birth) {
          return '치료일이 출생일보다 빨라요. 날짜를 확인하세요.'
        }
      }
      // 필리핀 내부 기생충 치료 — SPSIC 신청일 기준 7~91일 전 창(BAI MC 49).
      // 주의 룰(ph.internal-parasite-7to91days-before-permit)과 **같은 함수**를 본다.
      // 신청일이 아직 없으면 함수가 통과시킨다 — 치료를 먼저 하는 정상 순서를 막지 않기 위해.
      if (isInternalParasite && destinationKey === 'philippines') {
        const filed = readScopedImportPermitFiled(
          (caseRow?.data ?? {}) as Record<string, unknown>,
          activeDest,
        )
        for (const e of parasite) {
          if (!e.date) continue
          const err = validatePhInternalParasiteWindow(e.date, filed)
          if (err) return err
        }
      }
      // 촌충(에키노코쿠스)은 입국 직전 1~5일(법적 24~120시간)에만 유효 — 그 밖은 의미 없어 차단.
      // (펫무브앱=5일 상한 입력불가. admin 은 1~3일 주의 유지 — portal 에선 그 주의 숨김.)
      // 기준은 입국일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체
      // (2026-07-16) — 대부분 보호자가 입국일까지는 안 적고, 통상 당일·익일 차이라 출국일로도
      // 충분히 근사된다.
      if (isEchinococcus) {
        const data = (caseRow?.data ?? {}) as Record<string, unknown>
        const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
        const dep = (caseRow?.departure_date ?? '').slice(0, 10)
        const anchor = entry || dep
        const anchorLabel = entry ? '입국' : '출국'
        for (const e of parasite) {
          if (!e.date) continue
          const err = validateEchinococcusWindow(e.date, anchor, 5, anchorLabel)
          if (err) return err
        }
      }
      return null
    }
    if (isImportPermit) {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
      const filed = importPermit.applicationDate.trim()
      // 목적지별 분기는 도메인 단일 출처(validateImportPermitFiledDate)에 있다 —
      // lint:behavior 가 같은 함수를 태워 이 층을 스냅샷으로 기록한다.
      return validateImportPermitFiledDate(destinationKey ?? '', filed, {
        departureDate: (caseRow?.departure_date ?? '').slice(0, 10),
        entryDate: entry,
        data,
      })
    }
    if (isSgQuarantineReservation) {
      // 계류장 예약 — 신청일(채혈 이후)·예약일(채혈 +90일~12개월 창) 저장 거부. 도메인 단일
      // 출처(validateSgQuarantineReservation*) — sg.ts 주의 룰과 같은 함수(2026-07-25 격상).
      // 채혈 목록은 예정 surface 포함(readTiterAllEntries) — 검증 합본과 동일 기준.
      const titerDates = readTiterAllEntries(caseRow?.data)
        .map((e) => e.date)
        .filter((d) => d.length >= 10)
      const filedErr = validateSgQuarantineReservationFiled(
        importPermit.applicationDate.trim(),
        titerDates,
      )
      if (filedErr) return filedErr
      const windowErr = validateSgQuarantineReservationDate(
        importPermit.reservationDate.trim(),
        titerDates,
      )
      if (windowErr) return windowErr
      // 출국일이 먼저 입력된 경우의 역방향 정합 — 예약일은 출국일 당일/다음 날이어야 한다.
      // (반대 순서는 항공권 카드의 validateSgDepartureVsQuarantineReservation 이 차단.)
      return validateSgReservationVsDeparture(
        importPermit.reservationDate.trim(),
        (caseRow?.departure_date ?? '').slice(0, 10),
      )
    }
    // 아일랜드 사전 통지 — 통지일이 입국일 24시간(1일) 이내면 차단.
    if (step.id === 'ie-advance-notice') {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
      return validateIeAdvanceNoticeDate(importQuarantineDate.trim(), entry)
    }
    // 노르웨이 사전 통지 — 통지일이 입국일 48시간(2일) 이내면 차단.
    if (step.id === 'no-advance-notice') {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
      return validateNoAdvanceNoticeDate(importQuarantineDate.trim(), entry)
    }
    // 키프로스 사전 통지 — 통지일이 입국일 48시간(2일) 이내면 차단.
    if (step.id === 'cy-advance-notice') {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
      return validateCyAdvanceNoticeDate(importQuarantineDate.trim(), entry)
    }
    // 몰타 사전 통지 — 통지일이 입국일 3영업일 이내면 차단.
    if (step.id === 'mt-advance-notice') {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const entry = typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
      return validateMtAdvanceNoticeDate(importQuarantineDate.trim(), entry)
    }
    // 이스라엘 사전 통보 — 통보일이 출국일 2일(2영업일 근사) 이내면 차단.
    if (step.id === 'il-advance-notice') {
      const data = (caseRow?.data ?? {}) as Record<string, unknown>
      const departure =
        (typeof caseRow?.departure_date === 'string' ? caseRow.departure_date.slice(0, 10) : '') ||
        (typeof data.departure_date === 'string' ? data.departure_date.slice(0, 10) : '')
      return validateIlAdvanceNoticeDate(importQuarantineDate.trim(), departure)
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
    // 나라별 도착(수입)·현지 수출 검역(태국·필리핀·EU 등) — 검역일이 입국일 이전(수입·수출)이거나
    // 귀국일 이후(수출)면 입력 차단. 일본 검역(jp_*)은 위 전용 분기가 따로 담당.
    if (isImportQuarantine && importQuarantineField && /_quarantine_date$/.test(importQuarantineField)) {
      const ctx = { data, destination: caseRow?.destination ?? null, departureDate: null }
      return importQuarantineField.endsWith('_export_quarantine_date')
        ? validateExportQuarantineDate(importQuarantineDate.trim(), ctx)
        : validateImportQuarantineDate(importQuarantineDate.trim(), ctx)
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
          return '일본 수출 검역은 최소 10일 전에 신청, 예약해야 해요.'
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
          // 미래(예정) 저장은 서버가 별도 자리로 분리해 실제 키가 비므로, 저장값 재읽기로
          // 입력칸이 baseline 과 일치한다(dirty 잔류·이탈 경고 방지).
          setDate(readImplantDate(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isRabiesSingleCard) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        // 단일 카드 — rabies_dates 전체를 한 번에 교체(baseIndex 0). 약품 4필드 포함.
        const sendEntries = rabiesList.filter(vaccineEntryFilled).map((e) => ({
          date: e.date || null,
          valid_until: e.valid_until || null,
          product: e.product || null,
          manufacturer: e.manufacturer || null,
          lot: e.lot || null,
          expiry: e.expiry || null,
        }))
        // 미래(예정) 회차는 서버(rabiesSaveWorking)가 rabies_dates_scheduled 로 분리·보존한다.
        const res = await updateRabiesExtraEntries(caseId, sendEntries, 0)
        if (res.ok) {
          updateCase(res.value)
          const next = readRabiesExtraEntries(res.value.data, 0)
          setRabiesList(next.length === 0 ? [makeEmptyExtra()] : next)
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
          // 서버가 trim·정규화한 값으로 폼을 맞춰 dirty 해제. 미래(예정) 저장은 서버가
          // rabies_dates_scheduled 로 분리해 실제 슬롯이 비므로 재읽기로 baseline 과 일치한다.
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
        const sendEntries = rabiesExtra.filter(vaccineEntryFilled).map((e) => ({
          date: e.date || null,
          valid_until: e.valid_until || null,
          product: e.product || null,
          manufacturer: e.manufacturer || null,
          lot: e.lot || null,
          expiry: e.expiry || null,
        }))
        // 미래(예정) 추가 회차는 서버(rabiesSaveWorking)가 rabies_dates_scheduled 로 분리·보존한다.
        const res = await updateRabiesExtraEntries(caseId, sendEntries, rabiesExtraBase)
        if (res.ok) {
          updateCase(res.value)
          const next = readRabiesExtraEntries(res.value.data, rabiesExtraBase)
          setRabiesExtra(next.length === 0 ? [makeEmptyExtra()] : next)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isTiter && !isTiterSingleCard) {
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
    } else if (isTiterExtra || isTiterSingleCard) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const sendEntries = titerExtra.filter(titerEntryFilled).map((e) => ({
          date: e.date || null,
          lab: e.lab || null,
          value: e.value || null,
        }))
        // 단일 카드 목적지는 index 0 부터가 이 카드 소관.
        const res = await updateTiterExtraEntries(
          caseId,
          sendEntries,
          isTiterSingleCard ? 0 : 1,
        )
        if (res.ok) {
          updateCase(res.value)
          const next = isTiterSingleCard
            ? readTiterAllEntries(res.value.data)
            : readTiterExtraEntries(res.value.data)
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
            // 출발일(departure_date)은 departureFirst 레이아웃(태국·필리핀·EU 패밀리)만 별도
            // 입력칸이 있다. 일본만 입력칸이 없고 출발=입국 같은 날이라, 폼에 남은 stale
            // departure_date 가 updateFlightFields 의 `explicitDep || entryDate` 에서 우선권을
            // 가져 출국일이 안 바뀌는 버그가 있었다. departureFirst 목적지가 아니면 departure_date
            // 를 보내지 않고(null) entry_date 에서 파생시킨다.
            departure_date: showsSeparateDepartureDate ? flightForm.departure_date || null : null,
            entry_date: flightForm.entry_date || null,
            entry_time: flightForm.entry_time || null,
            entry_departure_airport: flightForm.entry_departure_airport || null,
            entry_airport: flightForm.entry_airport || null,
            entry_flight_number: flightForm.entry_flight_number || null,
            entry_transport: flightForm.entry_transport || null,
            return_date: flightForm.return_date || null,
            return_departure_airport: flightForm.return_departure_airport || null,
            return_arrival_airport: flightForm.return_arrival_airport || null,
            return_flight_number: flightForm.return_flight_number || null,
            return_transport: flightForm.return_transport || null,
            return_undecided: flightForm.return_undecided || null,
          },
          // 활성 목적지 토큰을 넘긴다 — 다른 scoped 저장(검역·허가 등)과 동일. caseRow.destination(전체
          // 컬럼, 다중이면 "필리핀, 일본")을 넘기면 by_dest 쓰기 scope 가 어긋나 읽기(by_dest[활성])와
          // 불일치 → 출국일 변경·삭제가 반영 안 되던 버그.
          activeDest ?? null,
        )
        if (res.ok) {
          updateCase(res.value)
          // by_dest 저장 시 res.value.data 는 top-level 이 아니라 by_dest 에 있으므로, 활성
          // 목적지 뷰로 평탄화해서 폼을 동기화 (단일 목적지면 뷰가 원본과 동일).
          setFlightForm(
            readFlightForm(
              activeDestinationView(res.value, activeDest).data,
              activeDestinationView(res.value, activeDest).departure_date,
            ),
          )
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isGeneralVaccine) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateGeneralVaccineEntries(
          caseId,
          generalVaccine.map((e) => ({
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
          const next = readGeneralVaccineForm(res.value.data)
          setGeneralVaccine(next.length === 0 ? [makeEmptyGeneralVaccine()] : next)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isParasite) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateParasiteEntries(
          caseId,
          parasiteFieldKey,
          // 약품 4필드는 '세부 정보(선택)'(내부 기생충 치료) 입력값 — 외부/촌충은 폼에 없어 빈값 전달.
          parasite.map((e) => ({
            date: e.date || null,
            product: e.product || null,
            manufacturer: e.manufacturer || null,
            lot: e.lot || null,
            expiry: e.expiry || null,
          })),
        )
        if (res.ok) {
          updateCase(res.value)
          const next = readParasiteForm(res.value.data, parasiteFieldKey)
          setParasite(next.length === 0 ? [makeEmptyGeneralVaccine()] : next)
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isApplicationStep) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        // 수입 허가는 전용 액션(permit_no 포함), 싱가포르 신청형 카드는 범용 액션(신청일만).
        const res = isImportPermit
          ? await updateImportPermitFields(
              caseId,
              {
                application_date: importPermit.applicationDate || null,
                permit_no: importPermit.permitNo || null,
              },
              activeDest,
            )
          : await updateApplicationDate(
              caseId,
              step.id,
              importPermit.applicationDate || null,
              activeDest,
              applicationReservationField ? importPermit.reservationDate || null : undefined,
            )
        if (res.ok) {
          updateCase(res.value)
          // by_dest 저장 — 활성 목적지 뷰로 평탄화해서 폼 동기화 (항공권 step 과 동일).
          setImportPermit(
            readImportPermitForm(
              activeDestinationView(res.value, activeDest).data,
              applicationDateField,
              isImportPermit,
              applicationReservationField,
            ),
          )
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
        // 다른 백신·검사와 동일 dated-confirm — 검진일 ≤ 오늘이면 저장 즉시 완료, 미래면 예정.
        const res = await updateVetVisitDate(
          caseId,
          vetVisitDate || null,
          // 활성 목적지 토큰 — 읽기(activeDestinationView)와 scope 일치. caseRow.destination(전체
          // 컬럼)을 넘기면 다중목적지에서 by_dest 쓰기/읽기 불일치로 내원일이 반영 안 됨(플라이트와 동일).
          activeDest ?? null,
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
        const res = await updateJpExportQuarantineFields(
          caseId,
          {
            applicationDate: jpExport.applicationDate || null,
            date: jpExport.date || null,
            time: jpExport.time || null,
          },
          activeDest,
        )
        if (res.ok) {
          updateCase(res.value)
          // by_dest 저장 — 활성 목적지 뷰로 평탄화해서 폼 동기화. raw res.value.data 를 그대로
          // 읽으면 by_dest(일본) 안의 신청일·예약일이 top-level 에 없어 빈 칸이 되고 dirty 가
          // 남아 버튼이 '저장' 으로 굳었다(탭 이동 후에야 정상). 다른 by_dest 핸들러와 통일.
          setJpExport(readJpExportForm(activeDestinationView(res.value, activeDest).data))
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
    } else if (isImportQuarantine && importQuarantineField) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        // 순수 날짜 완료 카드(dated)는 확인 플래그 없는 전용 액션, 그 외 검역 카드는 confirm 액션.
        const res = isSimpleDatedStep
          ? await updateSimpleDateField(
              caseId,
              step.id,
              importQuarantineDate || null,
              activeDest,
            )
          : await updateImportQuarantineDate(
              caseId,
              importQuarantineField,
              importQuarantineDate || null,
              formArrived,
              activeDest,
            )
        if (res.ok) {
          updateCase(res.value)
          const d = (activeDestinationView(res.value, activeDest).data ?? {}) as Record<string, unknown>
          setImportQuarantineDate(
            typeof d[importQuarantineField] === 'string' ? (d[importQuarantineField] as string) : '',
          )
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


  // 타이포 정의는 settings-shared 단일 출처(serif·num·monoCap import) — 2026-07-12 통합.

  // ok=false 체크를 톤별로 분리 — '주의'(blocker/warning) vs '안내'(info).
  const failed = checkResults.filter((c) => !c.result.ok && c.check.severity !== 'info')
  const notices = checkResults.filter((c) => !c.result.ok && c.check.severity === 'info')
  // step config 의 situational 메시지 — timeline desc 와 동일 내용을 detail 에도 노출.
  // 같은 룰을 mirror 한 procedure-check 가 동일 메시지로 이미 떴으면(예: 추가 백신
  // chain-break: catalog situational ↔ jp.rabies-extra-within-previous-validity)
  // 안내·주의 두 배너에 같은 문장이 나가니 dedup 한다.
  //
  // **완료(done) 시 미표시** — timeline 은 완료면 안내 대신 doneSummary 를 쓰는데(scenario),
  // 상세만 done 무관하게 안내를 띄우면 "일정엔 완료, 상세엔 안내"의 화면 간 불일치가 난다.
  // 안내는 미완료(조치 필요) 상태에서만 — 세 곳(다음 할 일·일정 row·상세)이 done 기준으로 일치.
  // (완료인데 안내가 필요한 상황은 표시로 땜질하지 않고 done 판정 자체를 바로잡는다.)
  const rawSituationalDesc =
    caseRow && step.situational && !done ? step.situational(caseRow)?.desc : undefined
  const situationalDup =
    !!rawSituationalDesc &&
    [...failed, ...notices].some(({ result }) => result.message === rawSituationalDesc)
  let situationalDesc = situationalDup ? undefined : rawSituationalDesc
  // 항공권 step 은 안내를 **저장 전 로컬 폼 상태**로 즉시 갱신한다. 안내(귀국 항공권 입력하세요)·
  // done 은 본래 저장된 caseRow.data 에서 계산돼, '미정' 체크나 날짜 입력 직후엔 저장해야 반영됐다.
  // 라이브 flightForm 값을 입힌 합성 row 로 situational 을 다시 불러(도메인 로직 재사용) 체크 즉시
  // 사라지고/풀면 다시 나타나게 한다.
  if (isFlight && caseRow) {
    const liveRow = {
      ...caseRow,
      departure_date: flightForm.departure_date || caseRow.departure_date,
      data: {
        ...((caseRow.data as Record<string, unknown> | null) ?? {}),
        entry_date: flightForm.entry_date,
        return_date: flightForm.return_date,
        return_undecided: flightForm.return_undecided,
      },
    }
    situationalDesc = step.situational?.(liveRow)?.desc
  }
  // '지난 예정/당일' 안내 — 별도 밋밋한 박스가 아니라 상세의 정식 '안내' 카드(구름 라벨)에
  // 합류(2026-07-25 사용자 지적: 앱의 안내 방식은 ☁ 안내 카드). 검역 confirm 은 기존 문구,
  // 기록형은 재정립 문구 그대로.
  const scheduledNotice = savedDueToday
    ? `오늘은 ${step.title} 예정일이에요. 검역 후 완료 버튼을 눌러주세요.`
    : savedArrivedUnconfirmed
      ? `${step.title} 예정일이 지났어요. 완료 버튼을 누르시거나 예정일을 변경해주세요.`
      : recordScheduledOverdue
        ? '예정일이 지났습니다. 완료 버튼을 누르거나 날짜를 변경하세요.'
        : undefined
  const noticeCount = notices.length + (situationalDesc ? 1 : 0) + (scheduledNotice ? 1 : 0)
  const stepDocuments = readCaseDocuments(caseRow?.data).filter((d) => d.stepId === step.id)

  // 항공권 step + 왕복 + 출국만 입력 + 미정 아님 — '편도 전환' affordance 노출. 일본 전용 —
  // 태국·필리핀·EU 등은 귀국 leg 의 '미정' 토글만으로 처리(편도 전환 버튼 미노출, 태국과 동일).
  // 과거엔 entry_date 입력 기준이라 entry_date 레이아웃(일본·필리핀·EU)에 다 떴는데, 의도는
  // 일본 한정이었음(태국은 departure_date 주필드라 원래 미노출). destinationKey 로 명시 게이트.
  // 로컬 폼 기준으로 계산해 '미정' 체크 즉시 함께 사라진다.
  const isFlightRoundEntryOnly = (() => {
    if (!isFlight || tripType !== 'round' || destinationKey !== 'japan') return false
    const hasEntry = flightForm.entry_date.trim().length >= 10
    const hasReturn = flightForm.return_date.trim().length >= 10
    const undecided = flightForm.return_undecided === '1'
    return hasEntry && !hasReturn && !undecided
  })()
  // 사전 신고 step + 신청일 입력됐는데 허가서 첨부 아직 — 두 분기:
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
  // titer 방식 — '진행 중' ack 버튼 게이트 없이 신청일 도래(미완료·미변경)면 바로 '완료' 버튼.
  // 진행 중 안내는 situational 이 맡는다(사전 신고·수출검역·수입 허가 공통).
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
        replaceTab(router, journeyHref)
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
  // titer 방식 — ack 게이트 없이 신청일 도래(미완료·미변경)면 바로 '완료' 버튼.
  const jpExportSkipMode = isJpExportAwaitingReservation && !dirty
  const [skippingJpExport, setSkippingJpExport] = useState(false)
  const handleSkipJpExportReservation = () => {
    if (skippingJpExport) return
    setSkippingJpExport(true)
    startTransition(async () => {
      const res = await markJpExportQuarantineReservationSkipped(caseId, activeDest)
      setSkippingJpExport(false)
      if (res.ok) {
        updateCase(res.value)
        replaceTab(router, journeyHref)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  // 신청형 절차(수입 허가·계류장 예약·강아지 라이센스) — 사전 신고와 동일 2단계. 신청일 입력
  // (오늘 이하) + 미완료(첨부·완료 없음) 상태에서 변경이 없으면 하단 저장 버튼이 '완료'로 전환
  // → 발급 완료(skip) 플래그 set.
  const isImportPermitInProgress =
    isApplicationStep &&
    savedImportPermit.applicationDate.length >= 10 &&
    savedImportPermit.applicationDate <= todayStr &&
    !done
  // titer 방식(사전 신고와 동일) — '진행 중' ack 버튼 게이트 제거. 신청일 도래(미완료·미변경)면
  // 바로 '완료' 버튼. 진행 중 안내는 situational('… 진행 중이에요…')이 맡는다.
  const importPermitCompleteMode = isImportPermitInProgress && !dirty
  const [completingImportPermit, setCompletingImportPermit] = useState(false)
  const handleCompleteImportPermit = () => {
    if (completingImportPermit) return
    setCompletingImportPermit(true)
    startTransition(async () => {
      // 수입 허가는 전용 액션, 싱가포르 신청형 카드는 범용 액션(step.id 로 서버가 필드 결정).
      const res = isImportPermit
        ? await markImportPermitIssued(caseId, activeDest)
        : await markApplicationIssued(caseId, step.id, activeDest)
      setCompletingImportPermit(false)
      if (res.ok) {
        updateCase(res.value)
        replaceTab(router, journeyHref)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }
  // 신청 단계(사전 신고·일본 수출검역·수입 허가)는 모두 titer 방식 — 신청일 도래만으로 '진행 중'
  // (situational 안내 + scenario inProgress 칩), 별도 'ack' 게이트·당일/지난 배너 없이 하단
  // 저장 버튼이 바로 '완료'로 전환된다.
  // 광견병 항체 검사 — 사전 신고·수출검역과 동일 2단계.
  //  - 채혈일 입력(오늘 이하) + 미완료 = '검사 진행 중'. 하단 저장 버튼이 titerCompleteMode
  //    로 '완료' 전환 → 결과 확인 플래그 set. (결과값을 직접 입력해 저장해도 done.)
  const isTiterInProgress =
    isTiter && !isTiterSingleCard && savedTiterForm.date.length >= 10 && savedTiterForm.date <= todayStr && !done
  // 추가 검사도 1회차와 동일 2단계 — 저장된 최신 추가 채혈일이 도래했는데 미완료면 '진행 중'.
  const savedTiterExtraLatestDate = savedTiterExtra.reduce<string>(
    (m, e) => (typeof e.date === 'string' && e.date.length >= 10 && e.date > m ? e.date : m),
    '',
  )
  const isTiterExtraInProgress =
    (isTiterExtra || isTiterSingleCard) &&
    savedTiterExtraLatestDate.length >= 10 &&
    savedTiterExtraLatestDate <= todayStr &&
    !done
  const titerCompleteMode = (isTiterInProgress || isTiterExtraInProgress) && !dirty
  const [completingTiter, setCompletingTiter] = useState(false)
  const handleCompleteTiter = () => {
    if (completingTiter) return
    setCompletingTiter(true)
    startTransition(async () => {
      // 1회차/추가 각각 자기 플래그를 set — done-resolver 도 둘을 따로 본다.
      const res = isTiterExtra
        ? await markExtraTiterResultConfirmed(caseId)
        : await markTiterResultConfirmed(caseId)
      setCompletingTiter(false)
      if (res.ok) {
        updateCase(res.value)
        replaceTab(router, journeyHref)
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
          ? '이 단계를 삭제하면 이미 입력한 이후 일정과 어긋날 수 있어요. 이후 일정을 확인하세요.\n\n1차 광견병 기록이 삭제되고, 2차 광견병 기록이 1차로 올라갑니다. 이대로 진행할까요?'
          : '이 단계를 수정·삭제하면 이미 입력한 이후 일정과 어긋날 수 있어요. 이후 일정을 확인하세요.',
        okLabel: '확인',
      })
      if (!ok) return
    }
    // 항공권 출발일이 과거(이고 새로 바뀐 값)면 한 번 확인 — 과거 출발일은 여정을 '완료'로
    // 표시하므로(has-arrived 폴백), 날짜 오입력을 한 번 거른다. 출발일 자체가 안 바뀌면
    // (공항·편명만 수정) 띄우지 않는다. 출발일 의미는 전 나라 공통이라 모든 항공권 카드에 적용.
    if (isFlight) {
      const outbound = (flightForm.departure_date || flightForm.entry_date).trim()
      const savedOutbound = (savedFlightForm.departure_date || savedFlightForm.entry_date).trim()
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(outbound) &&
        outbound < todayStr &&
        outbound !== savedOutbound
      ) {
        const ok = await confirm({
          message: '출발일이 지난 날짜예요. 이대로 저장할까요?',
          okLabel: '저장',
          cancelLabel: '다시 입력',
        })
        if (!ok) return
      }
    }
    handleSave()
  }
  const handleConvertToOneWay = async () => {
    if (convertingTrip) return
    const ok = await confirm({
      message: '편도 일정으로 전환하시겠어요?',
      description:
        '일본 수출 검역·한국 수입 검역 등 귀국편 단계가 일정에서 빠져요.\n\n정보탭 → 여행 정보 → 유형 메뉴에서 왕복으로 다시 전환할 수 있어요.',
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
        replaceTab(router, journeyHref)
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
          href={journeyHref}
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
          <h1 style={{ ...subTitle, minWidth: 0 }}>{step.title}</h1>
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
          {/* description 의 모든 비어있지 않은 줄을 항목으로 표시.
              경량 마크업(opt-in): '## ' 줄 = 소제목(불릿 X, 볼드), '- ' 줄 = 하위 ✓ 항목(amber),
              그 외 = 일반 • 불릿.
              ⚠️ **모든 항의 간격은 동일하다**(사용자 지정 2026-07-22). 예전엔 \n\n 단락 경계만
              간격을 넓혔는데, 화면에선 첫 항도 같은 불릿이라 위계는 안 보이고 "왜 저기만
              벌어졌지"로만 읽혔다. 단락별 간격 차이를 다시 넣지 말 것. */}
          {(() => {
            const lines = step.description.split('\n')
            type DescItem = {
              text: string
              key: number
              kind: 'heading' | 'sub' | 'bullet'
            }
            const items = lines.reduce<Array<DescItem>>((acc, line, i) => {
              if (line.trim() === '') return acc
              if (line.startsWith('## ')) acc.push({ text: line.slice(3), key: i, kind: 'heading' })
              else if (line.startsWith('- ')) acc.push({ text: line.slice(2), key: i, kind: 'sub' })
              else acc.push({ text: line, key: i, kind: 'bullet' })
              return acc
            }, [])
            return (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {items.map(({ text, key, kind }, itemIndex) => {
                  const marginTop =
                    itemIndex === 0
                      ? 0
                      : kind === 'heading'
                        ? 16
                        : 8
                  if (kind === 'heading') {
                    return (
                      <li key={key} style={{ marginTop, fontWeight: 600, color: C.ink }}>
                        {text}
                      </li>
                    )
                  }
                  return (
                    <li
                      key={key}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        marginTop,
                        paddingLeft: kind === 'sub' ? 4 : 0,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          color: kind === 'sub' ? C.accent : C.ink3,
                          fontWeight: kind === 'sub' ? 700 : 400,
                        }}
                        aria-hidden
                      >
                        {kind === 'sub' ? '✓' : '•'}
                      </span>
                      <span>{text}</span>
                    </li>
                  )
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
          {/* 출국 전 임상검사 — 발급받을 서류(별지25호·FormAC 등)는 서류 체크리스트(/docs)에서
              보유 여부를 확인·관리한다. 활성 목적지(?dest=)를 보존해 다른 목적지로 튕기지 않게. */}
          {isVetVisit && (
            <Link
              href={
                activeDest
                  ? `/cases/${caseId}/docs?dest=${encodeURIComponent(activeDest)}`
                  : `/cases/${caseId}/docs`
              }
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
              서류 체크리스트
              <span style={{ color: C.ink3 }}>→</span>
            </Link>
          )}
          {step.links?.map((l) => {
            // 다운로드(↓)는 앱이 제공하는 로컬 정적 파일만 (/forms/x.pdf 등). 외부 URL 은 확장자가
            // 있어도(.asp·.php·.html 등 웹페이지) 파일이 아니므로 startsWith('/') 를 필수로 둔다.
            const isFile = l.url.startsWith('/') && /\/[^/]+\.[a-z0-9]+$/i.test(l.url)
            // 상대 경로(/…) = 앱 내부 페이지 → Next Link + '→', http = 외부 → 새 탭 + '↗'.
            const internal = l.url.startsWith('/') && !isFile
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
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                {...(isFile
                  ? { download: '' }
                  : {
                      // 외부 웹 링크는 인앱 브라우저(openExternalUrl)로 연다. 네이티브 WebView 는
                      // <a target="_blank"> 로 외부 URL 을 못 여는 경우가 많고(TabHost 인터셉터도
                      // target=_blank 는 통과시킴), 일부 사이트(BLV 등)는 X-Frame-Options 로 임베드도
                      // 막아 '연결 안 됨'이 된다. Browser.open 은 top-level 이라 정상 로드된다.
                      onClick: (e: React.MouseEvent) => {
                        e.preventDefault()
                        void openExternalUrl(l.url)
                      },
                    })}
                style={pillStyle}
              >
                {l.label}
                <span style={{ color: C.ink3 }}>{isFile ? '↓' : '↗'}</span>
              </a>
            )
          })}
        </section>

        {/* 안내 — situational 메시지와 procedure-check info 를 한 박스에 합친다.
            timeline 의 desc 와 동일 내용이라 detail 페이지에서도 같은 정보 전달.
            항공권 step + 왕복 + 출국만 입력 상태에선 '편도 일정으로 전환' 토글을 노출.
            사전 신고 허가서 대기(advanceSkipMode) / 일본 수출검역 신청 진행(jpExportSkipMode)
            상태의 '완료' 액션은 하단 sticky 저장 버튼이 라벨 전환으로 맡는다 — 안내 박스엔
            별도 액션 버튼 X. 완료(skip) 상태에선 situational 자체가 undefined 라 안내 박스
            미노출. */}
        {noticeCount > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.surface,
              border: `.5px solid ${C.line}`,
            }}
          >
            <div style={{ ...monoCap, color: C.info, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CloudIcon size={13} />
              <span>안내{noticeCount > 1 ? ` ${noticeCount}건` : ''}</span>
            </div>
            {situationalDesc && (
              <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {situationalDesc}
                {isFlightRoundEntryOnly && ' 귀국 일정이 미정인 경우는 편도 일정으로 전환할 수 있어요.'}
              </div>
            )}
            {scheduledNotice && (
              <div
                style={{
                  fontSize: 13,
                  color: C.ink2,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-line',
                  marginTop: situationalDesc ? 10 : 0,
                }}
              >
                {scheduledNotice}
              </div>
            )}
            {situationalDesc && isFlightRoundEntryOnly && (
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
            {notices.length > 0 && (
              <ul
                style={{
                  margin: situationalDesc || scheduledNotice ? '12px 0 0' : 0,
                  padding: situationalDesc || scheduledNotice ? '12px 0 0' : 0,
                  borderTop: situationalDesc || scheduledNotice ? `.5px solid ${C.line}` : 'none',
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* 안내 박스는 제목 없이 본문만 — 상황 안내(situationalDesc)와 같은 톤으로 통일.
                    제목(check.title)을 떼 둘이 들쭉날쭉해 보이던 문제 해소. 주의 박스는 상황 안내가
                    안 섞여 어긋남이 없으므로 제목 유지. */}
                {notices.map(({ check, result }) => (
                  <li key={check.id}>
                    {result.message && (
                      <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Warnings — 카드 배경은 다른 흰 카드와 동일 중립화, 색은 아이콘·라벨에만
            (2026-07-12: 옅은 색 배경+색 테두리 → 흰 배경+기본 테두리). */}
        {failed.length > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.surface,
              border: `.5px solid ${C.line}`,
            }}
          >
            <div style={{ ...monoCap, color: C.warn, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <StormCloudIcon size={13} />
              <span>주의{failed.length > 1 ? ` ${failed.length}건` : ''}</span>
            </div>
            {/* 안내 박스와 동일 구조 — 본문만(제목 X). 이 페이지 자체가 해당 step 이라
                check.title 은 대부분 step 이름의 반복. (2026-07-12 주의·안내 표시 전수 통일) */}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failed.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
                    {result.message ?? check.title}
                  </div>
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
        {isRabies && !isRabiesSingleCard && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <RabiesEntryInputs
              value={rabies}
              onChange={(key, next) => setRabies((prev) => ({ ...prev, [key]: next }))}
              productHints={rabiesProductHints}
              otherHospital={rabiesOtherHospital}
              hideExpiry={hideRabiesExpiry}
            />
          </section>
        )}
        {isRabiesSingleCard && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <RabiesExtraInputs
              entries={rabiesList}
              startDose={1}
              onChange={(idx, key, next) =>
                setRabiesList((prev) => prev.map((e, i) => (i === idx ? { ...e, [key]: next } : e)))
              }
              onRemove={(idx) =>
                setRabiesList((prev) => {
                  const next = prev.filter((_, i) => i !== idx)
                  return next.length === 0 ? [makeEmptyExtra()] : next
                })
              }
              onAdd={() => setRabiesList((prev) => [...prev, makeEmptyExtra()])}
              productHintsFor={(idx) => rabiesListProductHints[idx] ?? null}
              hideExpiry={hideRabiesExpiry}
              // 접종일만 노출 + 나머지 접기 — 1·2차(RabiesEntryInputs)와 동일한 시각.
              collapsible
            />
          </section>
        )}
        {isRabiesExtra && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <RabiesExtraInputs
              entries={rabiesExtra}
              startDose={rabiesExtraBase + 1}
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
              hideExpiry={hideRabiesExpiry}
            />
          </section>
        )}
        {(isTiterExtra || isTiterSingleCard) && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <TiterExtraInputs
              entries={titerExtra}
              destinationKey={destinationKey}
              startRound={isTiterSingleCard ? 1 : 2}
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
        {isTiter && !isTiterSingleCard && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <TiterInputs
              form={titerForm}
              destinationKey={destinationKey}
              onChange={(key, next) => setTiterForm((prev) => ({ ...prev, [key]: next }))}
            />
          </section>
        )}
        {isFlight && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <FlightInputs
              value={flightForm}
              onChange={(key, next) =>
                setFlightForm((prev) => {
                  const updated = { ...prev, [key]: next }
                  // 귀국일을 입력하면 '미정' 플래그는 의미가 없어 자동 해제(토글도 숨겨짐).
                  if (key === 'return_date' && next.trim().length > 0) updated.return_undecided = ''
                  return updated
                })
              }
              showReturn={tripType === 'round'}
              // 운송 방법은 일본 수출서류(japan_extra)만 사용 — 일본 케이스에서만 노출.
              showTransport={destinationKey === 'japan'}
              // 출발일(한국 출국일)과 도착일(목적지 입국일)은 다른 날일 수 있어(시차·경유) 항상
              // 별도 입력 — 태국·필리핀·EU 패밀리(EU·영국·아일랜드·몰타·노르웨이·핀란드·스위스·
              // 키프로스) 모두 출발일 주필드 + 도착일 등은 '세부 정보' 접기.
              // (과거엔 도착일 하나만 받아 그 값을 그대로 출국일 컬럼에 복사했음 — 장거리 노선에서
              // 실제 출국일과 어긋나는 버그. 2026-07-16 분리.)
              departureFirst={showsSeparateDepartureDate}
              // 일본 — 날짜 주필드 + 상세(시간·공항·편명·운송방법) 접기, 기본 접힘.
              // 펫무브가 대행하는 절차(사전 신고 NACCS·수출서류)에 항공편 정보가 실제로
              // 쓰이는 나라만 상세를 받는다(2026-07-25 — 비대행 절차국은 단순형·첨부로).
              collapsible={destinationKey === 'japan'}
              // departureFirst 의 '세부 정보'(도착일 등) 필드 한정 — 단순 목적지는 세부 자체가
              // 없고(접기 미표시), 필리핀은 도착일+도착공항만, 나머지 절차국(태국·말레이·인니·
              // UAE·이스라엘·아일랜드 등)은 전체(도착일·시간·공항·편명).
              departureDetailFieldKeys={
                // 단순 항공권 목적지 — 세부 없음(출국일·귀국일 + 첨부만).
                isSimpleFlightDest
                  ? []
                  : destinationKey === 'philippines'
                    ? ['entry_date', 'entry_airport']
                    : undefined
              }
              returnFieldKeys={
                isSimpleFlightDest || destinationKey === 'philippines' ? ['return_date'] : undefined
              }
              // 도착 공항 예시 — 기본값(나리타 NRT)이 일본 기준이라 목적지별 현지 공항으로 교체.
              fieldPlaceholders={
                destinationKey && FLIGHT_ARRIVAL_AIRPORT_EXAMPLE[destinationKey]
                  ? {
                      entry_airport: FLIGHT_ARRIVAL_AIRPORT_EXAMPLE[destinationKey],
                      return_departure_airport: FLIGHT_ARRIVAL_AIRPORT_EXAMPLE[destinationKey],
                    }
                  : undefined
              }
            />
          </section>
        )}
        {isGeneralVaccine && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <GeneralVaccineInputs
              entries={generalVaccine}
              vaccineLabel={generalVaccineCardLabel(caseRow?.data, destinationKey)}
              hideExpiry={!showProductExpiry}
              productHintsFor={(idx) => generalVaccineProductHints[idx] ?? null}
              onChange={(idx, key, next) =>
                setGeneralVaccine((prev) =>
                  prev.map((e, i) => (i === idx ? { ...e, [key]: next } : e)),
                )
              }
              onRemove={(idx) =>
                setGeneralVaccine((prev) => {
                  const next = prev.filter((_, i) => i !== idx)
                  return next.length === 0 ? [makeEmptyGeneralVaccine()] : next
                })
              }
              onAdd={() => setGeneralVaccine((prev) => [...prev, makeEmptyGeneralVaccine()])}
            />
          </section>
        )}
        {isApplicationStep && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <ImportPermitInputs
              form={importPermit}
              onChange={(key, next) => setImportPermit((prev) => ({ ...prev, [key]: next }))}
              // 허가 번호 칸은 수입 허가 전용 — 싱가포르 신청형 카드는 신청일만.
              showPermitNo={(step.inputs ?? []).some((i) => i.key === 'permit_no')}
              applicationHelp={applicationHelp}
              reservation={applicationReservation}
            />
          </section>
        )}
        {isParasite && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <GeneralVaccineInputs
              entries={parasite}
              // 1번째 카드 = 라벨, 2번째부터 = '라벨 n차' (차수 표기). 여러 번 치료 시 'n차'로 구분.
              vaccineLabel={isExternalParasite ? '외부구충' : isEchinococcus ? '촌충 치료' : '내부 기생충 치료'}
              dateLabel={isExternalParasite ? '처치일' : '치료일'}
              showValidUntil={false}
              // 내부 기생충 치료는 펫무브워크와 동일한 약품 4필드를 '세부 정보(선택)'로 직접 입력.
              showProduct={isInternalParasite}
              // 구충 약품은 '제품 유효기간'이 어느 목적지에서도 불필요 — 항상 숨김(호주·뉴질랜드 포함).
              hideExpiry
              // 구충제 예시는 백신(DHPPL)이 아니라 내부구충제 — 종별로 다르며 케이스 org 약품정보에서 가져온다.
              productPlaceholders={isInternalParasite ? internalParasitePlaceholders : undefined}
              addLabel={isExternalParasite ? '+ 처치 기록 추가' : '+ 치료 기록 추가'}
              onChange={(idx, key, next) =>
                setParasite((prev) => prev.map((e, i) => (i === idx ? { ...e, [key]: next } : e)))
              }
              onRemove={(idx) =>
                setParasite((prev) => {
                  const next = prev.filter((_, i) => i !== idx)
                  return next.length === 0 ? [makeEmptyGeneralVaccine()] : next
                })
              }
              onAdd={() => setParasite((prev) => [...prev, makeEmptyGeneralVaccine()])}
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
        {isImportQuarantine && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 4px' }}>입력</h3>
            <ImportQuarantineInputs
              date={importQuarantineDate}
              onChange={setImportQuarantineDate}
              subtitle={importQuarantineSubtitle}
              label={
                (step.inputs ?? []).find((i) => i.key === importQuarantineField)?.label ?? '검역일'
              }
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

        {/* '지난 예정/당일' 안내는 위의 정식 '안내' 카드(scheduledNotice)로 합류 —
            라벨 없는 별도 박스는 제거(2026-07-25 채널 통일). */}

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
                border: `.5px solid color-mix(in srgb, ${C.danger} 33%, transparent)`,
                color: C.danger,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {error ?? '저장 실패'}
            </div>
          )}
          {/* 저장 중·저장됨은 별도 줄 대신 버튼 라벨로 — 첨부 영역과 겹치지 않음.
              미래 날짜(예정)면 라벨을 '예정일로 저장'으로 바꿔 누르기 전에 의도를 알린다.
              사전 신고 허가서 대기(advanceSkipMode) / 일본 수출검역 신청 진행
              (jpExportSkipMode) / 광견병 항체 검사 진행(titerCompleteMode) / 수입 허가 신청
              진행(importPermitCompleteMode)이면 같은 버튼이 '완료'로 전환 — 저장할 변경이
              없는 상태에서 명시적 완료 액션을 직접 노출. */}
          {(() => {
            const completeMode =
              advanceSkipMode || jpExportSkipMode || titerCompleteMode || importPermitCompleteMode
            const processing =
              skippingApproval || skippingJpExport || completingTiter || completingImportPermit
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
                    : importPermitCompleteMode
                      ? handleCompleteImportPermit
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
                    : // 기록형 예정 도래(미변경) — '완료'(=예정 날짜 그대로 저장해 승격).
                      // 미래 예정이 함께 있어도(단일카드 목록) 도래분 승격이 우선이라 '완료'.
                      recordScheduledComplete
                      ? '완료'
                    : formUpcoming ||
                        jpExportApplicationUpcoming ||
                        advanceUpcoming ||
                        rabiesExtraUpcoming ||
                        vetVisitUpcoming ||
                        titerUpcoming ||
                        titerExtraUpcoming ||
                        generalVaccineUpcoming ||
                        importPermitUpcoming ||
                        simpleDatedUpcoming ||
                        parasiteUpcoming ||
                        rabiesUpcoming ||
                        rabiesSingleUpcoming ||
                        microchipUpcoming
                      ? '예정일로 저장'
                      : // 검역 confirm 단계 — 예정 저장분이 도래하면(미변경) 저장 = 완료 확정이라 '완료'.
                        confirmArrivedComplete
                        ? '완료'
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
  if (typeof v === 'string' && v) return v
  // 예정 시술일 surface — 구충 readParasiteForm 과 동일 패턴(2026-07-24 전수 반영).
  // 도래(≤오늘)분도 유지 — '완료' 버튼(=그대로 저장)으로 승격. 지우면 dirty → 저장 시 삭제.
  const sched = data['microchip_implant_date_scheduled']
  if (typeof sched === 'string' && sched.length >= 10) return sched.slice(0, 10)
  return ''
}

/**
 * 종합백신 폼 값을 caseRow.data.general_vaccine_dates 에서 읽어온다.
 * 항목은 {date, valid_until} 객체 또는 legacy 문자열(접종일만) — 둘 다 폼 모양으로 정규화.
 */
function readGeneralVaccineForm(
  data: Record<string, unknown> | null | undefined,
): GeneralVaccineEntry[] {
  if (!data) return []
  const arr = data['general_vaccine_dates']
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: GeneralVaccineEntry[] = []
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (typeof item === 'string') {
        // legacy: 날짜 문자열만 — 신규 카드 정책상 타병원(other_hospital:true).
        if (item.length >= 10) out.push({ ...makeEmptyGeneralVaccine(), date: item.slice(0, 10) })
        continue
      }
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>
        const date = str(rec.date)
        const validUntil = str(rec.valid_until)
        const product = str(rec.product)
        const manufacturer = str(rec.manufacturer)
        const lot = str(rec.lot)
        const expiry = str(rec.expiry)
        if (date || validUntil || product || manufacturer || lot || expiry) {
          out.push({
            date,
            valid_until: validUntil,
            product,
            manufacturer,
            lot,
            expiry,
            other_hospital: rec.other_hospital !== false,
          })
        }
      }
    }
  }
  // 예정 접종일 surface — 구충 readParasiteForm 과 동일 패턴. 도래(≤오늘)분도 유지 —
  // '완료' 버튼(=그대로 저장)으로 승격(2026-07-24 모델 재정립). 지우면 dirty → 저장 시 삭제.
  const sched = data['general_vaccine_dates_scheduled']
  if (typeof sched === 'string' && sched.length >= 10) {
    const d = sched.slice(0, 10)
    if (!out.some((e) => e.date === d)) {
      out.push({ ...makeEmptyGeneralVaccine(), date: d })
    }
  }
  return out
}

/** 백신/광견병 목록 entry 에 실제 입력이 있는지 — 빈 placeholder 카드를 dirty 비교에서 제외. */
function vaccineEntryFilled(e: {
  date?: string
  valid_until?: string
  product?: string
  manufacturer?: string
  lot?: string
  expiry?: string
}): boolean {
  return !!(e.date || e.valid_until || e.product || e.manufacturer || e.lot || e.expiry)
}

/** 항체 검사 목록 entry 에 실제 입력이 있는지 — 빈 placeholder 카드를 dirty 비교에서 제외. */
function titerEntryFilled(e: { date?: string; lab?: string; value?: string }): boolean {
  return !!(e.date || e.lab || e.value)
}

function makeEmptyGeneralVaccine(): GeneralVaccineEntry {
  // 신규 카드는 타병원 기본 — 약품칸 직접 입력 가능(본병원이면 펫무브워크가 해제). 광견병과 동일.
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

function generalVaccineEqual(a: GeneralVaccineEntry[], b: GeneralVaccineEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (e, i) =>
      e.date === b[i].date &&
      e.valid_until === b[i].valid_until &&
      e.product === b[i].product &&
      e.manufacturer === b[i].manufacturer &&
      e.lot === b[i].lot &&
      e.expiry === b[i].expiry,
  )
}

/**
 * 종합백신 카드 헤더 라벨 — 종(개/고양이)별 백신명. 카드 본문(description)의 종별 분리와
 * 짝을 맞춘다. 종 미상·기타 목적지는 '종합백신'.
 */
function generalVaccineCardLabel(
  data: Record<string, unknown> | null | undefined,
  destinationKey: string | null,
): string {
  const raw = data && typeof data['species'] === 'string' ? (data['species'] as string).toLowerCase() : ''
  const isDog = raw === 'dog' || raw === '강아지' || raw === '개'
  const isCat = raw === 'cat' || raw === '고양이'
  if (destinationKey === 'thailand') {
    if (isDog) return '종합백신(DHPPL)'
    if (isCat) return '종합백신(FVRCP)'
  }
  if (destinationKey === 'philippines') {
    if (isDog) return '종합백신(DHPPL)'
    if (isCat) return '종합백신(FVRCP)'
  }
  return '종합백신'
}

/**
 * 구충(내·외부) 폼 값 — data[fieldKey] 배열에서 읽기. 항목은 {date} 객체 또는 legacy
 * 문자열(처치일만). GeneralVaccineEntry 모양(valid_until='')으로 정규화해 컴포넌트 공유.
 */
function readParasiteForm(
  data: Record<string, unknown> | null | undefined,
  fieldKey: string,
): GeneralVaccineEntry[] {
  if (!data) return []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: GeneralVaccineEntry[] = []
  const arr = data[fieldKey]
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (typeof item === 'string') {
        if (item.length >= 10) out.push({ ...makeEmptyGeneralVaccine(), date: item.slice(0, 10) })
        continue
      }
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>
        const date = str(rec.date)
        // 약품 4필드(약품명·제조사·제조번호·제품유효기간) — '세부 정보(선택)' 직접 입력값.
        const product = str(rec.product)
        const manufacturer = str(rec.manufacturer)
        const lot = str(rec.lot)
        const expiry = str(rec.expiry)
        // 포털 구충은 약품 자동채움 카탈로그가 없어 항상 직접 입력(other_hospital:true)으로 표시 —
        // 펫무브워크가 본병원으로 지정한 값도 편집 가능한 텍스트로 그대로 보여준다.
        if (date || product || manufacturer || lot || expiry) {
          out.push({ ...makeEmptyGeneralVaccine(), date, product, manufacturer, lot, expiry })
        }
      }
    }
  }
  // 예정 처치일을 폼에 도로 surface. 저장 시 splitScheduledDoses 가 실제 기록에서 빼
  // `${fieldKey}_scheduled`(단일 문자열)로 옮기므로, 읽을 때 도로 합치지 않으면 입력칸에서
  // 사라져 배지만 남고 수정·삭제가 안 된다(2026-07-23 버그 수정). 도래(≤오늘)분도 유지한다 —
  // 하단 '완료' 버튼(=그 날짜 그대로 저장)으로 실제 기록으로 승격(2026-07-24 모델 재정립).
  const sched = data[`${fieldKey}_scheduled`]
  if (typeof sched === 'string' && sched.length >= 10) {
    const d = sched.slice(0, 10)
    if (!out.some((e) => e.date === d)) {
      out.push({ ...makeEmptyGeneralVaccine(), date: d })
    }
  }
  return out
}

/**
 * 신청형 절차 폼 값 — 신청일(dateField) + (includePermitNo 면)permit_no. flatten 된 data 기준.
 * 수입 허가는 dateField='import_permit_application_date'·includePermitNo=true, 싱가포르 신청형
 * 카드는 각자 필드·permit_no 없음(false).
 */
function readImportPermitForm(
  data: Record<string, unknown> | null | undefined,
  dateField: string,
  includePermitNo: boolean,
  reservationField?: string,
): ImportPermitForm {
  if (!data || !dateField) return { applicationDate: '', permitNo: '', reservationDate: '' }
  const filed = data[dateField]
  const no = includePermitNo ? data['permit_no'] : ''
  const res = reservationField ? data[reservationField] : ''
  return {
    applicationDate: typeof filed === 'string' ? filed : '',
    permitNo: typeof no === 'string' ? no : '',
    reservationDate: typeof res === 'string' ? res : '',
  }
}

function readBirthDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['birth_date']
  return typeof v === 'string' ? v : ''
}

/** rabies_dates → [{date, valid_until}] (EU 채혈 30일 차단용 — 전체 접종 이력). */
function readRabiesDoseList(
  data: Record<string, unknown> | null | undefined,
): Array<{ date: string; valid_until?: string | null }> {
  if (!data) return []
  const out: Array<{ date: string; valid_until?: string | null }> = []
  // 작업 세트(실제+예정) — 폼이 예정 회차를 보여주므로 채혈 차단(30일·순서)도 같은 세트로
  // 검증해야 폼과 일치한다(예: 예정 접종 + 예정 채혈 조합의 순서·간격도 잡음).
  for (const r of rabiesSaveWorking(data)) {
    if (!r || typeof r !== 'object') continue
    const rec = r as Record<string, unknown>
    const date = typeof rec.date === 'string' ? rec.date : ''
    if (date.length < 10) continue
    out.push({ date, valid_until: typeof rec.valid_until === 'string' ? rec.valid_until : null })
  }
  return out
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
  // 작업 세트(실제 + 아직 미래인 예정) — 저장 액션(updateRabiesEntryFields)이 같은 합본
  // 인덱스 위에서 편집하므로 폼도 합본을 읽어야 회차가 일치한다. 예정 회차도 입력칸에
  // 보여 수정·삭제 가능(구충·항체와 같은 read-surface, 2026-07-24 전수 반영).
  const arr = rabiesSaveWorking(data)
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
  // 작업 세트(실제+예정) — readRabiesEntryForm 과 같은 배열을 봐야 index 가 같은 회차를 가리킨다.
  const arr = rabiesSaveWorking(data)
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
 * case.data.rabies_dates 의 baseIndex 이상(일본 2=3차+ / 1회 접종국 1=2차+)을
 * RabiesExtraEntry[] 로 읽는다.
 * other_hospital 미정의는 portal 정책상 true 로 본다 (1·2차 readRabiesOtherHospital 와 동일).
 */
function readRabiesExtraEntries(
  data: Record<string, unknown> | null | undefined,
  baseIndex = 2,
): RabiesExtraEntry[] {
  if (!data) return []
  // 작업 세트(실제+예정) — readRabiesEntryForm 과 동일 사유(저장 액션과 인덱스 정합 +
  // 예정 회차 입력칸 surface). 서버(updateRabiesExtraEntries)도 폼=합본 가정으로 맞췄다.
  const arr = rabiesSaveWorking(data)
  if (!Array.isArray(arr)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: RabiesExtraEntry[] = []
  for (let i = baseIndex; i < arr.length; i++) {
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
/**
 * rabies_titer_records 를 **index 0 부터 전부** 읽는다 — 추가 검사 카드가 없는 목적지에서
 * 본 검사 카드가 목록을 통째로 다룰 때 쓴다(readTiterExtraEntries 는 1회차를 건너뛴다).
 */
function readTiterAllEntries(
  data: Record<string, unknown> | null | undefined,
): TiterExtraEntry[] {
  if (!data) return []
  const arr = data['rabies_titer_records']
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: TiterExtraEntry[] = []
  if (Array.isArray(arr)) {
    for (const rec of arr) {
      if (rec && typeof rec === 'object') {
        const r = rec as Record<string, unknown>
        out.push({ date: str(r.date), lab: str(r.lab), value: str(r.value) })
      }
    }
  }
  // 예정 채혈일을 폼에 도로 surface — 구충(readParasiteForm)과 동일 패턴(2026-07-24).
  // 저장 시 서버가 실제 기록에서 빼 예정 자리로 옮기므로, 읽을 때 도로 합치지 않으면 입력칸에서
  // 사라져 수정·삭제가 안 된다. 도래(≤오늘)분도 유지 — '완료' 버튼(=그대로 저장)으로 승격.
  // 1회차 예정(rabies_titer_scheduled)은 shell(검사기관만 남은 첫 slot)에 날짜를 도로 채운다.
  const sched = data['rabies_titer_scheduled']
  if (typeof sched === 'string' && sched.length >= 10) {
    const d = sched.slice(0, 10)
    if (!out.some((e) => e.date === d)) {
      if (out.length > 0 && !out[0].date) out[0] = { ...out[0], date: d }
      else out.unshift({ date: d, lab: '', value: '' })
    }
  }
  // 추가 검사 예정(rabies_titer_extra_scheduled) — 별도 entry 로 뒤에 붙인다.
  const extraSched = data['rabies_titer_extra_scheduled']
  if (typeof extraSched === 'string' && extraSched.length >= 10) {
    const d = extraSched.slice(0, 10)
    if (!out.some((e) => e.date === d)) {
      out.push({ date: d, lab: '', value: '' })
    }
  }
  return out
}

function readTiterExtraEntries(
  data: Record<string, unknown> | null | undefined,
): TiterExtraEntry[] {
  if (!data) return []
  const arr = data['rabies_titer_records']
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const out: TiterExtraEntry[] = []
  if (Array.isArray(arr)) {
    for (let i = 1; i < arr.length; i++) {
      const rec = arr[i]
      if (rec && typeof rec === 'object') {
        const r = rec as Record<string, unknown>
        out.push({ date: str(r.date), lab: str(r.lab), value: str(r.value) })
      }
    }
  }
  // 예정 추가 채혈일 surface — readTiterAllEntries·readParasiteForm 과 동일 패턴(도래분 포함).
  const extraSched = data['rabies_titer_extra_scheduled']
  if (typeof extraSched === 'string' && extraSched.length >= 10) {
    const d = extraSched.slice(0, 10)
    if (!out.some((e) => e.date === d)) {
      out.push({ date: d, lab: '', value: '' })
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
  /** 1·2차 모델(일본)인지 — '1차<칩 → 채혈=2차' 룰은 일본 전용. 1회 접종국은 1차<칩이 입력 단계에서 차단됨. */
  isTwoShotModel = false,
  /**
   * 접종과의 연계 규칙(채혈 ≥ 접종일 · 부스터 chain)을 건너뛴다.
   *
   * 태국·필리핀·베트남은 입국에 항체 검사가 불필요하고 카드가 뜨는 건 **한국 귀국용**이다.
   * 그 검사는 광견병 접종 여부·순서와 무관하게 결과만 있으면 된다(2026-07-18 사용자 확인).
   * 호출부에 가드가 있어도 이 함수가 같은 규칙을 다시 적용해 가드가 무력화되던 것을 막는다.
   */
  skipVaccineLinkage = false,
): string | null {
  if (!date) return null
  if (skipVaccineLinkage) return null
  const r2 = readRabiesEntryForm(data, 1)
  if (!r2.date) return null
  const r1 = readRabiesEntryForm(data, 0)
  // 규칙 A — 채혈 ≥ 1·2차 접종일. procedure-check(common.rabies-titer-chain-consistent)와 같은
  // domain 함수(단일 출처).
  // 이 함수는 2차(r2)가 있을 때만 진행하므로 2회 접종 모델 — 메시지를 '2차 접종 후'로.
  const afterErr = validateTiterAfterBooster([r1.date, r2.date], date, true)
  if (afterErr) return afterErr
  // 규칙 B — 부스터 chain 유효기간 이내. procedure-check 와 같은 domain 함수(단일 출처).
  const rabiesArr = Array.isArray(data?.['rabies_dates']) ? (data!['rabies_dates'] as unknown[]) : []
  const boosters = rabiesArr.slice(1).map((r) => {
    const rec = (r && typeof r === 'object' ? r : {}) as { date?: string; valid_until?: string | null }
    return { date: typeof rec.date === 'string' ? rec.date : '', valid_until: rec.valid_until ?? null }
  })
  const chainErr = validateTiterWithinChain(boosters, date)
  if (chainErr) return chainErr
  // '1차<칩 → 채혈은 2차와 같은 날' 룰은 일본(1·2차 모델) 전용 — 1회 접종국(태국·필리핀·EU)은
  // 1차가 칩보다 빠르면 입력 단계에서 이미 hard 차단되므로 이 상태 자체가 성립하지 않는다.
  if (isFirstTiter && isTwoShotModel) {
    const microchip = readImplantDate(data)
    if (r1.date && microchip && r1.date < microchip && date !== r2.date) {
      return '마이크로칩보다 1차 접종을 먼저 한 경우, 채혈일은 2차 접종일과 같아야 해요.'
    }
  }
  return null
}

/** 채혈일·검사기관·검사결과 — caseRow.data.rabies_titer_records[0] 의 date / lab / value. */
function readTiterForm(data: Record<string, unknown> | null | undefined): TiterForm {
  const empty: TiterForm = { date: '', lab: '', value: '' }
  if (!data) return empty
  const arr = data['rabies_titer_records']
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  let form = empty
  if (Array.isArray(arr) && arr.length > 0 && arr[0] && typeof arr[0] === 'object') {
    const r = arr[0] as Record<string, unknown>
    form = { date: str(r.date), lab: str(r.lab), value: str(r.value) }
  }
  // 예정 채혈일 surface — 저장 시 서버(updateTiterFields)가 기록 대신
  // rabies_titer_scheduled 로 옮기고 첫 slot 은 shell(검사기관만)로 남는다. 읽을 때 도로
  // 합쳐야 입력칸에서 보이고 수정·삭제된다(구충 readParasiteForm 과 동일 패턴, 2026-07-24).
  // 도래(≤오늘)분도 유지 — '완료' 버튼(=그대로 저장)으로 승격.
  if (!form.date) {
    const sched = data['rabies_titer_scheduled']
    if (typeof sched === 'string' && sched.length >= 10) {
      form = { ...form, date: sched.slice(0, 10) }
    }
  }
  return form
}

/**
 * 항공권 폼 값을 caseRow.data 의 entry_* / return_* 키에서 읽어온다 (정보 탭과 동일 키).
 *
 * readEffectiveExtraValue 로 읽어 **레거시 중첩 구조(japan_extra.inbound/outbound 등)** 까지
 * fallback 한다 — 펫무브워크의 일본 항공편 편집기(JapanExtraField)는 항공사·편명·공항·운송방법을
 * japan_extra 에 저장하고 날짜만 평탄 키로 동기화하므로, 평탄 키만 직접 읽으면 상세가 누락된다.
 * (data 는 활성 목적지 기준으로 flatten 된 값 — by_dest 는 이미 top-level 로 올라와 있다.)
 */
function readFlightForm(
  data: Record<string, unknown> | null | undefined,
  // 출발일은 departure_date 컬럼(또는 by_dest flatten 후 caseRow.departure_date) — data 에 없으므로 별도로 받는다.
  departureDate?: string | null,
): FlightForm {
  const str = (key: string) => {
    const v = readEffectiveExtraValue(data, key)
    return typeof v === 'string' ? v : ''
  }
  return {
    departure_date: typeof departureDate === 'string' ? departureDate : '',
    entry_time: str('entry_time'),
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
    return_undecided: str('return_undecided'),
  }
}

function flightFormEqual(a: FlightForm, b: FlightForm): boolean {
  return (
    a.departure_date === b.departure_date &&
    a.entry_time === b.entry_time &&
    a.entry_date === b.entry_date &&
    a.entry_departure_airport === b.entry_departure_airport &&
    a.entry_airport === b.entry_airport &&
    a.entry_flight_number === b.entry_flight_number &&
    a.entry_transport === b.entry_transport &&
    a.return_date === b.return_date &&
    a.return_departure_airport === b.return_departure_airport &&
    a.return_arrival_airport === b.return_arrival_airport &&
    a.return_flight_number === b.return_flight_number &&
    a.return_transport === b.return_transport &&
    a.return_undecided === b.return_undecided
  )
}

/** 사전 신고 신청일 — caseRow.data.advance_notification_date. */
function readAdvanceDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['advance_notification_date']
  return typeof v === 'string' ? v : ''
}

/** 내원·임상검진 검진일 — caseRow.data.vet_visit_date. 예정(미래)은 _scheduled surface. */
function readVetVisitDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['vet_visit_date']
  if (typeof v === 'string' && v) return v
  // 도래(≤오늘)분도 유지 — '완료' 버튼(=그대로 저장)으로 승격(2026-07-24 모델 재정립).
  const sched = data['vet_visit_date_scheduled']
  if (typeof sched === 'string' && sched.length >= 10) return sched.slice(0, 10)
  return ''
}

/** 한국 수출 검역 검역일 — caseRow.data.kr_export_quarantine_date. */
function readKrExportQuarantineDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['kr_export_quarantine_date']
  return typeof v === 'string' ? v : ''
}

/** 일본 수입 검역 검역일 — caseRow.data.jp_import_quarantine_date. */
function readJpImportQuarantineDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['jp_import_quarantine_date']
  return typeof v === 'string' ? v : ''
}

/** 일본 수출 검역 검역일 — caseRow.data.jp_export_quarantine_visit_date. */
function readJpExportQuarantineVisitDate(
  data: Record<string, unknown> | null | undefined,
): string {
  if (!data) return ''
  const v = data['jp_export_quarantine_visit_date']
  return typeof v === 'string' ? v : ''
}

/** 한국 수입 검역 검역일 — caseRow.data.kr_import_quarantine_date. */
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
