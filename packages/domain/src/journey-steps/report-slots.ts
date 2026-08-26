/**
 * 펫무브워크 **신고 탭 '수입'·'수출' 칸 ↔ 여정 카드** 연결 — 단일 출처.
 *
 * ── 왜 생겼나 ─────────────────────────────────────────────────────────────
 * 옛 구조는 "어느 나라의 수입 칸이 어느 카드와 이어지는가" 를 admin 안에 **세 벌**로 손으로
 * 적고 있었다: 상태 read 분기(`isJapan`/`usesImportPermitReport`), 쓰기 분기(SelectCell 의
 * `isJapanReport`/`isImportPermitReport`), 그리고 legacy stored 폴백. 명단에 없는 나라는
 * 조용히 "stored 값만 쓰는 수동 칸" 으로 떨어졌고, 그 결과 **관리자에서 '완료' 로 바꿔도
 * 펫무브 앱 카드는 영영 미완료**로 남았다(하와이 입국 신청 — 2026-08-21 사용자 발견).
 * 나라를 추가할 때마다 세 곳을 같이 고쳐야 해서 같은 사고가 반복될 구조였다.
 *
 * ── 새 구조 ───────────────────────────────────────────────────────────────
 * 목적지 프로파일(`DESTINATION_OVERRIDES[key].report`)에 **카드 id 하나만** 선언한다.
 *
 *     hawaii: { report: { importStep: 'hi-import-declaration' } }
 *
 * 나머지(모델·필드·완료 판정·쓰기 계획)는 전부 카드 선언에서 파생한다:
 *   · 신청형(신청일 입력=진행 중, 완료 액션=완료) → 그 카드의 [[ApplicationStepSpec]]
 *   · 버튼 완료형(`done: 'dated:<field>'`)        → 그 카드의 날짜 필드([[resolveDatedStepField]])
 *
 * 선언이 없는 목적지(미국·인도네시아 등 — 아직 이어질 카드가 정해지지 않은 곳)는 예전처럼
 * 운영자 수동값(`import_import_status`)만 쓴다. 그 값은 이제 by_dest 스코핑이라 다중 여행지
 * 케이스에서 옆 나라로 새지 않는다.
 *
 * `pnpm lint:journey` 가 선언한 카드가 실제로 그 목적지에 적용되는지 + 모델을 해석할 수
 * 있는지 전수 검사한다.
 */

import { DESTINATION_OVERRIDES } from '../destination-config'
import { todayKst } from '../procedure-checks/utils'
import type { CaseRow } from '../types'
import { findDestinationKey } from './applicability'
import { resolveDatedStepField } from './dated-steps'
import {
  ADVANCE_NOTIFICATION_APP_SPEC,
  IMPORT_PERMIT_APP_SPEC,
  JP_EXPORT_QUARANTINE_APP_SPEC,
  SG_DOG_LICENCE_APP_SPEC,
  SG_QUARANTINE_RESERVATION_APP_SPEC,
  deriveApplicationStatus,
  maxStatus,
  readLegacyStatusFloor,
  type ApplicationStepSpec,
  type JpReportStatus,
} from './report-status'

export type ReportSlot = 'import' | 'export'

/**
 * 슬롯별 **옛 운영자 수동값** 키 — 신고 탭 드롭다운을 손으로 바꾸던 시절의 값.
 * 카드 연결이 없는 목적지에선 여전히 이 값이 유일한 상태이고, 연결이 있는 목적지에선
 * 옛 케이스가 완료 표시를 잃지 않게 하는 **바닥**으로만 쓴다([[maxStatus]]).
 */
export const REPORT_LEGACY_STATUS_KEY: Readonly<Record<ReportSlot, string>> = {
  import: 'import_import_status',
  export: 'import_export_status',
}

/**
 * 신청형 모델을 쓰는 카드 — stepId → spec. spec 이 있으면 신청형, 없으면 카드의 `dated:`
 * 선언에서 버튼 완료형으로 파생한다. (spec 자체는 report-status 가 단일 출처 — 여기선 색인만.)
 */
const APPLICATION_SPEC_BY_STEP: Readonly<Record<string, ApplicationStepSpec>> = {
  'advance-notification': ADVANCE_NOTIFICATION_APP_SPEC,
  'jp-export-quarantine': JP_EXPORT_QUARANTINE_APP_SPEC,
  'import-permit': IMPORT_PERMIT_APP_SPEC,
  'sg-quarantine-reservation': SG_QUARANTINE_RESERVATION_APP_SPEC,
  'sg-dog-licence': SG_DOG_LICENCE_APP_SPEC,
}

