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
import {
  emptyVaccineProductsData,
  applyAutoFillRules,
  buildCaseJourneyContext,
  findRabiesChainBreak,
  isDestinationScopedKey,
  normalizeRabiesOrder,
  parseDestinations,
  todayKst,
  validateJpEntryDate,
  writeByDestValue,
  writeJourneyFeedback,
  readByDestValue,
  type CaseRow,
  type VaccineProductsData,
} from '@petmove/domain'
import { AVATAR_COLOR_IDS, type AvatarColorId } from '@/lib/avatar'
import { readForm } from '@/lib/cases/info-form'
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
 * 보호자가 본인 케이스(동물)를 소프트 삭제 — cases.deleted_at 에 현재 시각 기록.
 *
 * listMyCases / getMyCase 가 `deleted_at is null` 로 필터하므로 즉시 목록·앱에서 사라진다.
 * 운영자(펫무브워크)에는 행이 남아 복구·정산이 가능(완전 삭제 아님). cases_update RLS 는
 * org_member 만 허용 → service role 로 우회하되 assertCaseAccess 로 본인 link 를 먼저 검증.
 */
export async function softDeleteMyCase(caseId: string): Promise<Result<{ id: string }>> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { error } = await admin
      .from('cases')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', caseId)
      .is('deleted_at', null)
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: { id: caseId } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 보호자가 자기 케이스의 아바타(색상·사진)를 갱신. 보호자 아바타(updateMyProfile)와 동일 모델.
 *
 * cases_update RLS 는 org_member 만 허용 → service role 로 우회. 그 대신
 * (1) auth 확인, (2) case_customer_links 로 본인 ↔ 케이스 매핑 검증,
 * (3) color 화이트리스트 / photo_url 은 user-avatars 도메인 검증, (4) avatar_*
 * 컬럼만 update — 다른 컬럼/케이스에 손댈 길 없음.
 *
 * patch 에 준 키만 갱신. null 로 보내면 "해제" (자동 fallback 로 복귀).
 * 사진 업로드는 client 가 user-avatars 버킷({user_id}/pets/...)으로 직접 — 여기는 URL 만 저장.
 */
