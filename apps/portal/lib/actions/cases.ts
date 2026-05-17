'use server'

/**
 * Portal 보호자가 본인에게 링크된 케이스를 조회 / 일부 컬럼 수정하는 server actions.
 *
 * 조회는 `case_customer_links` 를 명시적 inner join 해서 본인 link 가 있는
 * 케이스만 가져온다. cases_select RLS 의 super_admin/org_member 우회와 무관하게
 * portal 사용자 관점("내 케이스") 만 보장.
 *
 * 수정은 cases_update RLS 가 org_member 만 통과시키므로 service role 로 우회 —
 * manual auth(case_customer_links 체크) 후 화이트리스트된 컬럼만 update.
 */

import { createAdminClient } from '@petmove/auth'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import type { CaseRow } from '@petmove/domain'
import { AVATAR_COLOR_IDS, AVATAR_EMOJIS, type AvatarColorId } from '@/lib/avatar'
import { assertCaseAccess, type Result } from './_shared'

/**
 * 현재 사용자에게 case_customer_links 로 매핑된 모든 케이스.
 * 정렬: 업데이트 최신순. 빈 결과는 빈 배열 — error 아님.
 */
export async function listMyCases(): Promise<Result<CaseRow[]>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('cases')
      .select('*, case_customer_links!inner(user_id)')
      .eq('case_customer_links.user_id', user.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []).map(({ case_customer_links: _l, ...rest }) => rest) as CaseRow[]
    return { ok: true, value: rows }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 단일 케이스 상세. 본인 link 가 있는 케이스만 반환 — 그 외는 null.
 */
