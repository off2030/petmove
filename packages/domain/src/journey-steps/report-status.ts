import type { CaseRow } from '../types'
import { resolveStepDateFields } from './dated-steps'

/**
 * 일본 신고 진행 상태 derive — 펫무브워크 신고 탭과 펫무브 사전 신고·일본 수출검역 step 이
 * 같이 사용. 옛 운영자 수동값(stored)이 있으면 그대로 우선, 그 외에는 portal data 시그널.
 *
 * 분리 사유: 옛 코드는 stored 값(`import_import_status` / `import_export_status`)만 박았고,
 * 새 액션(setAdvanceNotificationReportStatus 등)은 derive 시그널(advance_notification_date 등)
 * 만 박은 채 stored 를 클리어한다. 두 표면이 같은 case 를 다른 상태로 보지 않도록 한곳에 합친다.
 */

export type JpReportStatus = 'not_started' | 'in_progress' | 'done'

function hasAdvanceAttachment(data: Record<string, unknown>): boolean {
  const docs = Array.isArray(data.documents) ? data.documents : []
  return docs.some(
    (d) =>
      !!d &&
      typeof d === 'object' &&
      (d as Record<string, unknown>).stepId === 'advance-notification',
  )
}

/**
 * 사전 신고(NACCS) 진행 상태. 일본 케이스에만 의미 — 호출 측이 destination 분기.
 *
 *  - stored `import_import_status`: legacy 수동값. 'in_progress'/'done'/'not_started' 그대로.
 *    'na' 같은 admin-only 값은 portal 입장에선 미진행으로 묶는다.
 *  - 첨부 = 'done'
 *  - 신청일 입력 + `advance_notification_approval_skipped` = 'done' (신청일 없으면 skip 무효)
 *  - `advance_notification_admin_demoted_at` OR `advance_notification_date` 입력 = 'in_progress'
 *  - 그 외 = 'not_started'
 */
export function deriveAdvanceNotificationStatus(caseRow: CaseRow): JpReportStatus {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const stored = data.import_import_status
  if (stored != null && String(stored) !== '') {
    const v = String(stored)
    if (v === 'in_progress' || v === 'done' || v === 'not_started') return v
    return 'not_started'
  }
  if (hasAdvanceAttachment(data)) return 'done'
  const dt =
    typeof data.advance_notification_date === 'string' ? data.advance_notification_date : ''
  // skip(첨부 없이 완료 처리)은 신청일이 있을 때만 유효 — 신청일을 지우면 완료 처리도 해제된다.
  if (data.advance_notification_approval_skipped === true && dt.length >= 10) return 'done'
  if (typeof data.advance_notification_admin_demoted_at === 'string') return 'in_progress'
  if (dt.length >= 10) return 'in_progress'
  return 'not_started'
}

/**
 * 사전 신고가 '진행 중'으로 확인됐는지 — 신청일이 도래(≤오늘)만 한 상태(=예정)와 구분한다.
 * 보호자가 portal 에서 '진행 중' 버튼을 눌렀거나(advance_notification_in_progress), 운영자가
 * 진행 중으로 표시(admin demote / stored 'in_progress')한 경우 = 확인됨. 신청일 도래만으론 부족
 * (검역 5단계의 '예정일 지나도 자동완료 X' 와 같은 명시적 확인 게이트 — design feedback_date_based_completion).
 * derive(in_progress)는 그대로 두고(=admin·충돌검출 영향 X), 이 ack 가 portal '진행 중' 톤만 게이트한다.
 */
export function isAdvanceNotificationInProgressAck(caseRow: CaseRow): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return (
    data.advance_notification_in_progress === true ||
    typeof data.advance_notification_admin_demoted_at === 'string' ||
    data.import_import_status === 'in_progress'
  )
}

