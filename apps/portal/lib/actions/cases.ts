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

import { cookies } from 'next/headers'
import { createAdminClient } from '@petmove/auth'
import { verifyPreviewToken } from '@petmove/auth/preview-token'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import { emptyVaccineProductsData, type CaseRow, type VaccineProductsData } from '@petmove/domain'
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
    // 포털에서 처음 생성되는 entry 인지 — 기존 항목 편집이면 admin 이 정한 상태(특히
    // other_hospital) 를 보존해야 한다.
    const isFreshEntry = Object.keys(prevEntry).length === 0

    // 6개 관리 키 머지 — 값이 있으면 set, 비면 delete.
    const entry: Record<string, unknown> = { ...prevEntry }
    for (const [key, raw] of Object.entries(fields)) {
      const v = typeof raw === 'string' ? raw.trim() : raw
      if (v == null || v === '') delete entry[key]
      else entry[key] = v
    }

    // 포털에서 새로 만들어진 항목은 '타병원 접종' 기본 — 보호자는 어느 병원 약품인지
    // 모르는 상태고, admin 이 본병원이면 펫무브워크에서 명시적으로 체크 해제하는 흐름.
    // (apps/portal/lib/actions/apply-case.ts:142 의 신청폼 경로와 동일 정책.) 이 flag 가
    // 없으면 portal/admin 의 약품 4필드가 '병원 지정' 카탈로그 hint 로 표시돼서, 보호자
    // 본인은 본 적 없는 약품명·제조사가 본인이 입력한 양 보이는 사고가 난다.
    if (isFreshEntry && Object.keys(entry).length > 0) {
      entry.other_hospital = true
    }

    // 앞 index 를 빈 객체로 패딩 (sparse 배열 방지) 후 해당 index 설정.
    while (rabiesArr.length < index) rabiesArr.push({})
    rabiesArr[index] = entry
    // 끝의 phantom (date 없는 entry — 빈 객체 또는 {other_hospital: true} 만 남은
    // 잔여물) 제거. hasValidDate 기반이라 기존 phantom 도 함께 정리됨.
    while (rabiesArr.length > 0 && !hasValidDate(rabiesArr[rabiesArr.length - 1])) {
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

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식 어긋나면 원문. 액션 에러 메시지 표시용. */
function formatKr(iso: string): string {
  const parts = iso.slice(0, 10).split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/**
 * 광견병/항체검사 entry 가 "phantom" 인지 — date 가 없으면 의미 없는 잔여물로 간주.
 *
 * 배경: 새 카드 생성 시 `other_hospital: true` 가 자동 부여되거나(rabies), 사용자가
 * 기존 entry 의 date 만 비워 저장한 경우 `{other_hospital: true}` / `{lab: ...}` 처럼
 * date 없는 객체가 남는다. `isEmptyObject`(키 0개) 검사는 이를 못 잡아 array 에
 * 영원히 phantom 으로 박힌다. readRabiesEntries 의 date.length>=10 필터는 이걸
 * 제거하지만, length 계산이 어긋나 chain 체크가 잘못 fire 한다(예: 1·2·phantom·4차
 * → 필터 후 3개로 인식, 2차→4차 chain 검증).
 *
 * 정책: date 없는 entry 는 의미 없음 → save 시 drop.
 */
function hasValidDate(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const date = (v as { date?: unknown }).date
  return typeof date === 'string' && date.length >= 10
}

/**
 * 광견병 추가 백신(3차 이상)의 입력 기록을 한 번에 patch — case.data.rabies_dates 의
 * index 2 이상을 전체 교체. 1차(0) / 2차(1) 는 updateRabiesEntryFields 가 관리하므로
 * 여기서는 건드리지 않는다.
 *
 * entries 는 사용자가 화면에서 본 순서대로 들어오고, 각 entry 의 같은 인덱스 위치에
 * 기존 record 가 있으면 그 record 의 other_hospital · 그 외 비관리 키를 보존한다.
 * 새로 생성된 entry (해당 인덱스에 기존 record 없음) 는 portal 정책상 other_hospital=true
 * 로 강제 — 보호자는 어느 병원 약품인지 모르는 상태고, admin 이 본병원이면 펫무브워크에서
 * 명시적으로 체크 해제하는 흐름. (updateRabiesEntryFields 와 동일.)
 *
 * 빈 entry(6개 관리 키 모두 비어있고 + 기존 비관리 키도 없음) 는 제외 — 사용자가 카드만
 * 추가하고 입력 안 한 경우 자동 정리. 끝의 빈 항목도 추가로 trim.
 */
export async function updateRabiesExtraEntries(
  caseId: string,
  entries: Array<{
    date: string | null
    valid_until: string | null
    product: string | null
    manufacturer: string | null
    lot: string | null
    expiry: string | null
  }>,
): Promise<Result<CaseRow>> {
  try {
    for (const e of entries) {
      for (const key of ['date', 'expiry'] as const) {
        const v = e[key]
        if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
        }
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
    const preserved = rabiesArr.slice(0, 2)
    const prevExtras = rabiesArr.slice(2)

    const newExtras: Record<string, unknown>[] = []
    for (let i = 0; i < entries.length; i++) {
      const fields = entries[i]
      const prevSlot = prevExtras[i]
      const prevEntry =
        prevSlot && typeof prevSlot === 'object'
          ? { ...(prevSlot as Record<string, unknown>) }
          : {}
      const isFreshEntry = Object.keys(prevEntry).length === 0

      const entry: Record<string, unknown> = { ...prevEntry }
      for (const [key, raw] of Object.entries(fields)) {
        const v = typeof raw === 'string' ? raw.trim() : raw
        if (v == null || v === '') delete entry[key]
        else entry[key] = v
      }
      if (isFreshEntry && Object.keys(entry).length > 0) {
        entry.other_hospital = true
      }
      // date 가 없으면 의미 없는 잔여물 — drop (other_hospital 만 남는 phantom 방지).
      // 기존 DB phantom 도 prevSlot 으로 들어왔다가 여기서 자동 정리됨.
      if (!hasValidDate(entry)) continue
      newExtras.push(entry)
    }

    const rabiesNext: unknown[] = [...preserved, ...newExtras]
    while (rabiesNext.length > 0 && !hasValidDate(rabiesNext[rabiesNext.length - 1])) {
      rabiesNext.pop()
    }

    const nextData: Record<string, unknown> = { ...prev }
    if (rabiesNext.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = rabiesNext

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
    if (!hasValidDate(entry) && arr.length <= 1) {
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

/**
 * 광견병 항체가 검사(2회차+)의 입력 기록을 한 번에 patch — case.data.rabies_titer_records
 * 의 index 1 이상을 전체 교체. 1회차(0) 는 updateTiterFields 가 관리하므로 보존.
 *
 * entries 는 사용자가 화면에서 본 순서대로 들어오고, 같은 인덱스 위치에 기존 record 가
 * 있으면 그 record 의 received_date 등 비관리 키를 보존한다 (updateRabiesExtraEntries
 * 와 동일 패턴). 빈 entry 는 자동 제외 + 끝의 빈 항목 trim.
 *
 * value 는 IU/mL 단위 표기 제거해 저장.
 */
export async function updateTiterExtraEntries(
  caseId: string,
  entries: Array<{ date: string | null; lab: string | null; value: string | null }>,
): Promise<Result<CaseRow>> {
  try {
    for (const e of entries) {
      if (e.date != null && e.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
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
    const arr = Array.isArray(prev.rabies_titer_records)
      ? [...(prev.rabies_titer_records as unknown[])]
      : []
    const preserved = arr.slice(0, 1)
    const prevExtras = arr.slice(1)

    const newExtras: Record<string, unknown>[] = []
    for (let i = 0; i < entries.length; i++) {
      const fields = entries[i]
      const prevSlot = prevExtras[i]
      const prevEntry =
        prevSlot && typeof prevSlot === 'object'
          ? { ...(prevSlot as Record<string, unknown>) }
          : {}

      const entry: Record<string, unknown> = { ...prevEntry }

      const d = typeof fields.date === 'string' ? fields.date.trim() : ''
      if (d) entry.date = d
      else delete entry.date

      const labVal = typeof fields.lab === 'string' ? fields.lab.trim() : ''
      if (labVal) entry.lab = labVal
      else delete entry.lab

      const v = typeof fields.value === 'string' ? stripTiterUnit(fields.value) : ''
      if (v) entry.value = v
      else delete entry.value

      // date 없는 entry 는 의미 없는 잔여물 — drop (lab/value 만 남는 phantom 방지).
      if (!hasValidDate(entry)) continue
      newExtras.push(entry)
    }

    const titerNext: unknown[] = [...preserved, ...newExtras]
    while (titerNext.length > 0 && !hasValidDate(titerNext[titerNext.length - 1])) {
      titerNext.pop()
    }

    const nextData: Record<string, unknown> = { ...prev }
    if (titerNext.length === 0) delete nextData.rabies_titer_records
    else nextData.rabies_titer_records = titerNext

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

    // 항공권 구매 step 의 '표시 날짜' = 정보 입력 날짜(flight_info_recorded_at).
    // 항공권 자체 날짜(entry_date/return_date)는 검역 step 들로 분산. 최초 한 번만 캡처,
    // 항공권 정보가 모두 지워지면 함께 정리.
    const hasAnyFlightInfo = FLIGHT_DATA_KEYS.some((key) => {
      const v = nextData[key]
      return typeof v === 'string' && v.length > 0
    })
    if (hasAnyFlightInfo && typeof nextData.flight_info_recorded_at !== 'string') {
      nextData.flight_info_recorded_at = new Date().toISOString().slice(0, 10)
    } else if (!hasAnyFlightInfo) {
      delete nextData.flight_info_recorded_at
    }

    // 항공편 입국일(entry_date) = 출국일 — 펫무브워크와 동일하게 departure_date 컬럼도 동기화.
    // 입국일을 지우면 departure_date 도 null 로 비운다 — 안 비우면 옛 출국일이 컬럼에
    // 남아 journey 체크의 entry_date||departure_date 폴백이 유령 출국일을 잡는다.
    const entryDate = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
    const updatePayload: { data: Record<string, unknown>; departure_date: string | null } = {
      data: nextData,
      departure_date: entryDate || null,
    }

    const { data: updated, error } = await admin
      .from('cases')
      .update(updatePayload)
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
 * 케이스의 trip_type 만 토글 — data.trip_type[destinationToken] 갱신. 다른 토큰의
 * 기존 값은 보존. 항공권 step 의 '편도 일정으로 전환' 버튼이 호출.
 *
 * 편도 전환 시 귀국 항공편/검역 데이터는 유지(되돌릴 때 복원되게) — applicability 만
 * 바뀌어 일본 수출 검역·한국 수입검역 step 이 자동으로 빠진다.
 */
export async function updateCaseTripType(
  caseId: string,
  tripType: 'round' | 'one_way',
): Promise<Result<CaseRow>> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const destToken = (existing?.destination ?? '').split(',')[0]?.trim() ?? ''
    if (!destToken) return { ok: false, error: '목적지가 설정되지 않은 케이스입니다.' }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const nextData: Record<string, unknown> = { ...prev }
    const prevTrip =
      prev.trip_type && typeof prev.trip_type === 'object'
        ? { ...(prev.trip_type as Record<string, unknown>) }
        : {}
    prevTrip[destToken] = tripType
    nextData.trip_type = prevTrip

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
 * 사전 신고 step 의 '허가증 첨부 없이 완료' 플래그를 set/unset — set 은 보호자가
 * detail 안내의 '다음' 버튼으로 명시적 skip, unset 은 같은 화면의 '되돌리기' 버튼.
 * done-resolver 가 이 플래그를 보고 완료 판정. 첨부가 올라오면 플래그는 의미만
 * 잃을 뿐 굳이 unset 할 필요 없음 (둘 다 완료 시그널).
 */
export async function unmarkAdvanceNotificationApprovalSkipped(
  caseId: string,
): Promise<Result<CaseRow>> {
  try {
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
    delete nextData.advance_notification_approval_skipped
    // stored 클리어해 derive 모드 전환.
    delete nextData.import_import_status

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

export async function markAdvanceNotificationApprovalSkipped(
  caseId: string,
): Promise<Result<CaseRow>> {
  try {
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
    // 신청일이 있어야 skip 이 의미가 있음 — 미입력 상태에서 호출되면 노옵.
    if (
      typeof prev.advance_notification_date !== 'string' ||
      (prev.advance_notification_date as string).length < 10
    ) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    const nextData: Record<string, unknown> = {
      ...prev,
      advance_notification_approval_skipped: true,
    }
    // 완료 시그널 — admin demote 상태를 자동 해제.
    delete nextData.advance_notification_admin_demoted_at
    // stored 클리어해 derive 모드 전환.
    delete nextData.import_import_status

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
 * 일본 수출 동물검역 신청 step 의 '예약 입력 없이 완료' 플래그 set/unset — 사전 신고
 * 패턴과 동일. set 은 detail 안내의 '다음' 버튼, unset 은 '되돌리기' 버튼.
 * done-resolver 가 이 플래그를 보고 신청일만으로 완료 판정. 예약 날짜·시간이 둘 다
 * 입력되면 플래그는 의미만 잃을 뿐 굳이 unset 할 필요 없음.
 */
export async function unmarkJpExportQuarantineReservationSkipped(
  caseId: string,
): Promise<Result<CaseRow>> {
  try {
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
    delete nextData.jp_export_quarantine_reservation_skipped
    // stored 클리어해 derive 모드 전환.
    delete nextData.import_export_status

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

export async function markJpExportQuarantineReservationSkipped(
  caseId: string,
): Promise<Result<CaseRow>> {
  try {
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
    if (
      typeof prev.jp_export_quarantine_application_date !== 'string' ||
      (prev.jp_export_quarantine_application_date as string).length < 10
    ) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    const nextData: Record<string, unknown> = {
      ...prev,
      jp_export_quarantine_reservation_skipped: true,
    }
    // 완료 시그널 — admin demote 상태를 자동 해제.
    delete nextData.jp_export_quarantine_admin_demoted_at
    // stored 클리어해 derive 모드 전환.
    delete nextData.import_export_status

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
 * 사전 신고 step 의 신청일을 patch — case.data.advance_notification_date (YYYY-MM-DD).
 * 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateAdvanceNotificationDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.advance_notification_date = v
    else delete nextData.advance_notification_date
    // 신고탭 stored 값을 클리어해 derive 모드로 전환 — portal 보호자의 적극적 입력이
    // 운영자의 기존 수동 상태보다 우선시되도록. 액션이 일어난 케이스만 영향.
    delete nextData.import_import_status

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
 * 내원·임상검진 step 의 검진일을 patch — case.data.vet_visit_date (YYYY-MM-DD).
 * 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateVetVisitDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.vet_visit_date = v
    else delete nextData.vet_visit_date

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
 * 한국 수출 동물검역 step 의 검역일을 patch — case.data.kr_export_quarantine_date
 * (YYYY-MM-DD). 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateKrExportQuarantineDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.kr_export_quarantine_date = v
    else delete nextData.kr_export_quarantine_date

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
 * 일본 수입 동물검역 step 의 검역일을 patch — case.data.jp_import_quarantine_date
 * (YYYY-MM-DD). 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateJpImportQuarantineDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.jp_import_quarantine_date = v
    else delete nextData.jp_import_quarantine_date

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
 * 일본 수출 동물검역 step 의 검역일을 patch — case.data.jp_export_quarantine_visit_date
 * (YYYY-MM-DD). 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateJpExportQuarantineVisitDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.jp_export_quarantine_visit_date = v
    else delete nextData.jp_export_quarantine_visit_date

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
 * 한국 수입 동물검역 step 의 검역일을 patch — case.data.kr_import_quarantine_date
 * (YYYY-MM-DD). 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateKrImportQuarantineDate(
  caseId: string,
  date: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
    const nextData: Record<string, unknown> = { ...prev }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.kr_import_quarantine_date = v
    else delete nextData.kr_import_quarantine_date

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
 * 일본 수출검역 step 의 신청일·예약일·예약시간을 patch —
 * case.data.jp_export_quarantine_application_date / jp_export_quarantine_date
 * (YYYY-MM-DD) / jp_export_quarantine_time (HH:mm). 빈/null 이면 키 제거.
 * data 의 다른 키는 fetch-merge 로 보존.
 *
 * 신청일은 NACCS 접수 시그널, 예약 날짜·시간 둘 다 입력돼야 done-resolver 가 완료로 잡음.
 */
export async function updateJpExportQuarantineFields(
  caseId: string,
  fields: { applicationDate: string | null; date: string | null; time: string | null },
): Promise<Result<CaseRow>> {
  try {
    if (
      fields.applicationDate != null &&
      fields.applicationDate !== '' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(fields.applicationDate)
    ) {
      return { ok: false, error: '신청일 형식은 YYYY-MM-DD 여야 합니다.' }
    }
    if (fields.date != null && fields.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) {
      return { ok: false, error: '예약일 형식은 YYYY-MM-DD 여야 합니다.' }
    }
    let time: string | null = null
    if (fields.time != null && fields.time.trim() !== '') {
      const m = fields.time.trim().match(/^(\d{1,2}):(\d{2})$/)
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
        return { ok: false, error: '예약시간 형식은 HH:mm (예: 14:30) 여야 합니다.' }
      }
      time = `${m[1].padStart(2, '0')}:${m[2]}`
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
    // 항공편 일정 기준 입력 조건 — 항공편 미입력 시 비교 불가라 SKIP. 입력된 경우에만 차단.
    const entryDate = typeof prev.entry_date === 'string' ? prev.entry_date : ''
    const returnDate = typeof prev.return_date === 'string' ? prev.return_date : ''
    const trimmedApp = typeof fields.applicationDate === 'string' ? fields.applicationDate.trim() : ''
    const trimmedReserved = typeof fields.date === 'string' ? fields.date.trim() : ''
    if (trimmedApp && returnDate && returnDate.length >= 10) {
      // 신청일 ≤ 귀국 - 10일 (간단 비교: ISO date 는 사전식 정렬 = 시간순)
      const ret = new Date(returnDate.slice(0, 10) + 'T00:00:00Z')
      ret.setUTCDate(ret.getUTCDate() - 10)
      const deadline = ret.toISOString().slice(0, 10)
      if (trimmedApp > deadline) {
        return {
          ok: false,
          error: `신청일은 귀국 항공편(${formatKr(returnDate)}) 10일 전(${formatKr(deadline)})까지여야 합니다.`,
        }
      }
    }
    if (trimmedReserved && returnDate && returnDate.length >= 10 && trimmedReserved > returnDate.slice(0, 10)) {
      return {
        ok: false,
        error: `예약일은 귀국 항공편(${formatKr(returnDate)})보다 늦을 수 없습니다.`,
      }
    }
    if (trimmedReserved && entryDate && entryDate.length >= 10 && trimmedReserved < entryDate.slice(0, 10)) {
      return {
        ok: false,
        error: `예약일은 일본 입국일(${formatKr(entryDate)})보다 빠를 수 없습니다.`,
      }
    }

    const nextData: Record<string, unknown> = { ...prev }
    const a = typeof fields.applicationDate === 'string' ? fields.applicationDate.trim() : ''
    if (a) nextData.jp_export_quarantine_application_date = a
    else delete nextData.jp_export_quarantine_application_date
    const d = typeof fields.date === 'string' ? fields.date.trim() : ''
    if (d) nextData.jp_export_quarantine_date = d
    else delete nextData.jp_export_quarantine_date
    if (time) nextData.jp_export_quarantine_time = time
    else delete nextData.jp_export_quarantine_time
    // portal 보호자 입력 = 확정 의미 (admin 추가정보의 '고객 희망'과 다름).
    // date+time 둘 다 있으면 confirmed=true, 하나라도 비면 false. admin 토글로도 동일.
    if (d && time) {
      nextData.jp_export_quarantine_confirmed = true
      // 완료 시그널 — admin demote 상태를 자동 해제.
      delete nextData.jp_export_quarantine_admin_demoted_at
    } else {
      delete nextData.jp_export_quarantine_confirmed
    }
    // 신청일·예약·확정 어떤 시점이든 보호자가 portal 에서 적극적 입력을 했다는 뜻 —
    // stored 클리어해 derive 모드로 전환 (운영자 수동값이 있었다면 그 시점부터만 무력화).
    delete nextData.import_export_status

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
  /** 동시 진행 — 같은 보호자의 다른 동물에 절차·추가 정보를 함께 반영. 디폴트 on. */
  co_progress: boolean
  return_date: string
  entry_departure_airport: string
  entry_airport: string
  entry_flight_number: string
  entry_transport: string
  return_departure_airport: string
  return_arrival_airport: string
  return_flight_number: string
  return_transport: string
  jp_export_quarantine_date: string
  jp_export_quarantine_time: string
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
  'jp_export_quarantine_date',
  'jp_export_quarantine_time',
] as const

export async function updateCaseInfoFields(
  caseId: string,
  input: CaseInfoInput,
): Promise<Result<CaseRow>> {
  try {
    // ── 검증 ──
    for (const v of [
      input.departure_date,
      input.birth_date,
      input.return_date,
      input.jp_export_quarantine_date,
    ]) {
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

    // 동시 진행 플래그 — 명시적 boolean 으로 저장 (디폴트 on = 키 없음 또는 false 아님).
    nextData.co_progress = input.co_progress

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

/** org_vaccine_products 의 rabies 행 — getCaseVaccineData 에서만 사용. */
interface RabiesProductRow {
  vaccine: string | null
  product: string | null
  manufacturer: string
  batch: string | null
  expiry: string | null
  year: number | null
}

/**
 * 케이스 org 의 광견병 백신 카탈로그를 VaccineProductsData(rabies 만 채움) 로 반환.
 *
 * 광견병 step 의 "지정 약품" 힌트 계산용 — 펫무브워크 케이스 상세가 보여주는
 * 자동 추론 약품과 동일한 카탈로그. createVaccineLookups(value).lookupRabies(date)
 * 로 클라이언트에서 접종일별 힌트를 뽑는다.
 *
 * org_vaccine_products 는 org 멤버 전용 RLS 라 service role 로 우회 — case 접근
 * (case_customer_links) 확인 후이므로 보호자는 자기 케이스 org 의 카탈로그만 본다.
 * 포털 여정엔 광견병 step 만 있어 rabies 카테고리만 로드.
 */
/**
 * 펫무브워크 "고객앱 미리보기" 인증 — pm_preview 쿠키가 이 caseId 로 유효한지.
 * 미리보기는 보호자 세션이 없어 case_customer_links 검증을 통과 못 하므로,
 * (authed) layout 과 동일한 서명 토큰 검증으로 별도 통과시킨다.
 */
async function isPreviewAuthorized(caseId: string): Promise<boolean> {
  try {
    const token = (await cookies()).get('pm_preview')?.value
    if (!token) return false
    const payload = verifyPreviewToken(token)
    return !!payload && payload.caseId === caseId
  } catch {
    return false
  }
}

export async function getCaseVaccineData(caseId: string): Promise<Result<VaccineProductsData>> {
  try {
    // 보호자 본인 또는 펫무브워크 미리보기 — 둘 중 하나면 통과.
    if (!(await isPreviewAuthorized(caseId))) {
      const access = await assertCaseAccess(caseId)
      if (!access.ok) return access
    }

    const admin = createAdminClient()
    const { data: caseRow, error: caseErr } = await admin
      .from('cases')
      .select('org_id')
      .eq('id', caseId)
      .single()
    if (caseErr || !caseRow) {
      return { ok: false, error: caseErr?.message ?? '케이스를 찾을 수 없습니다.' }
    }

    const { data: rows, error } = await admin
      .from('org_vaccine_products')
      .select('vaccine, product, manufacturer, batch, expiry, year')
      .eq('org_id', (caseRow as { org_id: string }).org_id)
      .eq('category', 'rabies')
    if (error) return { ok: false, error: error.message }

    const value = emptyVaccineProductsData()
    for (const row of (rows ?? []) as RabiesProductRow[]) {
      value.rabies.push({
        vaccine: row.vaccine ?? undefined,
        product: row.product ?? undefined,
        manufacturer: row.manufacturer,
        batch: row.batch,
        expiry: row.expiry,
        year: row.year ?? undefined,
      })
    }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
