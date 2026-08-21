/**
 * 신고 탭 ↔ 여정 카드 연결 동작 검사 — 순수 도메인(DB 접근 없음).
 *
 * 지키는 계약 셋:
 *   ① 신고 탭 '완료'가 **앱 카드 완료와 같은 값**이어야 한다 (하와이 불일치 재발 방지, 2026-08-21).
 *   ② 옛 운영자 수동값은 **바닥(floor)** 으로만 — 카드가 더 진행됐으면 카드가 이긴다.
 *   ③ 한 여행지의 신고 상태가 **다른 여행지 칸으로 새지 않는다**.
 */
import {
  deriveReportSlotStatus,
  planReportSlotWrite,
  reportSlotSignalKeys,
  resolveReportBinding,
} from '../packages/domain/src/journey-steps/report-slots'
import { flattenCaseForDestination } from '../packages/domain/src/destination-scoped-fields'
import { resolveDone } from '../packages/domain/src/journey-steps/done-resolver'
import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import type { CaseRow } from '../packages/domain/src/types'

const HI_STEP = JOURNEY_STEP_CATALOG.find((s) => s.id === 'hi-import-declaration')!
const JP_STEP = JOURNEY_STEP_CATALOG.find((s) => s.id === 'advance-notification')!

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}  →  ${JSON.stringify(actual)}${ok ? '' : ` (기대: ${JSON.stringify(expected)})`}`)
}
const mk = (destination: string, data: Record<string, unknown>): CaseRow =>
  ({ id: 'x', destination, data, departure_date: null }) as unknown as CaseRow

console.log('── 연결 해석 ─────────────────────────────────────')
check('하와이 수입 = 버튼 완료형 카드', resolveReportBinding('하와이', 'import'), {
  slot: 'import',
  stepId: 'hi-import-declaration',
  model: 'dated',
  dateField: 'hi_import_declaration_date',
})
check('일본 수출 = 신청형', resolveReportBinding('일본', 'export')?.model, 'application')
check('태국 수입 = 신청형(수입 허가)', resolveReportBinding('태국', 'import')?.stepId, 'import-permit')
check('미국 = 연결 없음(수동 칸)', resolveReportBinding('미국', 'import'), null)
check('하와이 수출 = 연결 없음', resolveReportBinding('하와이', 'export'), null)

console.log('\n── 하와이(버튼 완료형) ───────────────────────────')
const hiEmpty = mk('하와이', {})
check('아무것도 없음', deriveReportSlotStatus(hiEmpty, '하와이', 'import'), 'not_started')

const hiDated = mk('하와이', { hi_import_declaration_date: '2026-08-18' })
check('카드 날짜 있음 → 완료', deriveReportSlotStatus(hiDated, '하와이', 'import'), 'done')
check('  앱 카드도 완료', resolveDone(HI_STEP.done!, hiDated), true)

const hiLegacy = mk('하와이', { import_import_status: 'done' })
check('옛 수동값만(마이그 전) → 관리자는 완료', deriveReportSlotStatus(hiLegacy, '하와이', 'import'), 'done')
check('  앱 카드는 미완료 = 이번에 고친 불일치', resolveDone(HI_STEP.done!, hiLegacy), false)

console.log('\n── 옛 수동값은 바닥으로만 (가리기 금지) ──────────')
const hiFloorLower = mk('하와이', {
  import_import_status: 'in_progress',
  hi_import_declaration_date: '2026-08-18',
})
check('수동=진행 + 카드=완료 → 완료가 이긴다', deriveReportSlotStatus(hiFloorLower, '하와이', 'import'), 'done')

const jpFloorLower = mk('일본', {
  import_import_status: 'not_started',
  advance_notification_date: '2026-07-01',
  advance_notification_approval_skipped: true,
})
check('일본: 수동=대기 + 카드=완료 → 완료', deriveReportSlotStatus(jpFloorLower, '일본', 'import'), 'done')
check('  앱 카드도 완료', resolveDone(JP_STEP.done!, jpFloorLower), true)

const jpLegacyOnly = mk('일본', { import_import_status: 'done' })
check('일본: 옛 수동값만 → 완료 유지(회귀 방지)', deriveReportSlotStatus(jpLegacyOnly, '일본', 'import'), 'done')
check('  앱 카드도 완료 유지', resolveDone(JP_STEP.done!, jpLegacyOnly), true)

console.log('\n── 다중 여행지 누수 ──────────────────────────────')
const multi = mk('하와이, 일본', {
  by_dest: { 하와이: { hi_import_declaration_date: '2026-08-18' } },
})
check(
  '하와이 완료가 일본 칸으로 안 샌다',
  deriveReportSlotStatus(flattenCaseForDestination(multi, '일본'), '일본', 'import'),
  'not_started',
)
check(
  '하와이 칸은 완료',
  deriveReportSlotStatus(flattenCaseForDestination(multi, '하와이'), '하와이', 'import'),
  'done',
)
const multiLegacy = mk('하와이, 일본', {
  by_dest: { 하와이: { import_import_status: 'done' } },
})
check(
  '옛 수동값도 by_dest 로 옮기면 안 샌다',
  deriveReportSlotStatus(flattenCaseForDestination(multiLegacy, '일본'), '일본', 'import'),
  'not_started',
)

console.log('\n── 저장 계획 ─────────────────────────────────────')
const hiBinding = resolveReportBinding('하와이', 'import')!
check('하와이 완료', planReportSlotWrite(hiBinding, 'done', {}, '2026-08-21'), {
  hi_import_declaration_date: '2026-08-21',
  import_import_status: null,
})
check('하와이 대기', planReportSlotWrite(hiBinding, 'not_started', {}, '2026-08-21'), {
  hi_import_declaration_date: null,
  import_import_status: null,
})
check('하와이 진행(카드 자리 없음 → 수동값에)', planReportSlotWrite(hiBinding, 'in_progress', {}, '2026-08-21'), {
  hi_import_declaration_date: null,
  import_import_status: 'in_progress',
})
const jpBinding = resolveReportBinding('일본', 'import')!
check('일본 완료(신청일 없으면 오늘)', planReportSlotWrite(jpBinding, 'done', {}, '2026-08-21'), {
  import_import_status: null,
  advance_notification_approval_skipped: true,
  advance_notification_in_progress: null,
  advance_notification_admin_demoted_at: null,
  advance_notification_date: '2026-08-21',
})
check('일본 완료(신청일 있으면 보존)', planReportSlotWrite(jpBinding, 'done', { advance_notification_date: '2026-07-01' }, '2026-08-21'), {
  import_import_status: null,
  advance_notification_approval_skipped: true,
  advance_notification_in_progress: null,
  advance_notification_admin_demoted_at: null,
})

console.log('\n── 신고 내리기가 비울 키 ─────────────────────────')
check('하와이', reportSlotSignalKeys('하와이'), ['hi_import_declaration_date'])
check('일본', reportSlotSignalKeys('일본'), [
  'advance_notification_date',
  'advance_notification_approval_skipped',
  'advance_notification_in_progress',
  'advance_notification_admin_demoted_at',
  'jp_export_quarantine_application_date',
  'jp_export_quarantine_reservation_skipped',
  'jp_export_quarantine_in_progress',
  'jp_export_quarantine_admin_demoted_at',
])

console.log(`\n${failures === 0 ? '✓ 전부 통과' : `✗ ${failures}건 실패`}`)
process.exit(failures === 0 ? 0 : 1)
