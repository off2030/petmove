import type { CaseRow } from '../types'

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
 * 일본 수출 동물검역 진행 상태. 일본 + 왕복 케이스에서만 의미.
 *
 *  - stored `import_export_status`: legacy 수동값. 처리 동일.
 *  - 신청일 입력 + `jp_export_quarantine_reservation_skipped` = 'done' (신청일 없으면 skip 무효)
 *  - `jp_export_quarantine_confirmed` + 예약일·시간 모두 입력 = 'done'
 *  - `jp_export_quarantine_admin_demoted_at` OR 신청일(application_date) 입력 = 'in_progress'
 *  - 그 외 = 'not_started'
 */
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
  // skip(입력 없이 완료 처리)은 신청일이 있을 때만 유효 — 신청일을 지우면 완료 처리도 해제된다.
  if (data.jp_export_quarantine_reservation_skipped === true && applied.length >= 10) return 'done'
  if (data.jp_export_quarantine_confirmed === true) {
    const hasDate =
      typeof data.jp_export_quarantine_date === 'string' &&
      (data.jp_export_quarantine_date as string).length >= 10
    const t =
      typeof data.jp_export_quarantine_time === 'string' ? data.jp_export_quarantine_time : ''
    if (hasDate && /^\d{1,2}:\d{2}$/.test(t)) return 'done'
  }
  if (typeof data.jp_export_quarantine_admin_demoted_at === 'string') return 'in_progress'
  if (applied.length >= 10) return 'in_progress'
  return 'not_started'
}
