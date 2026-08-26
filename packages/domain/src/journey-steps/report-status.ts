import type { CaseRow } from '../types'
import { resolveStepDateFields } from './dated-steps'

/**
 * 신고·신청형 절차의 진행 상태 derive — 펫무브워크 신고 탭과 펫무브 카드가 같이 쓰는 단일 출처.
 *
 * 분리 사유: 옛 코드는 stored 값(`import_import_status` / `import_export_status`)만 박았고,
 * 새 액션은 derive 시그널(advance_notification_date 등)만 박은 채 stored 를 클리어했다.
 * 두 표면이 같은 case 를 다른 상태로 보지 않도록 한곳에 합친다.
 *
 * ⚠️ **legacy stored 는 이제 여기서 읽지 않는다**(2026-08-21). 신고 탭이 이어질 카드를
 * 목적지 프로파일(`report.importStep`/`exportStep`)에 선언하는 구조로 바뀌면서, 카드가
 * 연결된 목적지의 진행 상태는 **카드 시그널 하나만**이 출처다. 남아 있던 42건의 stored 는
 * `scripts/migrate-report-status.mjs` 로 카드 시그널로 옮겼다. 카드가 연결되지 않은 목적지
 * (미국·인도네시아 등)만 stored 를 계속 쓰고, 그 값은 이제 by_dest 스코핑된다.
 * ⛔ 여기에 stored 폴백을 되살리지 말 것 — 그게 "관리자에선 완료인데 앱은 미완료" 의 원인이었다.
 */

export type JpReportStatus = 'not_started' | 'in_progress' | 'done'

/**
 * 신청 → 발급 2단계(신청일 입력=진행 중, 첨부·완료 액션=완료) 모델의 범용 spec.
 * 수입 허가(import-permit)가 원형이고, 싱가포르 계류장 예약·강아지 라이선스처럼 "신청하고
 * 확인서를 받는" 절차가 같은 모델을 공유한다. 필드 이름만 spec 으로 갈아끼운다.
 *
 *  - dateField     : 신청일 필드 키 (예: import_permit_application_date)
 *  - skipFlag      : 첨부 없이 '완료' 처리한 플래그 키 (예: import_permit_issued_skipped)
 *  - inProgressFlag: 보호자 '진행 중' 확인 플래그 키 (예: import_permit_in_progress)
 *  - attachStepId  : 첨부가 이 step 에 달렸는지 판정할 stepId
 *  - permitNoField : (선택) 번호 입력 = 완료로 보는 필드 (수입 허가 permit_no 전용)
 *  - legacyFlag    : (선택) 옛 manual-flag(journey_flags[legacyFlag]) 하위 호환
 *  - demotedField  : (선택) 운영자가 완료 → 진행중으로 내린 시각. 완료(skip)를 지우면서 이
 *                    타임스탬프를 찍는다. 일본 사전신고·수출검역이 이 자리를 쓴다.
 *  - legacyStoredKey: (선택) **옛 운영자 수동값**(신고 탭 드롭다운을 손으로 바꾸던 시절의
 *                    `import_import_status` 등). 카드 시그널 없이 이 값만 있는 옛 케이스가
 *                    완료 표시를 잃지 않도록 **바닥(floor)** 으로만 쓴다 — 카드가 더 진행된
 *                    상태면 카드가 이긴다. ⛔ '수동값이 우선' 으로 되돌리지 말 것: 그러면 앱이
 *                    진행해도 관리자 화면이 옛 값에 붙들려 두 화면이 어긋난다.
 *                    새 저장은 항상 카드 시그널로만 하고 이 키를 지운다([[setReportSlotStatus]]).
 */
export type ApplicationStepSpec = {
  dateField: string
  skipFlag: string
  inProgressFlag: string
  attachStepId: string
  permitNoField?: string
  legacyFlag?: string
  demotedField?: string
  legacyStoredKey?: string
  // (선택) 신청일과 함께 입력받는 부가 예약일(계류장 예약 날짜 등) — 정보성. 완료 판정엔
  // 영향 없다(일본 수출검역의 예약일과 동일). deriveApplicationStatus 는 이 필드를 보지 않는다.
  reservationField?: string
}

/**
 * 일본 사전 신고(NACCS) — 신청 → 허가서 2단계. 수입 허가와 같은 모델이라 같은 spec 을 쓴다
 * (2026-08-21 통합. 예전엔 deriveAdvanceNotificationStatus 가 같은 판정을 손으로 한 번 더
 * 적고 있었고, 그 사본만 legacy stored 를 읽어 admin·portal 이 어긋났다).
 */
export const ADVANCE_NOTIFICATION_APP_SPEC: ApplicationStepSpec = {
  dateField: 'advance_notification_date',
  skipFlag: 'advance_notification_approval_skipped',
  inProgressFlag: 'advance_notification_in_progress',
  attachStepId: 'advance-notification',
  demotedField: 'advance_notification_admin_demoted_at',
  legacyStoredKey: 'import_import_status',
}

