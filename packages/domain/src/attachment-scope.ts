import { parseDestinations } from './destination-config'
import { isRepeatDestination } from './destination-names'

/**
 * destination 태그가 있어도 **전 목적지 공유**로 인정하는 첨부 step — 동물 한 마리의 사실
 * (GLOBAL_CASE_DATA_KEYS 의 *_dates/records 대응 step)이라 어느 목적지 여정에서 올렸든
 * 같은 서류다(예: 광견병 항체 결과지는 검사기관이 동물에게 발급 — 목적지 무관).
 *
 * 선정 기준: allowAttachments step 중 저장 키가 destination-scoped-fields.ts 의
 * GLOBAL_CASE_DATA_KEYS(동물 단위 사실)인 것 전부. 반대로 vet_visit_date·import_permit_* 등
 * scoped 키를 쓰는 step(certificate-issue·import-permit·kr-import-quarantine·*-export-quarantine
 * ·departure·infectious-disease-test 등)과 manual 서류(form25 등 doc.id 태깅)는 목적지별이라 제외.
 */
export const SHARED_ATTACH_STEPS: ReadonlySet<string> = new Set([
  'rabies-vaccine-1', //     rabies_dates (GLOBAL)
  'rabies-vaccine-2', //     rabies_dates (GLOBAL)
  'rabies-vaccine-extra', // rabies_dates (GLOBAL)
  'rabies-titer', //         rabies_titer_records (GLOBAL) — 16개 spec 이 previewStepId 로 공유
  'rabies-titer-extra', //   rabies_titer_extra (GLOBAL)
  'general-vaccine', //      general_vaccine_dates (GLOBAL)
  'kennel-cough-vaccine', // kennel_cough_dates (GLOBAL)
  'heartworm-test', //       heartworm_dates (GLOBAL)
  'lungworm-treatment', //   lungworm_dates (GLOBAL)
  'civ-vaccine', //          civ_dates (GLOBAL)
  'external-parasite', //    external_parasite_dates (GLOBAL)
  'internal-parasite', //    internal_parasite_dates (GLOBAL)
  // 촌충 치료(EU 5국) — 주 기록 키가 internal-parasite 와 같은 internal_parasite_dates
  //   (GLOBAL) 라 첨부(투약 증명)도 동물 단위 공유가 정합(2026-08-01 후속 감사 반영.
  //   deworming_time 은 scoped 지만 타이밍 보조 필드일 뿐 첨부의 귀속과 무관).
  'echinococcus-treatment',
])

/**
 * 첨부 1건이 현재 케이스 뷰의 목적지 스코프에 속하는지.
 *
 * - doc.destination 미기재 = 기존 여행만 인정. 같은 국가의 새 회차에는 재사용하지 않는다.
 * - SHARED_ATTACH_STEPS(동물 단위 사실 step) → 태그와 무관하게 인정.
 * - 그 외 → doc.destination 이 현재 뷰 destination 토큰에 포함될 때만 인정. caseDestination 은
 *   flatten 뷰(단일 토큰)와 비-flatten(콤마 목록) 양쪽이 올 수 있어 parseDestinations 로 비교 —
 *   콤마 목록이면 케이스의 어느 목적지든 매칭(태깅 도입 전과 동일 = 회귀 없음).
 *
 * 판정(hasAttachmentForStep)과 portal 첨부 미리보기가 같은 규칙을 쓰도록 export.
 */
export function attachmentInDestinationScope(
  doc: { destination?: unknown },
  stepId: string,
  caseDestination: string | null | undefined,
): boolean {
  const tag = typeof doc.destination === 'string' && doc.destination ? doc.destination : null
  if (SHARED_ATTACH_STEPS.has(stepId)) return true
  // 태그 없는 옛 허가서는 기존 여행만 인정한다. 새 회차의 신고 완료 근거가 아니다.
  if (!tag) return !caseDestination || !parseDestinations(caseDestination).every(isRepeatDestination)
  if (!caseDestination) return true
  return parseDestinations(caseDestination).includes(tag)
}