export type ReportBinding =
  | { slot: ReportSlot; stepId: string; model: 'application'; spec: ApplicationStepSpec }
  | { slot: ReportSlot; stepId: string; model: 'dated'; dateField: string }

/** 프로파일에 선언된 stepId (해석 전). 미선언이면 null. */
export function reportStepIdFor(
  destination: string | null | undefined,
  slot: ReportSlot,
): string | null {
  if (!destination) return null
  const key = findDestinationKey(destination)
  if (!key) return null
  const decl = DESTINATION_OVERRIDES[key]?.report
  const stepId = slot === 'import' ? decl?.importStep : decl?.exportStep
  return stepId ?? null
}

/**
 * 목적지 + 슬롯 → 카드 연결. 선언이 없거나 모델을 해석할 수 없으면 null(= 수동 칸).
 *
 * ⚠️ destination 은 **단일 토큰**(활성 여행지)이어야 한다. "하와이, 일본" 같은 전체 문자열을
 * 넘기면 첫 매칭 나라로 풀려 read/write 가 엇갈린다 — 옛 admin 분기가 정확히 그 버그를 냈다.
 */
export function resolveReportBinding(
  destination: string | null | undefined,
  slot: ReportSlot,
): ReportBinding | null {
  const stepId = reportStepIdFor(destination, slot)
  if (!stepId) return null
  const spec = APPLICATION_SPEC_BY_STEP[stepId]
  if (spec) return { slot, stepId, model: 'application', spec }
  const dateField = resolveDatedStepField(stepId, destination)
  if (dateField) return { slot, stepId, model: 'dated', dateField }
  return null
}

/**
 * 카드에서 파생한 진행 상태. 연결이 없으면 null — 호출 측이 수동 stored 로 폴백한다.
 *
 * `caseRow` 는 **활성 여행지로 flatten 된 view** 여야 한다(신청일·완료 플래그가 by_dest
 * 스코핑이라 원본 row 를 넘기면 다중 여행지에서 신호를 못 본다 — derive 공통 컨벤션).
 */
export function deriveReportSlotStatus(
  caseRow: CaseRow,
  destination: string | null | undefined,
  slot: ReportSlot,
): JpReportStatus | null {
  const binding = resolveReportBinding(destination, slot)
  if (!binding) return null
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  // 옛 수동값은 바닥으로만 — 카드가 더 진행됐으면 카드가 이긴다(가리기 금지).
  const floor = readLegacyStatusFloor(data[REPORT_LEGACY_STATUS_KEY[slot]])
  if (binding.model === 'application') {
    // 신청형은 spec.legacyStoredKey 로 같은 바닥을 이미 적용한다 — 중복 적용은 무해(멱등).
    return maxStatus(floor, deriveApplicationStatus(caseRow, binding.spec))
  }
  const raw = data[binding.dateField]
  const v = typeof raw === 'string' ? raw : ''
  if (v.length < 10) return maxStatus(floor, 'not_started')
  // 미래 날짜 = 예정. done-resolver 의 `dated:` 판정과 같은 도래 게이트를 쓴다.
  return maxStatus(floor, v.slice(0, 10) <= todayKst() ? 'done' : 'in_progress')
}

/**
 * 신고 탭에서 상태를 바꿀 때 case.data 에 써야 할 **카드 시그널 목록**.
 * `null` = 비우기(scoped 키는 by_dest null sentinel, 전역 키는 delete).
 *
 * 첨부·허가번호는 보호자/추가정보 관할이라 건드리지 않는다 — 둘 중 하나라도 남아 있으면
 * derive 가 계속 'done' 이라 '대기/진행'으로 못 내릴 수 있고, 그건 UI confirm 이 안내한다.
 */