/**
 * 일본 수출 검역 신청 — 위와 같은 모델. 예약일·시간은 '희망' 데이터라 완료 판정에 영향 없다
 * (reservationField 는 정보성 표기용). 이 카드는 첨부를 받지 않아 attachStepId 는 무해한 자리.
 *
 * `jp_export_quarantine_confirmed` 는 옛 모델(예약일·시간 입력 시 자동 done)의 잔재로 derive
 * 에 영향이 없다 — 완료는 skip 플래그 단일 경로.
 */
export const JP_EXPORT_QUARANTINE_APP_SPEC: ApplicationStepSpec = {
  dateField: 'jp_export_quarantine_application_date',
  skipFlag: 'jp_export_quarantine_reservation_skipped',
  inProgressFlag: 'jp_export_quarantine_in_progress',
  attachStepId: 'jp-export-quarantine',
  demotedField: 'jp_export_quarantine_admin_demoted_at',
  legacyStoredKey: 'import_export_status',
  reservationField: 'jp_export_quarantine_date',
}

export const IMPORT_PERMIT_APP_SPEC: ApplicationStepSpec = {
  dateField: 'import_permit_application_date',
  skipFlag: 'import_permit_issued_skipped',
  inProgressFlag: 'import_permit_in_progress',
  attachStepId: 'import-permit',
  permitNoField: 'permit_no',
  legacyFlag: 'import-permit-issued',
}

// 싱가포르 전용 신청형 절차 카드 — 수입 허가와 같은 신청 → 발급 모델(2026-07-24).
export const SG_QUARANTINE_RESERVATION_APP_SPEC: ApplicationStepSpec = {
  dateField: 'sg_quarantine_reservation_application_date',
  skipFlag: 'sg_quarantine_reservation_issued_skipped',
  inProgressFlag: 'sg_quarantine_reservation_in_progress',
  attachStepId: 'sg-quarantine-reservation',
  // 신청일과 함께 계류장 격리 예약 날짜(정보성)를 입력받는다 — 일본 수출검역 예약일과 동일.
  reservationField: 'sg_quarantine_reservation_date',
}
export const SG_DOG_LICENCE_APP_SPEC: ApplicationStepSpec = {
  dateField: 'sg_dog_licence_application_date',
  skipFlag: 'sg_dog_licence_issued_skipped',
  inProgressFlag: 'sg_dog_licence_in_progress',
  attachStepId: 'sg-dog-licence',
}
// ⛔ ZA_AIA_PERMIT_APP_SPEC(남아공 AIA 신청 → 발급 2단계 spec)를 다시 만들지 말 것 —
//   2026-07-30 사용자 확정으로 AIA 카드가 **버튼 완료**(호주 수입 허가 모델)로 바뀌며 제거했다.
//   이 절차에서 앱이 알아야 하는 건 '허가를 받았는가' 하나뿐이라 신청일·진행중 플래그가 필요 없다.

/**
 * 신청형 절차의 진행 상태 — 범용. 사전 신고와 동일한 신청 → 발급 2단계 모델.
 *
 *  - 첨부(stepId spec.attachStepId) = 'done'
 *  - (spec.permitNoField 있으면) 번호 입력 = 'done' — 번호가 있다는 건 발급됐다는 뜻.
 *  - 신청일 입력 + spec.skipFlag(첨부 없이 완료 처리) = 'done'
 *  - (spec.legacyFlag 있으면) 옛 manual-flag = 'done' (하위 호환)
 *  - 신청일(spec.dateField) 입력 = 'in_progress'
 *  - 그 외 = 'not_started'
 *
 * 관련 필드는 destination-scoped(by_dest) — 다중 목적지 케이스는 활성 목적지로 flatten 된
 * view(caseRow)를 넘겨야 한다 (검역 필드들과 동일 컨벤션).
 */
export function deriveApplicationStatus(
  caseRow: CaseRow,
  spec: ApplicationStepSpec,
): JpReportStatus {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const floor = spec.legacyStoredKey ? readLegacyStatusFloor(data[spec.legacyStoredKey]) : null
  return maxStatus(floor, deriveApplicationSignals(data, caseRow, spec))
}

const STATUS_RANK: Record<JpReportStatus, number> = {
  not_started: 0,
  in_progress: 1,
  done: 2,
}

/** 두 상태 중 더 진행된 쪽. 옛 수동값이 카드 진행을 **가리지 못하게** 하는 장치. */
export function maxStatus(
  a: JpReportStatus | null,
  b: JpReportStatus | null,
): JpReportStatus {
  const x = a ?? 'not_started'
  const y = b ?? 'not_started'
  return STATUS_RANK[x] >= STATUS_RANK[y] ? x : y
}

/** 옛 수동값 문자열 → 상태. 'na' 같은 admin 전용 표기는 바닥 없음(null). */
export function readLegacyStatusFloor(stored: unknown): JpReportStatus | null {
  if (stored == null || String(stored) === '') return null
  const v = String(stored)
  return v === 'in_progress' || v === 'done' || v === 'not_started' ? v : null
}

