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