export async function updateCaseAvatar(
  caseId: string,
  patch: { avatar_color?: AvatarColorId | null; avatar_photo_url?: string | null },
): Promise<Result<CaseRow>> {
  try {
    const update: Record<string, unknown> = {}
    if (patch.avatar_color !== undefined) {
      if (patch.avatar_color !== null && !AVATAR_COLOR_IDS.includes(patch.avatar_color)) {
        return { ok: false, error: '허용되지 않은 색상' }
      }
      update.avatar_color = patch.avatar_color
    }
    if (patch.avatar_photo_url !== undefined) {
      const url = patch.avatar_photo_url?.trim() || null
      if (url && !/\/storage\/v1\/object\/public\/user-avatars\//.test(url)) {
        return { ok: false, error: '허용되지 않은 사진 경로입니다.' }
      }
      update.avatar_photo_url = url
    }
    if (Object.keys(update).length === 0) {
      return { ok: false, error: '변경할 내용이 없습니다.' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cases')
      .update(update)
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
        return { ok: false, error: '15자리 숫자를 입력하세요.' }
      }
      chip = digits
    }

    // implant_date 정규화: YYYY-MM-DD 만 허용 (빈/null 은 해제).
    let dt: string | null = null
    if (microchipImplantDate != null && microchipImplantDate !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(microchipImplantDate)) {
        return { ok: false, error: '삽입일 형식은 YYYY-MM-DD 여야 합니다.' }
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

    // 광견병 1·2차 순서·간격 차단은 server 에 두지 않는다 — 펫무브 client(2차 입력 시
    // validateRabiesInterval 입력 불가)와 procedure-check(1차 수정 후 2차 step '주의')가
    // 같은 domain 함수로 담당한다. server 는 데이터 형식만 검증(단일 출처 모델).

    // 단, 2차(index 1)에 유효 날짜를 넣는데 1차(index 0)가 비어 있으면 거부 — '날짜순 압축'
    // 모델상 1차 없는 2차는 저장 시 1차로 당겨져 슬롯이 어긋난다(2차로 넣은 게 1차로 이동).
    // 말없이 옮기는 대신 1차를 먼저 입력하도록 막는다(논리적으로 2차는 1차 없이 존재 불가).
    // client getSaveBlockError 의 isRabies2 분기와 동일 조건 — 단일 출처. 3차+ 는 별도 함수.
    if (index === 1 && hasValidDate(entry) && !hasValidDate(rabiesArr[0])) {
      return { ok: false, error: '1차 접종일을 먼저 입력하세요.' }
    }

    // 앞 index 를 빈 객체로 패딩 (sparse 배열 방지) 후 해당 index 설정.
    while (rabiesArr.length < index) rabiesArr.push({})
    rabiesArr[index] = entry
    // date 없는 phantom 을 전체 제거 — 끝뿐 아니라 중간·앞쪽(1차 자리)도. 1차를 비우면
    // 뒤 회차가 당겨지고, 날짜순으로 정렬해 "index 0 = 가장 이른 = 1차" 불변식을 저장
    // 시점에 보장한다. 펫무브워크(normalizeRabiesOrder)와 동일 모델로 통일 — 펫무브도
    // '고정 슬롯'이 아니라 '날짜순 압축 리스트'를 저장한다. (앞쪽 phantom·회차 어긋남 해소.)
    const compacted = rabiesArr.filter(hasValidDate)
    const sorted = normalizeRabiesOrder(
      compacted as Array<Record<string, unknown> & { date?: string | null }>,
    )

    const nextData: Record<string, unknown> = { ...prev }
    if (sorted.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = sorted

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
 * 광견병/항체 검사 entry 가 "phantom" 인지 — date 가 없으면 의미 없는 잔여물로 간주.
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

    // chain 검증 — 각 접종은 직전 접종의 면역 유효기간 이내여야 함. 만료 후 접종은
    // 새 기초접종이 되어 1·2차+검사+180일 다시 — 입력 단계에서 거부.
    const chainSeq = rabiesNext.map((r) => {
      const rec = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      return {
        date: typeof rec.date === 'string' ? rec.date : '',
        valid_until: typeof rec.valid_until === 'string' ? rec.valid_until : null,
      }
    })
    const chainBreak = findRabiesChainBreak(chainSeq)
    if (chainBreak) {
      return {
        ok: false,
        error:
          chainBreak.reason === 'too-early'
            ? `${chainBreak.brokenAt}차 접종일은 ${chainBreak.brokenAt - 1}차 접종일보다 늦어야 합니다.`
            : `${chainBreak.brokenAt}차 접종일은 ${chainBreak.brokenAt - 1}차 백신 면역 유효기간 이내여야 합니다.`,
      }
    }

    const nextData: Record<string, unknown> = { ...prev }
    if (rabiesNext.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = rabiesNext

    // 추가 접종(3차+) 확인 플래그 — 가장 최근 추가 접종일이 도래(≤ 오늘)했으면 보호자가 실제
    // 접종을 확인하며 저장한 것으로 보고 완료(true). 미래(예정)면 false — 도래 후 '저장' 클릭으로
    // 확인. 추가 접종이 없으면 제거. (검역 5단계 확인 모델과 동일 취지. 옛 데이터는 플래그가
    // 없어 done-resolver 가 날짜 게이트로 폴백 → 회귀 없음.)
    const rabiesExtraEntries = rabiesNext.slice(2)
    if (rabiesExtraEntries.length === 0) {
      delete nextData.rabies_extra_confirmed
    } else {
      const latestExtra = rabiesExtraEntries.reduce<string>((max, r) => {
        const d =
          r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
            ? ((r as Record<string, unknown>).date as string)
            : ''
        return d > max ? d : max
      }, '')
      nextData.rabies_extra_confirmed = latestExtra !== '' && latestExtra <= todayKst()
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
 * 광견병 항체 검사 step 의 입력 필드를 patch — case.data.rabies_titer_records[0] 의
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
    // 채혈일(1회차 검사일)이 바뀌거나 지워지면 '완료(결과 확인)' 플래그 해제 — 이전
    // 결과·완료가 새 검사에 그대로 적용되지 않도록. 사전 신고·수출검역과 동일 안전장치.
    const prevPrimaryDate =
      slot && typeof slot === 'object' && typeof (slot as Record<string, unknown>).date === 'string'
        ? ((slot as Record<string, unknown>).date as string)
        : ''
    const newPrimaryDate = typeof entry.date === 'string' ? (entry.date as string) : ''
    if (newPrimaryDate !== prevPrimaryDate) delete nextData.rabies_titer_result_confirmed

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
 * 광견병 항체 검사 step 의 '결과 확인 완료' 플래그(rabies_titer_result_confirmed=true) 를
 * set — 보호자가 검사결과 수치를 직접 입력하지 않고 detail 하단의 '완료' 버튼을 누를 때
 * 호출. 채혈일(1회차 검사일)이 입력돼 있어야 set (없으면 의미 없음 → 거부).
 *
 * done-resolver 가 이 플래그 또는 결과값(value) 입력 둘 중 하나면 완료로 판정.
 * 사전 신고·일본 수출검역 신청과 동일 2단계 모델.
 */
export async function markTiterResultConfirmed(caseId: string): Promise<Result<CaseRow>> {
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
    const arr = Array.isArray(prev.rabies_titer_records)
      ? (prev.rabies_titer_records as Array<Record<string, unknown>>)
      : []
    const primary = arr[0]
    const hasDate =
      !!primary && typeof primary.date === 'string' && (primary.date as string).length >= 10
    if (!hasDate) {
      return { ok: false, error: '채혈일이 입력되어 있지 않습니다.' }
    }
    const nextData: Record<string, unknown> = { ...prev, rabies_titer_result_confirmed: true }

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
 * 광견병 항체 검사(2회차+)의 입력 기록을 한 번에 patch — case.data.rabies_titer_records
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

    // 추가 검사(2회+) 확인 플래그 — 추가 접종과 동일. 가장 최근 추가 채혈일이 도래(≤ 오늘)면
    // true, 미래(예정)면 false. 추가 채혈이 없으면 제거.
    const titerExtraEntries = titerNext.slice(1)
    if (titerExtraEntries.length === 0) {
      delete nextData.titer_extra_confirmed
    } else {
      const latestExtra = titerExtraEntries.reduce<string>((max, r) => {
        const d =
          r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
            ? ((r as Record<string, unknown>).date as string)
            : ''
        return d > max ? d : max
      }, '')
      nextData.titer_extra_confirmed = latestExtra !== '' && latestExtra <= todayKst()
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
  /** 다중 목적지 케이스에서 활성 목적지 토큰 — 지정 + 다중이면 항공권/출국일을 by_dest 에 분리 저장. */
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    for (const key of ['entry_date', 'return_date'] as const) {
      const v = fields[key]
      if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }
    // 출국 ≤ 귀국 — 둘 다 입력된 경우만 검사. 논리적 불가능 조건이므로 저장 거부.
    {
      const entry = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      const ret = typeof fields.return_date === 'string' ? fields.return_date.trim() : ''
      if (entry && ret && ret < entry) {
        return { ok: false, error: '귀국 항공편 날짜는 출국 항공편 날짜 이후여야 합니다.' }
      }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>

    // 다중 목적지 + 활성 목적지 지정 → 항공권 필드 + 출국일을 by_dest[destination] 에 분리 저장.
    // 부수효과(departure_date 컬럼 sync·auto-fill)는 by_dest 경로에선 스킵 — admin updateCaseField
    // 와 동일. 컬럼은 단일값이라 다중 목적지를 못 담고, flatten 이 by_dest[dest].departure_date 를
    // 우선 읽어 has-flight-date·D-day 가 목적지별로 작동한다.
    const caseDestStr = (existing as { destination: string | null }).destination
    const isSingleDest = parseDestinations(caseDestStr).length === 1
    // 활성 목적지 토큰을 읽기(flatten)와 동일하게 해석 — ?dest 미지정이어도 첫 토큰으로 fallback 해
    // 항공권 필드·출국일을 by_dest 에 저장한다. 읽기는 strict by_dest 라 top-level/컬럼에 쓰면
    // 출국일이 검증에 안 보여 '주의'가 누락됐다. 검역·검진과 동일 패턴(resolveWriteToken, 로컬 함수).
    const writeDest = resolveWriteToken(caseDestStr, prev, destination)
    if (writeDest) {
      let merged: Record<string, unknown> = { ...prev }
      for (const key of FLIGHT_DATA_KEYS) {
        const val = typeof fields[key] === 'string' ? (fields[key] as string).trim() : ''
        merged = writeByDestValue(merged, writeDest, key, val || null)
      }
      const entryDate = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      merged = writeByDestValue(merged, writeDest, 'departure_date', entryDate || null)

      // 공용 부수효과 패리티 — 단일 목적지 한정(다중은 종전대로 by_dest 만). top-level 경로와 동일하게:
      //  · flight_info_recorded_at(항공권 구매 step 표시일) 최초 캡처 / 전부 지워지면 정리
      //  · departure_date 컬럼 동기화(목록 필터·정렬·auto-fill 호환, read 는 by_dest 우선)
      const updatePayload: Record<string, unknown> = { data: merged }
      if (isSingleDest) {
        const hasAnyFlightInfo = FLIGHT_DATA_KEYS.some((key) => {
          const v = fields[key]
          return typeof v === 'string' && v.trim().length > 0
        })
        if (hasAnyFlightInfo && typeof merged.flight_info_recorded_at !== 'string') {
          merged.flight_info_recorded_at = new Date().toISOString().slice(0, 10)
        } else if (!hasAnyFlightInfo) {
          delete merged.flight_info_recorded_at
        }
        updatePayload.departure_date = entryDate || null
      }

      const { error: updErr } = await admin.from('cases').update(updatePayload).eq('id', caseId)
      if (updErr) return { ok: false, error: updErr.message }

      // 단일 목적지: 출국일 변경 시 org_auto_fill_rules(일본 departure↔departure_flight_date sync 등)를
      // by_dest 경로로 적용 — top-level 경로의 applyAutoFillRules 와 동일.
      if (isSingleDest) {
        try {
          await applyAutoFillRules(admin, caseId, 'departure_date', writeDest)
        } catch { /* best-effort */ }
      }

      const { data: updated, error: refetchErr } = await admin
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single()
      if (refetchErr) return { ok: false, error: refetchErr.message }
      return { ok: true, value: updated as CaseRow }
    }

    // 일본 입국일 180일·후행 일정과의 관계는 server 에서 차단하지 않는다 — 펫무브 client 가
    // 입력 불가로 막고, procedure-check 가 어긋난 step 에 '주의'를 띄운다(단일 출처). 출국 ≤ 귀국·
    // 날짜 형식 같은 항공편 자체의 내재적 정합성은 위에서 형식 검증으로 처리.
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

    const { error } = await admin
      .from('cases')
      .update(updatePayload)
      .eq('id', caseId)
    if (error) return { ok: false, error: error.message }

    // departure_date 가 갱신되면 org_auto_fill_rules 트리거 — 일본의 경우
    // departure_date → departure_flight_date 양방향 sync 룰이 fire 해 출국 항공편 그룹의
    // 출발일이 자동 채워짐. admin 의 updateCaseField 와 동일.
    try {
      await applyAutoFillRules(admin, caseId, 'departure_date')
    } catch { /* best-effort */ }

    // auto-fill 룰 적용 결과를 포함한 최신 case row 를 다시 fetch.
    const { data: updated, error: refetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (refetchErr) return { ok: false, error: refetchErr.message }
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
    if (!destToken) return { ok: false, error: '목적지가 설정되지 않은 여정입니다.' }

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
    const prevDate =
      typeof prev.advance_notification_date === 'string' ? prev.advance_notification_date : ''
    const v = typeof date === 'string' ? date.trim() : ''
    if (v) nextData.advance_notification_date = v
    else delete nextData.advance_notification_date
    // 신청일이 바뀌거나 지워지면 '완료 처리(skip)'를 해제 — 새 신청일은 '허가증 대기'에서
    // 다시 시작하는 것이고(skip 은 '완료 처리' 버튼으로만 설정), 신청일 없는 skip 은 무의미하다.
    // 같은 신청일을 다시 저장할 때는 보존해 명시적 '완료 처리' 상태를 지우지 않는다.
    if (v !== prevDate) delete nextData.advance_notification_approval_skipped
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
  confirmed: boolean,
  /** 다중 목적지 케이스에서 활성 목적지 토큰 — 지정 + 다중이면 by_dest[destination] 에 분리 저장. */
  destination?: string | null,
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
      .select('data, departure_date, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''

    // B: 단일도 by_dest 통일 — 활성 목적지 토큰만 있으면 vet_visit_date 를 by_dest[destination] 에 저장.
    // (vet_visit_date 는 destination-scoped 필드. destination 미지정만 아래 top-level 경로.)
    const isSingleDest =
      parseDestinations((existing as { destination: string | null }).destination).length === 1
    if (destination) {
      let nextData = writeByDestValue(prev, destination, 'vet_visit_date', v || null)
      // 검진일이 바뀌거나 지워지면 legacy 완료 플래그(vet_visit_confirmed, 공용)를 해제 — top-level 경로와
      // 동일. 단일 목적지 한정(공용 단일값이라 다중 목적지에선 의미 모호 → 종전 유지).
      if (isSingleDest && 'vet_visit_confirmed' in nextData) {
        const prevByDest = readByDestValue(prev, destination, 'vet_visit_date')
        const prevDate =
          typeof prevByDest === 'string'
            ? prevByDest
            : typeof prev.vet_visit_date === 'string'
              ? prev.vet_visit_date
              : ''
        if (v !== prevDate) {
          nextData = { ...nextData }
          delete (nextData as Record<string, unknown>).vet_visit_confirmed
        }
      }
      const { data: updated, error } = await admin
        .from('cases')
        .update({ data: nextData })
        .eq('id', caseId)
        .select('*')
        .single()
      if (error) return { ok: false, error: error.message }
      return { ok: true, value: updated as CaseRow }
    }

    // 내원일 도메인 차단은 server 에 두지 않는다 — client(입력 불가)·procedure-check(주의)가
    // 같은 함수로 담당(단일 출처).
    const nextData: Record<string, unknown> = { ...prev }
    const prevDate = typeof prev.vet_visit_date === 'string' ? prev.vet_visit_date : ''
    if (v) nextData.vet_visit_date = v
    else delete nextData.vet_visit_date
    // 새 모델 — 완료 판정은 done-resolver 가 (1) 모든 필수 서류 ✓ 또는 (2) legacy
    // vet_visit_confirmed 플래그, (3) spec 없는 destination 의 경우 검진일 입력만으로
    // 판정. 보호자가 검진일을 바꾸거나 지우면 기존 완료 플래그를 자동 해제 (사전 신고와 동일).
    if (v !== prevDate) delete nextData.vet_visit_confirmed
    // confirmed 파라미터는 admin 호환 위해 남겨두지만 portal 호출은 항상 false 로 전달.
    if (v && confirmed) nextData.vet_visit_confirmed = true

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
/**
 * 활성 목적지 토큰을 읽기(flatten)와 동일하게 해석한다 — `buildCaseJourneyContext`:
 * activeDest 가 목적지 목록에 있으면 그것, 아니면 첫 토큰, 목적지 자체가 없으면 null.
 *
 * 중요: 진입로 대부분이 `?dest=` 없이 일정에 들어와 activeDest=null 이 된다. 이때 읽기는
 * 첫 토큰으로 fallback 해 `by_dest[첫토큰]` 만 보고 top-level scoped 키는 삭제하는데, 쓰기가
 * activeDest=null 을 그대로 top-level 에 저장하면 저장/읽기 위치가 어긋나 (다중 목적지 케이스에서)
 * 완료가 즉시 증발한다. 쓰기도 같은 토큰으로 해석해 by_dest 에 저장하면 일치한다.
 */
function resolveWriteToken(
  destinationColumn: string | null | undefined,
  prevData: Record<string, unknown>,
  activeDest: string | null | undefined,
): string | null {
  return buildCaseJourneyContext(
    { destination: destinationColumn ?? null, data: prevData } as CaseRow,
    activeDest ?? null,
  ).destinationToken
}

/**
 * 검역 날짜+확인 플래그를 destination scope 에 맞게 저장.
 * - 목적지 토큰이 해석되면 → `data.by_dest[token]` 에 저장 + top-level 잔존 제거
 *   (안 그러면 다른 목적지가 flatten fallback 으로 그 검역을 물려받는 누수 발생).
 * - 목적지 자체가 없으면(token=null) → 기존 top-level.
 * token 은 읽기와 동일하게 `resolveWriteToken` 으로 해석 — activeDest 미지정이어도 첫 토큰으로
 * fallback 해 저장/읽기 위치를 일치시킨다(완료 증발 버그 차단).
 * design: 검역은 목적지별(모든 절차 목적지별).
 */
function applyQuarantine(
  prev: Record<string, unknown>,
  destinationColumn: string | null | undefined,
  activeDest: string | null | undefined,
  dateKey: string,
  confirmKey: string,
  v: string,
  confirmed: boolean,
): Record<string, unknown> {
  // B: 단일도 by_dest 통일 — isMulti 게이트 제거. 활성 목적지 토큰만 있으면 by_dest 경로.
  const token = resolveWriteToken(destinationColumn, prev, activeDest)
  const useByDest = !!token
  const nextData: Record<string, unknown> = { ...prev }
  if (useByDest) {
    const byDest = {
      ...((prev.by_dest as Record<string, Record<string, unknown>> | undefined) ?? {}),
    }
    const destObj = { ...(byDest[token as string] ?? {}) }
    if (v) destObj[dateKey] = v
    else delete destObj[dateKey]
    if (v && confirmed) destObj[confirmKey] = true
    else delete destObj[confirmKey]
    byDest[token as string] = destObj
    nextData.by_dest = byDest
    delete nextData[dateKey]
    delete nextData[confirmKey]
  } else {
    if (v) nextData[dateKey] = v
    else delete nextData[dateKey]
    if (v && confirmed) nextData[confirmKey] = true
    else delete nextData[confirmKey]
  }
  return nextData
}

export async function updateKrExportQuarantineDate(
  caseId: string,
  date: string | null,
  confirmed: boolean,
  destination?: string | null,
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    // 검역일 도메인 차단은 client(입력 불가)·procedure-check(주의)가 담당 — server 는 형식만.
    const nextData = applyQuarantine(
      prev,
      existing?.destination,
      destination,
      'kr_export_quarantine_date',
      'kr_export_quarantine_confirmed',
      v,
      confirmed,
    )

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
  confirmed: boolean,
  destination?: string | null,
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    const nextData = applyQuarantine(
      prev,
      existing?.destination,
      destination,
      'jp_import_quarantine_date',
      'jp_import_quarantine_confirmed',
      v,
      confirmed,
    )

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
 * 나라별 도착 수입검역(일본 외) step 의 검역일을 patch — fieldKey 는 그 나라 검역일 필드
 * (예: 'th_import_quarantine_date'). 한 액션이 모든 나라를 처리. confirmed=true(도래 후 '완료')면
 * '{국가}_import_quarantine_confirmed' 도 set. 스코핑(by_dest)은 applyQuarantine 공통.
 */
export async function updateImportQuarantineDate(
  caseId: string,
  fieldKey: string,
  date: string | null,
  confirmed: boolean,
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (!/^[a-z]+_(import|export)_quarantine_date$/.test(fieldKey)) {
      return { ok: false, error: '잘못된 검역일 필드입니다.' }
    }
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    const nextData = applyQuarantine(
      prev,
      existing?.destination,
      destination,
      fieldKey,
      fieldKey.replace(/_date$/, '_confirmed'),
      v,
      confirmed,
    )

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
  confirmed: boolean,
  destination?: string | null,
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    const nextData = applyQuarantine(
      prev,
      existing?.destination,
      destination,
      'jp_export_quarantine_visit_date',
      'jp_export_quarantine_visit_confirmed',
      v,
      confirmed,
    )

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
  confirmed: boolean,
  destination?: string | null,
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    const nextData = applyQuarantine(
      prev,
      existing?.destination,
      destination,
      'kr_import_quarantine_date',
      'kr_import_quarantine_confirmed',
      v,
      confirmed,
    )

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
  /** 활성 목적지 토큰 — 지정되면 예약 3필드(신청일·예약일·시간)를 by_dest[destination] 에 저장 (B). */
  destination?: string | null,
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    // 활성 목적지 토큰을 읽기와 동일하게 해석 — activeDest 미지정이어도 첫 토큰으로 fallback 해
    // 저장/읽기 위치를 일치시킨다(완료·예약 데이터 증발 차단).
    const token = resolveWriteToken(existing?.destination, prev, destination)
    // 예약일·신청일의 도메인 차단(입국일 ≤ 예약일 ≤ 귀국일, 신청 10일 전)은 server 에 두지
    // 않는다 — client(입력 불가)·procedure-check(주의)가 담당(단일 출처).
    let nextData: Record<string, unknown> = { ...prev }
    const a = typeof fields.applicationDate === 'string' ? fields.applicationDate.trim() : ''
    const d = typeof fields.date === 'string' ? fields.date.trim() : ''
    // 신청일 이전값 — by_dest(scoped) 우선, 마이그 전 top-level fallback.
    const prevAppliedRaw = readByDestValue(prev, token, 'jp_export_quarantine_application_date')
    const prevApplied =
      typeof prevAppliedRaw === 'string'
        ? prevAppliedRaw
        : typeof prev.jp_export_quarantine_application_date === 'string'
          ? prev.jp_export_quarantine_application_date
          : ''
    if (token) {
      // B: 단일도 by_dest 통일 — 예약 3필드를 by_dest[token] 에 저장 + top-level 잔존 제거.
      nextData = writeByDestValue(nextData, token, 'jp_export_quarantine_application_date', a || null)
      nextData = writeByDestValue(nextData, token, 'jp_export_quarantine_date', d || null)
      nextData = writeByDestValue(nextData, token, 'jp_export_quarantine_time', time || null)
      delete nextData.jp_export_quarantine_application_date
      delete nextData.jp_export_quarantine_date
      delete nextData.jp_export_quarantine_time
    } else {
      if (a) nextData.jp_export_quarantine_application_date = a
      else delete nextData.jp_export_quarantine_application_date
      if (d) nextData.jp_export_quarantine_date = d
      else delete nextData.jp_export_quarantine_date
      if (time) nextData.jp_export_quarantine_time = time
      else delete nextData.jp_export_quarantine_time
    }
    // 신청일이 바뀌거나 지워지면 '완료 처리(skip)'를 해제 — 사전 신고와 동일 사유.
    // reservation_skipped 는 일본 전용 키(다른 목적지가 같은 step 을 안 가져 누수 없음) → 공용 유지.
    if (a !== prevApplied) delete nextData.jp_export_quarantine_reservation_skipped
    // 예약일·시간은 '희망/예정' 데이터일 뿐, 완료 판정에 영향 없음 — 보호자가 하단 '완료'
    // 버튼(reservation_skipped 플래그)을 명시적으로 눌러야 step 이 done. 사전 신고와 동일 모델.
    // 기존에 admin 토글로 confirmed=true 가 세팅된 케이스가 있다면 그 값은 그대로 둔다
    // (admin 의 명시적 액션이라 portal 입력 변화로 자동 무력화하지 않음).
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
 * 여정 완료 후 보호자가 남기는 의견 — case.data.feedback 의 **목적지 칸**에 저장.
 * `feedback = { [목적지]: { rating, text, submittedAt } }` (목적지별). 빈 값이면 그 칸 제거.
 * destination 미지정이면 케이스 첫 목적지 칸. legacy 단일 객체는 keyed-map 으로 승격(writeJourneyFeedback).
 * data 의 다른 키는 fetch-merge 로 보존. 운영자(펫무브워크)가 목적지별로 확인.
 */
export async function saveCaseFeedback(
  caseId: string,
  destination: string | null,
  rating: number | null,
  text: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (!caseId) return { ok: false, error: '잘못된 요청입니다.' }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const tokens = parseDestinations(existing?.destination)
    const firstToken = tokens[0] ?? null
    // destination 이 목적지 목록에 있으면 그 칸, 아니면 첫 목적지 칸(읽기와 동일 해석).
    const destTok =
      destination && tokens.includes(destination) ? destination : firstToken ?? destination ?? ''
    const r = typeof rating === 'number' && rating >= 1 && rating <= 5 ? Math.round(rating) : null
    const t = typeof text === 'string' ? text.trim() : ''
    const nextData = writeJourneyFeedback(
      prev,
      destTok,
      firstToken,
      r === null && !t ? null : { rating: r, text: t, submittedAt: new Date().toISOString() },
    )

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
  /** 합본 (column) — 분리 입력 시 `${first} ${last}` 로 자동 갱신. legacy 호환. */
  customer_name_en: string
  /** 영문 이름 (data jsonb 분리 저장). admin pdf-fill 의 권위 소스. */
  customer_first_name_en: string
  /** 영문 성 (data jsonb 분리 저장). admin pdf-fill 의 권위 소스. */
  customer_last_name_en: string
  pet_name: string
  pet_name_en: string
  microchip: string
  destination: string
  departure_date: string
  phone: string
  email: string
  address_kr: string
  /** 상세주소 (동·호수 등) — 검색 결과로 채워지는 도로명과 분리. */
  address_detail_kr: string
  address_zipcode: string
  address_en: string
  birth_date: string
  species: string
  breed: string
  /** 영문 품종 — admin pdf-fill 의 권위 소스. breed 선택 시 카탈로그에서 함께 저장. */
  breed_en: string
  color: string
  /** 영문 모색 (쉼표 구분) — admin pdf-fill 의 권위 소스. color 선택 시 함께 저장. */
  color_en: string
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
  'address_detail_kr',
  'address_zipcode',
  'address_en',
  'birth_date',
  'species',
  'breed',
  'breed_en',
  'color',
  'color_en',
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

/**
 * 이 폼이 책임지는 필드(컬럼+data) 전체 — base diff·충돌 검사 대상.
 * 여정 소유 필드(destination·trip_type·co_progress)는 destination action 들이 따로
 * 관리하므로 제외한다. 제외 필드는 effective 가 항상 DB 최신값(fresh)을 유지한다.
 */
const OWNED_INFO_KEYS = [
  ...INFO_DATA_KEYS,
  'customer_name',
  'customer_name_en',
  'customer_first_name_en',
  'customer_last_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'departure_date',
  'weight',
] as const satisfies readonly (keyof CaseInfoInput)[]

/** 동시수정 충돌 시 결과 — 클라이언트가 conflict 로 분기해 안내 팝업을 띄운다. */
const CONFLICT_MESSAGE = '다른 곳에서 정보가 수정되어, 방금 저장은 반영되지 않았어요.'

export async function updateCaseInfoFields(
  caseId: string,
  input: CaseInfoInput,
  /**
   * 폼을 연 시점의 값(base). 주면 "그 사이 다른 곳에서 바뀐 칸"을 덮어쓰지 않도록
   * DB 최신값 위에 사용자가 바꾼 칸만 얹어 저장한다(= 바뀐 칸만 반영). 안 주면(구 호출)
   * 기존처럼 input 전체를 권위로 사용.
   */
  base?: CaseInfoInput,
): Promise<Result<CaseRow> | { ok: false; error: string; conflict: true }> {
  try {
    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: freshRow, error: fetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }
    const fresh = freshRow as CaseRow

    // ── (나) 바뀐 칸만 반영 ──
    // base(폼 연 시점 값)가 오면, DB 최신값(readForm) 위에 "사용자가 바꾼 칸"만 얹어
    // effective 를 만든다. 안 건드린 칸은 최신값을 그대로 유지 → 그 사이 다른 곳에서
    // 채운 항공편 등이 안 지워진다. 여정 소유 필드는 OWNED 에서 빠져 항상 최신값 유지.
    // base 가 없으면(구 호출) input 전체를 권위로 사용(기존 동작).
    let effective: CaseInfoInput
    if (base) {
      const current = readForm(fresh)
      // ── (가) 동시수정 충돌 감지 ──
      // 내가 바꾼 칸을, 폼을 연 사이 다른 곳에서 "다른 값"으로 바꿨으면 저장 거부.
      // current=DB 최신, base=폼 연 시점, input=내가 바꾼 값. 같은 값으로 바뀐 경우는
      // (current===input) 충돌 아님. 충돌이면 아무것도 쓰지 않고 그대로 반려한다.
      for (const key of OWNED_INFO_KEYS) {
        if (
          input[key] !== base[key] &&
          current[key] !== base[key] &&
          current[key] !== input[key]
        ) {
          return { ok: false, error: CONFLICT_MESSAGE, conflict: true }
        }
      }
      const merged: CaseInfoInput = { ...current }
      const sink = merged as unknown as Record<string, unknown>
      for (const key of OWNED_INFO_KEYS) {
        if (input[key] !== base[key]) sink[key] = input[key]
      }
      effective = merged
    } else {
      effective = input
    }

    // ── 검증 (최종 저장 상태 기준) ──
    for (const v of [
      effective.departure_date,
      effective.birth_date,
      effective.return_date,
      effective.jp_export_quarantine_date,
    ]) {
      if (v && !ISO_DATE_RE.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }
    // 출국일 ≤ 귀국일 — 둘 다 입력된 왕복 케이스에서만 검사. 논리적 불가능 조건이므로 저장 거부.
    if (
      effective.trip_type === 'round' &&
      effective.departure_date &&
      effective.return_date &&
      effective.return_date < effective.departure_date
    ) {
      return { ok: false, error: '귀국일은 출국일 이후여야 합니다.' }
    }
    let chip: string | null = null
    if (effective.microchip) {
      const digits = effective.microchip.replace(/\D/g, '')
      if (digits.length !== 15) {
        return { ok: false, error: '15자리 숫자를 입력하세요.' }
      }
      chip = digits
    }
    let weightNum: number | null = null
    if (effective.weight.trim()) {
      const n = Number(effective.weight)
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: '몸무게 형식이 올바르지 않습니다.' }
      }
      weightNum = n
    }

    const prev = (fresh.data ?? {}) as Record<string, unknown>
    // 일본 노선 — 출국일이 광견병 항체 검사일 + 180일 이전이면 저장 거부.
    // updateFlightFields 와 같은 정책 — 회복 경로 없는 위반만 hard 차단.
    {
      const entryErr = validateJpEntryDate(effective.departure_date.trim(), {
        data: prev,
        destination: effective.destination,
        departureDate: null,
      })
      if (entryErr) return { ok: false, error: entryErr }
    }
    let nextData: Record<string, unknown> = { ...prev }

    // 스코핑 필드(항공편·일본 수출검역)는 by_dest[활성토큰]에 저장 — readForm 과 동일 토큰으로
    // 해석(?dest 없으면 첫 토큰). 안 그러면 폼이 top-level 에 써 다중 목적지 여정(strict by_dest)이
    // 못 본다. 단일 목적지도 by_dest 로 통일(읽기 fallback 으로 정합).
    const infoToken = resolveWriteToken(effective.destination, prev, null)
    for (const key of INFO_DATA_KEYS) {
      const v = (effective[key] ?? '').trim()
      if (infoToken && isDestinationScopedKey(key)) {
        nextData = writeByDestValue(nextData, infoToken, key, v || null)
      } else if (v) {
        nextData[key] = v
      } else {
        delete nextData[key]
      }
    }

    // 영문 성·이름 분리 저장 + 합본 column 자동 갱신.
    // - 분리 입력이 하나라도 있으면 그게 권위 → data 에 분리 저장 + column 은 `${first} ${last}` 로 갱신
    //   (화면 표기·/apply·admin pdf-fill source 와 동일한 First Last 순서).
    // - 분리 입력이 모두 비면 customer_name_en (자유 입력 legacy 경로) 그대로 column 저장.
    const firstEn = (effective.customer_first_name_en ?? '').trim()
    const lastEn = (effective.customer_last_name_en ?? '').trim()
    let nameEnColumn: string | null
    if (firstEn || lastEn) {
      if (firstEn) nextData.customer_first_name_en = firstEn
      else delete nextData.customer_first_name_en
      if (lastEn) nextData.customer_last_name_en = lastEn
      else delete nextData.customer_last_name_en
      nameEnColumn = [firstEn, lastEn].filter(Boolean).join(' ').trim() || null
    } else {
      delete nextData.customer_first_name_en
      delete nextData.customer_last_name_en
      nameEnColumn = effective.customer_name_en.trim() || null
    }

    if (weightNum === null) delete nextData.weight
    else nextData.weight = weightNum

    // 동시 진행(co_progress)·왕복편도(trip_type)·destination 은 여정 소유라 OWNED 에서 제외 —
    // effective 가 항상 fresh(최신) 값을 유지하므로 이 폼 저장이 여정 action 결과를 덮지 않는다.
    // (useAnimalEditForm 은 여정 action 을 먼저 실행한 뒤 이 폼을 호출 → fresh 가 그 결과를 포함.)

    const { data: updated, error } = await admin
      .from('cases')
      .update({
        customer_name: effective.customer_name.trim(),
        customer_name_en: nameEnColumn,
        pet_name: effective.pet_name.trim() || null,
        pet_name_en: effective.pet_name_en.trim() || null,
        microchip: chip,
        destination: effective.destination.trim() || null,
        departure_date: effective.departure_date || null,
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
      return { ok: false, error: caseErr?.message ?? '여정을 찾을 수 없습니다.' }
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
