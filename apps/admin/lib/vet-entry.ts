/**
 * 수의사 명단 — **클라이언트에서도 안전한** 순수 로직만.
 *
 * vet-info.ts 는 Supabase 서버 클라이언트를 (동적) import 하므로 설정 화면 같은
 * client component 가 런타임 import 하면 next/headers 가 클라이언트 번들로 딸려와
 * 빌드가 깨진다. 그래서 명단 계산은 여기로 분리하고, vet-info 는 이 모듈을 쓴다.
 * (VetInfo 는 type-only import 라 런타임 의존성이 생기지 않는다.)
 */

import type { VetInfo } from './vet-info'

/**
 * 수의사 한 명. 조직에 여럿일 수 있고, 증명서에는 그중 선택된 한 명만 나간다.
 *
 * 평면 필드(name_ko / name_en / license_no …)는 **선택된 수의사의 사본**이다.
 * PDF 매핑(vet:name_en 등)과 펫무브가 평면 키를 읽으므로, 로드·저장 때마다
 * withActiveVetApplied() 가 선택된 수의사 값을 평면 필드로 밀어 넣어 sync 를 유지한다.
 */
export interface VetEntry {
  id: string
  name_ko: string
  name_first_en: string
  name_last_en: string
  /** 합성 영문명 — "First Last". 저장 시 자동 갱신. */
  name_en: string
  mobile_phone: string
  license_no: string
}

/** VetEntry 가 소유하는 키 = 평면 필드로 미러링되는 키. */
export const VET_ENTRY_KEYS = [
  'name_ko',
  'name_first_en',
  'name_last_en',
  'name_en',
  'mobile_phone',
  'license_no',
] as const

export type VetEntryKey = (typeof VET_ENTRY_KEYS)[number]

/** 빈 수의사 한 명. id 는 호출부에서 채운다. */
export function emptyVetEntry(id: string): VetEntry {
  return { id, name_ko: '', name_first_en: '', name_last_en: '', name_en: '', mobile_phone: '', license_no: '' }
}

/**
 * 수의사 명단. vets 키가 아예 없는(명단 도입 이전) 데이터는 평면 필드 한 벌을
 * 첫 수의사로 승격해 돌려준다. 빈 배열은 그대로 빈 배열.
 */
export function listVets(info: Partial<VetInfo> | null | undefined): VetEntry[] {
  if (!info) return []
  if (Array.isArray(info.vets)) return info.vets
  const legacy: VetEntry = {
    id: 'vet_1',
    name_ko: info.name_ko ?? '',
    name_first_en: info.name_first_en ?? '',
    name_last_en: info.name_last_en ?? '',
    name_en: info.name_en ?? '',
    mobile_phone: info.mobile_phone ?? '',
    license_no: info.license_no ?? '',
  }
  return VET_ENTRY_KEYS.some((k) => (legacy[k] ?? '').trim()) ? [legacy] : []
}

/** 선택된 수의사 — active_vet_id 우선, 못 찾으면 첫 번째. 명단이 비면 null. */
export function activeVet(info: Partial<VetInfo> | null | undefined): VetEntry | null {
  const vets = listVets(info)
  if (vets.length === 0) return null
  const picked = info?.active_vet_id ? vets.find((v) => v.id === info.active_vet_id) : undefined
  return picked ?? vets[0]
}

/**
 * 선택된 수의사를 평면 필드에 반영한 사본. 로드·저장 양쪽에서 통과시켜
 * "화면에서 고른 수의사 = 증명서에 나가는 수의사" 를 보장한다.
 * 명단이 비면 평면 수의사 필드도 함께 비운다(지운 게 출력에서 사라지도록).
 */
export function withActiveVetApplied(info: VetInfo): VetInfo {
  const vets = listVets(info)
  const active = activeVet(info)
  return {
    ...info,
    vets,
    active_vet_id: active?.id ?? '',
    name_ko: active?.name_ko ?? '',
    name_first_en: active?.name_first_en ?? '',
    name_last_en: active?.name_last_en ?? '',
    name_en: active?.name_en ?? '',
    mobile_phone: active?.mobile_phone ?? '',
    license_no: active?.license_no ?? '',
  }
}
