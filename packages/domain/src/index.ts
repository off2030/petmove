export * from './types'
export * from './dates'
export * from './destination-config'
export * from './destination-names'
export * from './destination-overrides-types'
export * from './destination-scoped-fields'
export * from './inspection-config-defaults'
export * from './titer-labs'
export * from './cert-config-defaults'
export * from './import-report-defaults'
export * from './external-links-defaults'
export * from './vaccine-lookup'
export * from './procedure-checks/types'
export * from './procedure-checks/registry'
export * from './procedure-checks/rabies-selection'
export * from './fields'
export * from './share-links-types'
export * from './share-file-requests'
export * from './share-field-layout'
export * from './destination-overrides'
export * from './journey-steps'
export * from './required-docs'
export * from './docs-completion'
export * from './auto-fill-engine'

// 유효기간·날짜 헬퍼 — procedure-checks/utils 는 `export *` 대상이 아니라(내부 전용 다수),
// 외부에서 재활용이 필요한 순수 함수만 좁게 노출(예: portal 로컬 알림의 유효기간 만료 계산).
export {
  readRabiesEntries,
  readGeneralVaccineEntries,
  readKennelCoughEntries,
  readCivEntries,
  readTiterEntries,
  latestExtraTiterEntry,
  isExtraTiterResultConfirmed,
  resolveValidUntil,
  addYears,
  // 일본 항체검사 날짜 hover 툴팁(admin rabies-titer-field)의 입국 가능일(+180일) 계산.
  addDays,
  formatKoreanDate,
  // 필리핀 내부 기생충 치료 창 검사(step-detail-view 의 입력 차단)가 SPSIC 신청일을 읽는다.
  readScopedImportPermitFiled,
} from './procedure-checks/utils'