function deriveApplicationSignals(
  data: Record<string, unknown>,
  caseRow: CaseRow,
  spec: ApplicationStepSpec,
): JpReportStatus {
  const docs = Array.isArray(data.documents) ? data.documents : []
  const hasAttachment = docs.some(
    (d) =>
      !!d &&
      typeof d === 'object' &&
      (d as Record<string, unknown>).stepId === spec.attachStepId,
  )
  if (hasAttachment) return 'done'
  if (spec.permitNoField) {
    const no = data[spec.permitNoField]
    if (typeof no === 'string' && no.trim().length > 0) return 'done'
  }
  const filedRaw = data[spec.dateField]
  const filed = typeof filedRaw === 'string' ? filedRaw : ''
  // 완료(skip)는 신청일이 있을 때만 유효 — 신청일을 지우면 완료도 해제된다(사전 신고와 동일).
  //   ⚠️ 예외: **신청일 칸이 없는 카드**(뉴질랜드 수입 허가 — 허가 번호·첨부·완료 버튼 셋 중
  //   하나로 완료, 2026-07-29 사용자 확정). 그 카드는 신청일을 받지 않으므로 이 게이트를 그대로
  //   두면 완료 버튼이 영영 먹히지 않는다. 카드 선언에서 파생해 판정한다(손 명단 X).
  if (data[spec.skipFlag] === true) {
    const collectsDate = resolveStepDateFields(spec.attachStepId, caseRow.destination).includes(
      spec.dateField,
    )
    if (!collectsDate || filed.length >= 10) return 'done'
  }
  if (spec.legacyFlag) {
    const flags = data.journey_flags
    if (
      flags &&
      typeof flags === 'object' &&
      (flags as Record<string, unknown>)[spec.legacyFlag] === true
    ) {
      return 'done'
    }
  }
  // 운영자가 완료 → 진행중으로 내린 흔적. 완료 조건이 모두 풀린 뒤에 보므로 done 을 덮지 않는다
  // (첨부·허가번호가 남아 있으면 그쪽이 이겨 'done' — 신고 탭 confirm 문구가 그걸 안내한다).
  if (spec.demotedField && typeof data[spec.demotedField] === 'string') return 'in_progress'
  if (filed.length >= 10) return 'in_progress'
  return 'not_started'
}

/** 사전 신고(NACCS) 진행 상태 — 범용 derive 의 wrapper. 일본 케이스에만 의미. */
export function deriveAdvanceNotificationStatus(caseRow: CaseRow): JpReportStatus {
  return deriveApplicationStatus(caseRow, ADVANCE_NOTIFICATION_APP_SPEC)
}

/** 일본 수출 검역 신청 진행 상태 — 범용 derive 의 wrapper. 일본 + 왕복 케이스에만 의미. */
export function deriveJpExportQuarantineStatus(caseRow: CaseRow): JpReportStatus {
  return deriveApplicationStatus(caseRow, JP_EXPORT_QUARANTINE_APP_SPEC)
}

/** 수입 허가(import-permit step) 진행 상태 — 허가가 필요한 모든 목적지 공용. 범용 derive 의 wrapper. */
export function deriveImportPermitStatus(caseRow: CaseRow): JpReportStatus {
  return deriveApplicationStatus(caseRow, IMPORT_PERMIT_APP_SPEC)
}

/**
 * 신청형 절차가 '진행 중'으로 확인됐는지 — 사전 신고와 동일 게이트. 보호자의 '진행 중'
 * 버튼(spec.inProgressFlag)만으로 판정. 플래그는 by_dest(scoped) — caseRow 는 활성 목적지로
 * flatten 된 view 여야 한다(derive 와 동일 컨벤션).
 */
export function isApplicationInProgressAck(
  caseRow: CaseRow,
  spec: ApplicationStepSpec,
): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  if (data[spec.inProgressFlag] === true) return true
  // 운영자가 완료 → 진행중으로 내린 경우도 '확인됨'. (일본 두 카드만 이 자리를 쓴다.)
  return !!spec.demotedField && typeof data[spec.demotedField] === 'string'
}

/** 수입 허가 '진행 중' 확인 — 범용 ack 의 wrapper. */
export function isImportPermitInProgressAck(caseRow: CaseRow): boolean {
  return isApplicationInProgressAck(caseRow, IMPORT_PERMIT_APP_SPEC)
}

/** 사전 신고 '진행 중' 확인 — 범용 ack 의 wrapper. */
export function isAdvanceNotificationInProgressAck(caseRow: CaseRow): boolean {
  return isApplicationInProgressAck(caseRow, ADVANCE_NOTIFICATION_APP_SPEC)
}

/** 일본 수출검역 신청 '진행 중' 확인 — 범용 ack 의 wrapper. */
export function isJpExportQuarantineInProgressAck(caseRow: CaseRow): boolean {
  return isApplicationInProgressAck(caseRow, JP_EXPORT_QUARANTINE_APP_SPEC)
}
