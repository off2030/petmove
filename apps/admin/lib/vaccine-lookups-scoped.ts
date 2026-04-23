/**
 * Request-scoped vaccine lookups.
 *
 * Node.js `AsyncLocalStorage` 로 한 요청 안에서만 org-scoped lookups 를 공유.
 * `pdf-fill.ts` 처럼 깊숙한 helper 에서 호출되는 lookup 을 parameter threading 없이도
 * 현재 요청의 org data 로 바인딩 가능. ALS 에 값이 없으면 legacy JSON seed fallback.
 *
 * 사용:
 *   await runWithOrgLookups(await getOrgVaccineLookups(), async () => {
 *     // 이 async stack 에서 호출되는 lookupRabies/etc 는 org data 를 사용
 *   })
 */
import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  createVaccineLookups,
  type VaccineLookups,
  // Legacy JSON-backed defaults. ALS context 가 없을 때 fallback.
  lookupRabies as defaultLookupRabies,
  lookupComprehensive as defaultLookupComprehensive,
  lookupCiv as defaultLookupCiv,
  lookupKennelCough as defaultLookupKennelCough,
  lookupExternalParasite as defaultLookupExternalParasite,
  lookupInternalParasite as defaultLookupInternalParasite,
  lookupParasiteCombo as defaultLookupParasiteCombo,
  lookupHeartworm as defaultLookupHeartworm,
  lookupParasiteById as defaultLookupParasiteById,
  getAllProducts as defaultGetAllProducts,
  getLatestProducts as defaultGetLatestProducts,
  countExpiringProducts as defaultCountExpiringProducts,
} from '@petmove/domain'

const DEFAULT_LOOKUPS: VaccineLookups = {
  lookupRabies: defaultLookupRabies,
  lookupComprehensive: defaultLookupComprehensive,
  lookupCiv: defaultLookupCiv,
  lookupKennelCough: defaultLookupKennelCough,
  lookupExternalParasite: defaultLookupExternalParasite,
  lookupInternalParasite: defaultLookupInternalParasite,
  lookupParasiteCombo: defaultLookupParasiteCombo,
  lookupHeartworm: defaultLookupHeartworm,
  lookupParasiteById: defaultLookupParasiteById,
  getAllProducts: defaultGetAllProducts,
  getLatestProducts: defaultGetLatestProducts,
  countExpiringProducts: defaultCountExpiringProducts,
}

const store = new AsyncLocalStorage<VaccineLookups>()

function current(): VaccineLookups {
  return store.getStore() ?? DEFAULT_LOOKUPS
}

/** org-scoped lookups 를 ALS 에 바인딩한 채로 fn 실행. */
export function runWithOrgLookups<T>(lookups: VaccineLookups, fn: () => Promise<T>): Promise<T> {
  return store.run(lookups, fn)
}

/** 이미 normalized 된 products data 로 바인딩 (fn 재호출 없이 lookup factory 래핑). */
export function runWithOrgData<T>(
  data: Parameters<typeof createVaccineLookups>[0],
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(createVaccineLookups(data), fn)
}

// Re-exports with same signatures as @petmove/domain defaults, but request-scoped.
export const lookupRabies: VaccineLookups['lookupRabies'] = (date) => current().lookupRabies(date)
export const lookupComprehensive: VaccineLookups['lookupComprehensive'] = (species, date) => current().lookupComprehensive(species, date)
export const lookupCiv: VaccineLookups['lookupCiv'] = (date) => current().lookupCiv(date)
export const lookupKennelCough: VaccineLookups['lookupKennelCough'] = () => current().lookupKennelCough()
export const lookupExternalParasite: VaccineLookups['lookupExternalParasite'] = (species, date, weight) => current().lookupExternalParasite(species, date, weight)
export const lookupInternalParasite: VaccineLookups['lookupInternalParasite'] = (species, date, weight) => current().lookupInternalParasite(species, date, weight)
export const lookupParasiteCombo: VaccineLookups['lookupParasiteCombo'] = (species, weight) => current().lookupParasiteCombo(species, weight)
export const lookupHeartworm: VaccineLookups['lookupHeartworm'] = (species, weight) => current().lookupHeartworm(species, weight)
export const lookupParasiteById: VaccineLookups['lookupParasiteById'] = (id, ctx) => current().lookupParasiteById(id, ctx)