export async function getMyCase(caseId: string): Promise<Result<CaseRow | null>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('cases')
      .select('*, case_customer_links!inner(user_id)')
      .eq('id', caseId)
      .eq('case_customer_links.user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: true, value: null }
    const { case_customer_links: _l, ...rest } = data as Record<string, unknown>
    return { ok: true, value: rest as unknown as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 보호자가 자기 케이스의 아바타(이모지·색)를 갱신.
 *
 * cases_update RLS 는 org_member 만 허용 → service role 로 우회. 그 대신
 * (1) auth 확인, (2) case_customer_links 로 본인 ↔ 케이스 매핑 검증,
 * (3) 화이트리스트(AVATAR_EMOJIS / AVATAR_COLOR_IDS) 검증, (4) avatar_*
 * 컬럼만 update — 4중 차단으로 다른 컬럼/케이스에 손댈 길 없음.
 *
 * emoji / color 를 null 로 보내면 "해제" (자동 fallback 로 복귀).
 */
export async function updateCaseAvatar(
  caseId: string,
  emoji: string | null,
  color: AvatarColorId | null,
): Promise<Result<CaseRow>> {
  try {
    if (emoji !== null && !AVATAR_EMOJIS.includes(emoji)) {
      return { ok: false, error: '허용되지 않은 이모지' }
    }
    if (color !== null && !AVATAR_COLOR_IDS.includes(color)) {
      return { ok: false, error: '허용되지 않은 색상' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cases')
      .update({ avatar_emoji: emoji, avatar_color: color })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: data as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 마이크로칩 step 의 두 필드를 patch.
 *  - microchip: cases.microchip 컬럼 (15자리 raw digits only) — 빈문자열/null 이면 해제
 *  - microchip_implant_date: cases.data.microchip_implant_date (YYYY-MM-DD) — 빈/null 이면 키 제거
 *
 * data 의 다른 키는 fetch-merge 로 보존. 두 필드 화이트리스트 외에는 손대지 않음.
 */
export async function updateMicrochipFields(
  caseId: string,
  microchip: string | null,
  microchipImplantDate: string | null,
): Promise<Result<CaseRow>> {
  try {
    // microchip 정규화: 숫자만, 15자리 필수 (빈/null 은 해제).
    let chip: string | null = null
    if (microchip != null && microchip !== '') {
      const digits = microchip.replace(/\D/g, '')
      if (digits.length !== 15) {
        return { ok: false, error: '마이크로칩 번호는 15자리여야 합니다.' }
      }
      chip = digits
    }

    // implant_date 정규화: YYYY-MM-DD 만 허용 (빈/null 은 해제).
    let dt: string | null = null
    if (microchipImplantDate != null && microchipImplantDate !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(microchipImplantDate)) {
        return { ok: false, error: '시술일 형식은 YYYY-MM-DD 여야 합니다.' }
      }
      dt = microchipImplantDate
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    // data 의 다른 키 보존을 위해 fetch → merge → update.
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }
    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const nextData = { ...prev }
    if (dt === null) delete nextData.microchip_implant_date
    else nextData.microchip_implant_date = dt

    const { data: updated, error } = await admin
      .from('cases')
      .update({ microchip: chip, data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 광견병 백신 step(1·2차)의 입력 필드를 patch — case.data.rabies_dates[index] 의 6개
 * 키(date / valid_until / product / manufacturer / lot / expiry)를 갱신.
 * index 0 = 1차, 1 = 2차.
 *
 * 키 이름은 펫무브워크 RepeatableDateField 의 VacRecord 와 동일 — portal 입력이
 * admin 케이스 상세에 그대로 보이고, 양쪽 편집이 서로의 데이터를 보존한다.
 *
 *  - 해당 index 항목이 없으면 생성 (앞 index 는 빈 객체로 패딩). 있으면
 *    other_hospital 등 관리 외 키는 보존. 끝의 빈 항목은 정리.
 *  - 빈 값은 키 제거 — admin 의 날짜 기반 약품 자동 추론(hint) 폴백을 살린다.
 *  - 접종일·제품 유효기간은 YYYY-MM-DD 검증 (면역 유효기간은 "N년" 문자열).
 *    data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateRabiesEntryFields(
  caseId: string,
  index: number,
  fields: {
    date: string | null
    valid_until: string | null
    product: string | null
    manufacturer: string | null
    lot: string | null
    expiry: string | null
  },
): Promise<Result<CaseRow>> {
  try {
    if (index !== 0 && index !== 1) {
      return { ok: false, error: '잘못된 요청입니다.' }
    }
    // 날짜 키 검증 — YYYY-MM-DD 또는 빈 값. (valid_until 은 "N년" 문자열이라 제외.)
    for (const key of ['date', 'expiry'] as const) {
      const v = fields[key]
      if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const rabiesArr = Array.isArray(prev.rabies_dates)
      ? [...(prev.rabies_dates as unknown[])]
      : []
    const slot = rabiesArr[index]
    const prevEntry =
      slot && typeof slot === 'object' ? { ...(slot as Record<string, unknown>) } : {}

    // 6개 관리 키 머지 — 값이 있으면 set, 비면 delete.
    const entry: Record<string, unknown> = { ...prevEntry }
    for (const [key, raw] of Object.entries(fields)) {
      const v = typeof raw === 'string' ? raw.trim() : raw
      if (v == null || v === '') delete entry[key]
      else entry[key] = v
    }

    // 앞 index 를 빈 객체로 패딩 (sparse 배열 방지) 후 해당 index 설정.
    while (rabiesArr.length < index) rabiesArr.push({})
    rabiesArr[index] = entry
    // 끝의 완전히 빈 항목 제거.
    while (rabiesArr.length > 0 && isEmptyObject(rabiesArr[rabiesArr.length - 1])) {
      rabiesArr.pop()
    }

    const nextData: Record<string, unknown> = { ...prev }
    if (rabiesArr.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = rabiesArr

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

function isEmptyObject(v: unknown): boolean {
  return !!v && typeof v === 'object' && Object.keys(v as object).length === 0
}

/**
 * 광견병 항체가 검사 step 의 입력 필드를 patch — case.data.rabies_titer_records[0] 의
 * date / lab(검사기관) / value(검사 수치)를 갱신.
 *
 * 0번 항목이 없으면 생성, 있으면 received_date 등 다른 키는 보존.
 * 빈 값은 키 제거 (남는 키 없으면 rabies_titer_records 자체 제거).
 * value 는 IU/mL 단위 표기를 제거해 저장 (펫무브워크 RabiesTiterField 와 동일).
 * data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateTiterFields(
  caseId: string,
  fields: { date: string | null; lab: string | null; value: string | null },
): Promise<Result<CaseRow>> {
  try {
    if (fields.date != null && fields.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
      return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const arr = Array.isArray(prev.rabies_titer_records)
      ? [...(prev.rabies_titer_records as unknown[])]
      : []
    const slot = arr[0]
    const entry: Record<string, unknown> =
      slot && typeof slot === 'object' ? { ...(slot as Record<string, unknown>) } : {}

    const d = typeof fields.date === 'string' ? fields.date.trim() : fields.date
    if (d) entry.date = d
    else delete entry.date

    const labVal = typeof fields.lab === 'string' ? fields.lab.trim() : ''
    if (labVal) entry.lab = labVal
    else delete entry.lab

    const v = typeof fields.value === 'string' ? stripTiterUnit(fields.value) : ''
    if (v) entry.value = v
    else delete entry.value

    const nextData: Record<string, unknown> = { ...prev }
    if (isEmptyObject(entry) && arr.length <= 1) {
      delete nextData.rabies_titer_records
    } else {
      arr[0] = entry
      nextData.rabies_titer_records = arr
    }

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 검사 수치에서 IU/mL 단위 표기 제거 — 저장 값엔 단위를 남기지 않는다 (펫무브워크와 동일). */
function stripTiterUnit(value: string): string {
  return value.replace(/\s*IU\s*\/\s*m[lL]\s*/gi, '').trim()
}

/** 항공권 구매 step 이 다루는 case.data 평탄 키 — 출국 4 + 귀국 4. */
const FLIGHT_DATA_KEYS = [
  'entry_date',
  'entry_departure_airport',
  'entry_airport',
  'entry_flight_number',
  'entry_transport',
  'return_date',
  'return_departure_airport',
  'return_arrival_airport',
  'return_flight_number',
  'return_transport',
] as const

/**
 * 항공권 구매 step 의 입력 필드를 patch — case.data 의 entry_* / return_* 평탄 키
 * (정보 탭 항공권 섹션·펫무브워크 추가정보와 동일 키)를 갱신.
 *
 * 빈 값은 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 * 편도 케이스도 귀국 키를 그대로 보내며(미편집이라 값 불변), 빈 값이면 제거된다.
 */
export async function updateFlightFields(
  caseId: string,
  fields: Record<(typeof FLIGHT_DATA_KEYS)[number], string | null>,
): Promise<Result<CaseRow>> {
  try {
    for (const key of ['entry_date', 'return_date'] as const) {
      const v = fields[key]
      if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const nextData: Record<string, unknown> = { ...prev }
    for (const key of FLIGHT_DATA_KEYS) {
      const v = typeof fields[key] === 'string' ? (fields[key] as string).trim() : ''
      if (v) nextData[key] = v
      else delete nextData[key]
    }

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 정보 탭(보호자·동물·여행·항공권)의 편집 가능한 모든 필드를 한 번에 patch.
 *
 * InfoView 는 편집 필드 전체의 desired-state 를 보내고, 이 액션이 화이트리스트된
 * 컬럼·data 키만 갱신한다. 빈 문자열은 data 키 제거 / nullable 컬럼 null.
 *
 * 저장 포맷은 펫무브워크(admin)와 동일 — 양쪽 편집이 round-trip:
 *  - species/sex: 코드 (dog/cat/other, male/female/...) — 단 legacy/커스텀 값도 그대로 보존
 *  - phone: 숫자만, microchip: 15자리 숫자, weight: number
 *  - trip_type: data.trip_type[목적지토큰] = 'round' | 'one_way' (기존 토큰 보존 머지)
 * data 의 화이트리스트 외 키는 fetch-merge 로 보존.
 */
export interface CaseInfoInput {
  customer_name: string
  customer_name_en: string
  pet_name: string
  pet_name_en: string
  microchip: string
  destination: string
  departure_date: string
  phone: string
  email: string
  address_kr: string
  address_zipcode: string
  address_en: string
  birth_date: string
  species: string
  breed: string
  color: string
  sex: string
  weight: string
  trip_type: 'round' | 'one_way'
  return_date: string
  entry_departure_airport: string
  entry_airport: string
  entry_flight_number: string
  entry_transport: string
  return_departure_airport: string
  return_arrival_airport: string
  return_flight_number: string
  return_transport: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 빈 문자열이면 키 제거, 아니면 trim 해서 set. */
const INFO_DATA_KEYS = [
  'phone',
  'email',
  'address_kr',
  'address_zipcode',
  'address_en',
  'birth_date',
  'species',
  'breed',
  'color',
  'sex',
  'return_date',
  'entry_departure_airport',
  'entry_airport',
  'entry_flight_number',
  'entry_transport',
  'return_departure_airport',
  'return_arrival_airport',
  'return_flight_number',
  'return_transport',
] as const

export async function updateCaseInfoFields(
  caseId: string,
  input: CaseInfoInput,
): Promise<Result<CaseRow>> {
  try {
    // ── 검증 ──
    for (const v of [input.departure_date, input.birth_date, input.return_date]) {
      if (v && !ISO_DATE_RE.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }
    let chip: string | null = null
    if (input.microchip) {
      const digits = input.microchip.replace(/\D/g, '')
      if (digits.length !== 15) {
        return { ok: false, error: '마이크로칩 번호는 15자리여야 합니다.' }
      }
      chip = digits
    }
    let weightNum: number | null = null
    if (input.weight.trim()) {
      const n = Number(input.weight)
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: '몸무게 형식이 올바르지 않습니다.' }
      }
      weightNum = n
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const nextData: Record<string, unknown> = { ...prev }

    for (const key of INFO_DATA_KEYS) {
      const v = (input[key] ?? '').trim()
      if (v) nextData[key] = v
      else delete nextData[key]
    }

    if (weightNum === null) delete nextData.weight
    else nextData.weight = weightNum

    // trip_type — 활성 목적지 토큰 키로 머지 (다른 토큰의 기존 값 보존).
    const destToken = input.destination.split(',')[0]?.trim() ?? ''
    if (destToken) {
      const prevTrip =
        prev.trip_type && typeof prev.trip_type === 'object'
          ? { ...(prev.trip_type as Record<string, unknown>) }
          : {}
      prevTrip[destToken] = input.trip_type
      nextData.trip_type = prevTrip
    }

    const { data: updated, error } = await admin
      .from('cases')
      .update({
        customer_name: input.customer_name.trim(),
        customer_name_en: input.customer_name_en.trim() || null,
        pet_name: input.pet_name.trim() || null,
        pet_name_en: input.pet_name_en.trim() || null,
        microchip: chip,
        destination: input.destination.trim() || null,
        departure_date: input.departure_date || null,
        data: nextData,
      })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