/**
 * 일본 수출 동물검역 진행 상태. 일본 + 왕복 케이스에서만 의미.
 *
 *  - stored `import_export_status`: legacy 수동값. 처리 동일.
 *  - 신청일 입력 + `jp_export_quarantine_reservation_skipped` = 'done'
 *    (신청일 없으면 skip 무효. portal·admin 의 '완료' 액션이 이 플래그를 set — 단일 done 경로)
 *  - `jp_export_quarantine_admin_demoted_at` OR 신청일(application_date) 입력 = 'in_progress'
 *  - 그 외 = 'not_started'
 *
 * `jp_export_quarantine_confirmed` 플래그는 옛 모델(예약일·시간 입력 시 자동 done)의 잔재.
 * 새 모델에선 완료는 명시적 '완료' 액션 단일 경로만 인정한다 — confirmed 는 derive 에
 * 영향 X(존재해도 단순 데이터). 옛 케이스가 confirmed=true 만 있다면 이제 'in_progress'
 * 로 보이며, 보호자가 '완료' 버튼을 한 번 더 누르면 done 으로 정리된다.
 */
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
 */
export type ApplicationStepSpec = {
  dateField: string
  skipFlag: string
  inProgressFlag: string
  attachStepId: string
  permitNoField?: string
  legacyFlag?: string
  // (선택) 신청일과 함께 입력받는 부가 예약일(계류장 예약 날짜 등) — 정보성. 완료 판정엔
  // 영향 없다(일본 수출검역의 예약일과 동일). deriveApplicationStatus 는 이 필드를 보지 않는다.
  reservationField?: string
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
/**
 * 남아공 AIA 수입 허가(개 전용) — 수의검역 수입 허가와 **별개의 두 번째 허가**라
 * import-permit 카드를 나눠 쓸 수 없다. 처리에 최대 30영업일이 걸려 '신청했다'와
 * '허가가 나왔다'가 몇 주 벌어지므로 신청 → 발급 2단계 모델을 그대로 쓴다.
 */
export const ZA_AIA_PERMIT_APP_SPEC: ApplicationStepSpec = {
  dateField: 'za_aia_permit_application_date',
  skipFlag: 'za_aia_permit_issued_skipped',
  inProgressFlag: 'za_aia_permit_in_progress',
  attachStepId: 'za-aia-permit',
}

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
  if (filed.length >= 10) return 'in_progress'
  return 'not_started'
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
  return data[spec.inProgressFlag] === true
}

/** 수입 허가 '진행 중' 확인 — 범용 ack 의 wrapper. */
export function isImportPermitInProgressAck(caseRow: CaseRow): boolean {
  return isApplicationInProgressAck(caseRow, IMPORT_PERMIT_APP_SPEC)
}

export function deriveJpExportQuarantineStatus(caseRow: CaseRow): JpReportStatus {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const stored = data.import_export_status
  if (stored != null && String(stored) !== '') {
    const v = String(stored)
    if (v === 'in_progress' || v === 'done' || v === 'not_started') return v
    return 'not_started'
  }
  const applied =
    typeof data.jp_export_quarantine_application_date === 'string'
      ? data.jp_export_quarantine_application_date
      : ''
  // 완료(skip)는 신청일이 있을 때만 유효 — 신청일을 지우면 완료도 해제된다.
  if (data.jp_export_quarantine_reservation_skipped === true && applied.length >= 10) return 'done'
  if (typeof data.jp_export_quarantine_admin_demoted_at === 'string') return 'in_progress'
  if (applied.length >= 10) return 'in_progress'
  return 'not_started'
}

/**
 * 일본 수출검역 신청이 '진행 중'으로 확인됐는지 — 사전 신고와 동일 게이트.
 * jp_export_quarantine_in_progress(보호자 버튼) / admin demote / stored 'in_progress'.
 */
export function isJpExportQuarantineInProgressAck(caseRow: CaseRow): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return (
    data.jp_export_quarantine_in_progress === true ||
    typeof data.jp_export_quarantine_admin_demoted_at === 'string' ||
    data.import_export_status === 'in_progress'
  )
}