export function planReportSlotWrite(
  binding: ReportBinding,
  target: JpReportStatus,
  /** flatten 된 view 의 data — 기존 신청일 유무 판정용. */
  viewData: Record<string, unknown>,
  today: string,
): Record<string, unknown> {
  const legacyKey = REPORT_LEGACY_STATUS_KEY[binding.slot]
  if (binding.model === 'dated') {
    // 버튼 완료형 — 날짜 하나가 완료 증거라 '진행 중' 을 적을 카드 자리가 없다.
    //   대기/완료는 카드 날짜로, '진행 중' 은 운영자 메모 성격이라 수동값 자리에 남긴다
    //   (바닥으로만 읽히고 완료/대기로 바꾸면 지워지므로 카드를 가리지 않는다).
    return {
      [binding.dateField]: target === 'done' ? today : null,
      [legacyKey]: target === 'in_progress' ? 'in_progress' : null,
    }
  }
  const spec = binding.spec
  const filedRaw = viewData[spec.dateField]
  const hasFiled = typeof filedRaw === 'string' && filedRaw.length >= 10
  // 신청형은 카드 시그널이 세 상태를 모두 표현한다 — 수동값은 늘 지워 출처를 하나로 되돌린다.
  const out: Record<string, unknown> = { [legacyKey]: null }
  if (target === 'not_started') {
    out[spec.dateField] = null
    out[spec.skipFlag] = null
    out[spec.inProgressFlag] = null
    if (spec.demotedField) out[spec.demotedField] = null
    return out
  }
  if (target === 'in_progress') {
    const wasDone = viewData[spec.skipFlag] === true
    out[spec.skipFlag] = null
    // 완료였다면 '내린 시각'을 남긴다 — 첨부가 남아 done 으로 되돌아가도 의도가 데이터에 보인다.
    if (wasDone && spec.demotedField) out[spec.demotedField] = new Date().toISOString()
    if (!hasFiled) out[spec.dateField] = today
    out[spec.inProgressFlag] = true
    return out
  }
  // done — 첨부 없이 완료 처리(skip). 신청일이 비어 있으면 오늘로(skip + 신청일 정합).
  out[spec.skipFlag] = true
  out[spec.inProgressFlag] = null
  if (spec.demotedField) out[spec.demotedField] = null
  if (!hasFiled) out[spec.dateField] = today
  return out
}

/**
 * **옛 수동값 지우기** — 보호자·운영자가 그 카드에 명시적 액션을 했을 때 호출한다.
 * 카드가 진실을 말하기 시작했으므로 바닥(floor)으로 남아 있던 옛 값을 치운다.
 *
 * top-level(스코핑 전 잔재) + `by_dest` 엔트리 중 **그 슬롯이 이 카드에 연결된 목적지**만
 * 비운다 — 다른 나라 칸의 수동값을 건드리지 않는다.
 *
 * `data` 는 제자리에서 고치되 `by_dest` 는 새 객체로 교체한다 — 호출부가 `{ ...prev }` 얕은
 * 복사를 넘기는 게 보통이라, 중첩 객체를 직접 고치면 원본 prev 까지 오염된다.
 */
export function clearLegacyReportStatusForStep(
  data: Record<string, unknown>,
  stepId: string,
  slot: ReportSlot,
): void {
  const key = REPORT_LEGACY_STATUS_KEY[slot]
  delete data[key]
  const byDest = data.by_dest as Record<string, Record<string, unknown>> | undefined
  if (!byDest) return
  let changed = false
  const nextByDest: Record<string, Record<string, unknown>> = { ...byDest }
  for (const [dest, obj] of Object.entries(byDest)) {
    if (!obj || !(key in obj)) continue
    if (reportStepIdFor(dest, slot) !== stepId) continue
    nextByDest[dest] = { ...obj, [key]: null }
    changed = true
  }
  if (changed) data.by_dest = nextByDest
}

/**
 * 한 목적지의 신고 신호 전체 키 — '신고 내리기'(취소)가 비워야 할 목록.
 * 슬롯별 연결에서 파생하므로 나라가 늘어도 손댈 곳이 없다.
 */
export function reportSlotSignalKeys(destination: string | null | undefined): string[] {
  const out: string[] = []
  for (const slot of ['import', 'export'] as const) {
    const binding = resolveReportBinding(destination, slot)
    if (!binding) continue
    if (binding.model === 'dated') {
      out.push(binding.dateField)
      continue
    }
    const { spec } = binding
    out.push(spec.dateField, spec.skipFlag, spec.inProgressFlag)
    if (spec.demotedField) out.push(spec.demotedField)
  }
  return Array.from(new Set(out))
}

/** 신고 탭 연결을 선언한 모든 목적지 키 — lint·진단용. */
export function destinationsWithReportBinding(): Array<{
  key: string
  importStep?: string
  exportStep?: string
}> {
  const out: Array<{ key: string; importStep?: string; exportStep?: string }> = []
  for (const [key, override] of Object.entries(DESTINATION_OVERRIDES)) {
    const decl = override.report
    if (!decl?.importStep && !decl?.exportStep) continue
    out.push({ key, importStep: decl.importStep, exportStep: decl.exportStep })
  }
  return out
}
