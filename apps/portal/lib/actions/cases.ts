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

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

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
 * 본인 ↔ 케이스 link 확인. updateCaseAvatar / updateMicrochipFields 등에서 공통.
 * 권한 없으면 ok=false. 통과 시 admin 클라이언트 호출자가 직접 update.
 */
async function assertCaseAccess(caseId: string): Promise<Result<true>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: '인증 필요' }
  const supabase = await createClient()
  const { data: link, error: linkErr } = await supabase
    .from('case_customer_links')
    .select('case_id')
    .eq('case_id', caseId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (linkErr) return { ok: false, error: linkErr.message }
  if (!link) return { ok: false, error: '이 케이스에 접근 권한이 없습니다.' }
  return { ok: true, value: true }
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
 * 광견병 백신 1차 step 의 입력 필드를 patch — case.data.rabies_dates[0] 의 6개 키
 * (date / valid_until / product / manufacturer / lot / expiry) 를 갱신.
 *
 * 키 이름은 펫무브워크 RepeatableDateField 의 VacRecord 와 동일 — portal 입력이
 * admin 케이스 상세에 그대로 보이고, 양쪽 편집이 서로의 데이터를 보존한다.
 *
 *  - rabies_dates 배열·0번 항목이 없으면 생성. 있으면 other_hospital 등 관리 외
 *    키는 보존.
 *  - 빈 값은 키 제거 — admin 의 날짜 기반 약품 자동 추론(hint) 폴백을 살린다.
 *  - 접종일·제품 유효기간은 YYYY-MM-DD 검증 (면역 유효기간은 "N년" 문자열).
 *    data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateRabiesVaccine1Fields(
  caseId: string,
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
    const prevEntry =
      rabiesArr[0] && typeof rabiesArr[0] === 'object'
        ? { ...(rabiesArr[0] as Record<string, unknown>) }
        : {}

    // 6개 관리 키 머지 — 값이 있으면 set, 비면 delete.
    const entry: Record<string, unknown> = { ...prevEntry }
    for (const [key, raw] of Object.entries(fields)) {
      const v = typeof raw === 'string' ? raw.trim() : raw
      if (v == null || v === '') delete entry[key]
      else entry[key] = v
    }

    const nextData: Record<string, unknown> = { ...prev }
    if (Object.keys(entry).length === 0 && rabiesArr.length <= 1) {
      // 전부 비움 + 다른 항목 없음 — rabies_dates 자체 제거.
      delete nextData.rabies_dates
    } else {
      rabiesArr[0] = entry
      nextData.rabies_dates = rabiesArr
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
