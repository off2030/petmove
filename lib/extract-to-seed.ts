/**
 * Convert extract-all.ts 결과 → createCaseWithData의 CaseSeed.
 *
 * - regular column: cases 테이블의 실 컬럼에 해당하는 것
 * - data: 그 외 모든 필드는 data jsonb에 저장 (case-detail의 필드들과 키 매칭)
 */

import type { ExtractAllResult } from '@/lib/actions/extract-all'
import type { CaseSeed } from '@/lib/actions/create-case-with-data'

/** 항공편 정보가 하나라도 있는지 */
function flightHasInfo(f: ExtractAllResult['inbound']): boolean {
  return !!(f.date || f.departure_airport || f.arrival_airport || f.flight_number || f.transport)
}

/**
 * 마이크로칩 정규화: 정확히 15자리면 공백 포맷(`000 000 000 000 000`)으로,
 * 아니면 null. 부분추출된 잘못된 번호가 DB에 들어가 유령 케이스를 만드는 걸 방지.
 */
function normalizeMicrochip(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length !== 15) return null
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ')
}

/**
 * 펫 이름에 따라붙은 ID/번호 제거.
 * "Muffy 220677" → "Muffy", "Taz (270050)" → "Taz"
 * 끝쪽 4자 이상 숫자, 괄호 안 숫자만 제거 — 실제 이름의 일부인 숫자(예: "D2")는 유지.
 */
function cleanPetName(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = String(raw).trim()
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, '')   // "(270050)" 제거
  s = s.replace(/\s+\d{4,}\s*$/, '')            // 끝쪽 4자리 이상 숫자 제거
  s = s.trim()
  return s || null
}

export function extractResultToSeed(r: ExtractAllResult): CaseSeed {
  const column: Record<string, unknown> = {}
  const data: Record<string, unknown> = {}

  // ── regular columns ──
  if (r.customer_name) column.customer_name = r.customer_name
  // 모델이 간혹 customer_name_en에 last를 중복 추가(예: "Hoa Mai Nguyen Nguyen")하는
  // 버그가 있어 first + last로 직접 재구성. 둘 중 하나라도 없으면 모델 값 그대로 사용.
  const firstEn = r.customer_first_name_en?.trim()
  const lastEn = r.customer_last_name_en?.trim()
  if (firstEn && lastEn) column.customer_name_en = `${firstEn} ${lastEn}`
  else if (r.customer_name_en) column.customer_name_en = r.customer_name_en
  const petNameClean = cleanPetName(r.pet_name)
  if (petNameClean) column.pet_name = petNameClean
  const petNameEnClean = cleanPetName(r.pet_name_en)
  if (petNameEnClean) column.pet_name_en = petNameEnClean
  const chipNorm = normalizeMicrochip(r.microchip)
  if (chipNorm) column.microchip = chipNorm
  if (r.destination) column.destination = r.destination
  if (r.inbound?.date) column.departure_date = r.inbound.date

  // ── pet identity (data) ──
  if (r.species) data.species = r.species
  if (r.breed) data.breed = r.breed
  if (r.breed_en) data.breed_en = r.breed_en
  if (r.color) data.color = r.color
  if (r.color_en) data.color_en = r.color_en
  if (r.sex) data.sex = r.sex
  if (r.birth_date) data.birth_date = r.birth_date
  if (r.weight) data.weight = r.weight
  if (r.microchip_implant_date) data.microchip_implant_date = r.microchip_implant_date

  // ── customer (data) ──
  if (r.customer_first_name_en) data.customer_first_name_en = r.customer_first_name_en
  if (r.customer_last_name_en) data.customer_last_name_en = r.customer_last_name_en
  if (r.phone) data.phone = r.phone
  if (r.address_kr) data.address_kr = r.address_kr
  if (r.address_en) data.address_en = r.address_en
  if (r.email) data.email = r.email

  // ── overseas ──
  if (r.address_overseas) data.address_overseas = r.address_overseas

  // ── flights (data) ── Japan/Philippines extra-field가 쓰는 중첩 구조
  if (flightHasInfo(r.inbound)) data.inbound = r.inbound
  if (flightHasInfo(r.outbound)) data.outbound = r.outbound

  // ── passport (data) ──
  if (r.passport_number) data.passport_number = r.passport_number
  if (r.passport_issue_date) data.passport_issue_date = r.passport_issue_date
  if (r.passport_expiry_date) data.passport_expiry_date = r.passport_expiry_date
  if (r.passport_nationality) data.passport_nationality = r.passport_nationality

  // undefined는 JSON 직렬화에서 제거됨 — 혹시 남아있으면 정리
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]

  return { column, data }
}
