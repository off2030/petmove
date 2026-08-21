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

import { reportActionError } from './_shared'
import { cookies } from 'next/headers'
import { createAdminClient } from '@petmove/auth'
import { verifyPreviewToken } from '@petmove/auth/preview-token'
import { createClient, getCurrentUser } from '@petmove/auth/server'
import {
  emptyVaccineProductsData,
  computeAutoFill,
  JOURNEY_STEP_CATALOG,
  buildCaseJourneyContext,
  findRabiesChainBreak,
  rabiesChainBreakMessage,
  isDestinationScopedKey,
  normalizeRabiesOrder,
  parseDestinations,
  QUARANTINE_DONE_FIELD_KEYS,
  todayKst,
  validateEuEntryDate,
  validateEntryDateForDestination,
  validateHkEntryDate,
  validateIlEntryDate,
  validateJpEntryDate,
  validatePhEntryDate,
  validateThEntryDate,
  validateTwEntryDate,
  buildDateRuleContext,
  bookedRecordedAtKey,
  clearLegacyReportStatusForStep,
  isBookedStep,
  findDestinationKey,
  importPermitPrerequisiteError,
  resolveDatedStepField,
  resolveStepDateFields,
  validateRabiesDocRequiresTiter,
  validateImportQuarantineDate,
  validateUsDogEntryDate,
  writeByDestValue,
  writeJourneyFeedback,
  readByDestValue,
  SG_DOG_LICENCE_APP_SPEC,
  SG_QUARANTINE_RESERVATION_APP_SPEC,
  type ApplicationStepSpec,
  type CaseRow,
  type VaccineProductsData,
} from '@petmove/domain'
import { AVATAR_COLOR_IDS, type AvatarColorId } from '@/lib/avatar'
import { readForm } from '@/lib/cases/info-form'
import { rabiesSaveWorking, splitRabiesByDate } from '@/lib/journey/rabies-scheduled'
import { isFreeInputMode } from './profile'
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
    return { ok: false, error: reportActionError(e, 'cases.listMyCases') }
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
    return { ok: false, error: reportActionError(e, 'cases.getMyCase') }
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
    return { ok: false, error: reportActionError(e, 'cases.softDeleteMyCase') }
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
    return { ok: false, error: reportActionError(e, 'cases.updateCaseAvatar') }
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
    // 미래(예정) 시술일은 실제 기록(microchip_implant_date) 대신 별도 예정 자리로 — 펫무브워크엔
    // 실제로 한 시술만 남고, 미래 예약은 '예정 배지'로만 노출된다(종합백신·항체검사 1차와 동일).
    // 시술일은 광견병 after-microchip 검증의 기준점이라, 예정이 기준점이 되지 않게 분리가 중요.
    const micToday = todayKst()
    const micFuture = dt != null && dt > micToday
    if (micFuture) {
      nextData.microchip_implant_date_scheduled = dt
      delete nextData.microchip_implant_date
    } else {
      delete nextData.microchip_implant_date_scheduled
      if (dt === null) delete nextData.microchip_implant_date
      else nextData.microchip_implant_date = dt
    }
    // 실제(≤오늘) 시술일이 있으면 완료(true), 없으면 삭제. 미래는 위에서 예정 자리로 빠져 제외.
    applyDatedConfirm(nextData, !micFuture && dt ? [{ date: dt }] : [], 'microchip_confirmed')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ microchip: chip, data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateMicrochipFields') }
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
/**
 * 저장 시 확인 플래그 set/clear. 기록형(백신·검사·구충) 카드는 호출 측이 실제(≤오늘) 회차만
 * 넘기므로 true/삭제만 발생한다 — 완료 판정(done-resolver)은 플래그가 아닌 날짜 게이트가 담당하고,
 * true 는 옛 false sentinel 을 덮어 정리하는 역할. 검역 confirm 단계(applyQuarantine 계열)는
 * 미래 날짜도 넘겨 false(예정)가 나올 수 있다 — 그쪽 '예정→도래→완료 버튼' 모델의 현행 신호.
 */
function applyDatedConfirm(
  nextData: Record<string, unknown>,
  entries: unknown[],
  confirmKey: string,
): void {
  let latest = ''
  for (const r of entries) {
    const d =
      r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
        ? ((r as Record<string, unknown>).date as string)
        : ''
    if (d.length >= 10 && d > latest) latest = d
  }
  if (latest === '') delete nextData[confirmKey]
  else nextData[confirmKey] = latest <= todayKst()
}

/**
 * 회차 목록(종합백신·구충 등)의 미래(예정) 회차를 기록 배열에서 분리한다.
 * 과거/오늘 회차만 records 로 반환하고, 가장 늦은 미래일은 nextData[scheduledKey] 에 저장한다
 * (미래 회차 없으면 삭제). 미래 날짜를 "실제 기록"이 아니라 "별도 예정 자리"에 둠으로써,
 * 입력칸(회차 목록)은 실제 한 것만 보이고 미래는 예정 배지로만 표시된다 — "날짜는 차 있는데
 * 왜 완료 안 됨?" 혼동 제거. 단일 날짜 단계의 confirmed-마스킹과 같은 의도를 배열 단계에 적용.
 * 완료는 보호자가 실제(오늘/과거) 날짜를 저장할 때만 일어난다.
 */
function splitScheduledDoses(
  entries: Record<string, unknown>[],
  scheduledKey: string,
  nextData: Record<string, unknown>,
): Record<string, unknown>[] {
  const today = todayKst()
  const records: Record<string, unknown>[] = []
  let maxFuture = ''
  for (const e of entries) {
    const d = typeof e.date === 'string' ? e.date.slice(0, 10) : ''
    if (d && d > today) {
      if (d > maxFuture) maxFuture = d
    } else {
      records.push(e)
    }
  }
  if (maxFuture) nextData[scheduledKey] = maxFuture
  else delete nextData[scheduledKey]
  return records
}

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
    // 작업 세트 = 실제(rabies_dates) + 아직 미래인 예정(rabies_dates_scheduled). 회차 index 가
    // 논리적 1차/2차에 매핑되도록 합친 뷰 위에서 편집한 뒤, 저장 시 날짜로 다시 쪼갠다.
    const rabiesArr = rabiesSaveWorking(prev)
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
    if (index === 1 && hasValidDate(entry) && !hasValidDate(rabiesArr[0]) && !(await isFreeInputMode())) {
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

    // 날짜로 분리 — 실제(≤오늘)는 rabies_dates(운영자·PDF·완료판정이 보는 값), 미래(>오늘)
    // 계획은 rabies_dates_scheduled(고객 예정 배지·검증용). 펫무브워크엔 실제만 남는다.
    const { real, scheduled } = splitRabiesByDate(sorted)
    const nextData: Record<string, unknown> = { ...prev }
    if (real.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = real
    if (scheduled.length === 0) delete nextData.rabies_dates_scheduled
    else nextData.rabies_dates_scheduled = scheduled
    // 1·2차 확인 플래그는 실제 회차 기준 — 미래는 분리돼 제외되므로 false 가 안 나온다(마스킹
    // 무력화). done-resolver 는 실제 rabies_dates 만 보므로 미래 계획으로 완료가 풀리지 않는다.
    applyDatedConfirm(nextData, real[0] ? [real[0]] : [], 'rabies_1_confirmed')
    applyDatedConfirm(nextData, real[1] ? [real[1]] : [], 'rabies_2_confirmed')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateRabiesEntryFields') }
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
  /** 관리 시작 index — 일본 추가 2(3차+), 1회국 단일카드 0(1차+). */
  baseIndex: 0 | 1 | 2 = 2,
): Promise<Result<CaseRow>> {
  try {
    if (baseIndex !== 0 && baseIndex !== 1 && baseIndex !== 2) {
      return { ok: false, error: '잘못된 요청입니다.' }
    }
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
    // 작업 세트 = 실제(rabies_dates) + 아직 미래인 예정(rabies_dates_scheduled).
    // 폼(read 함수)도 같은 합본을 보여준다(2026-07-24 read-surface 전수 반영) — entries 가
    // 예정 회차까지 포함한 전체 목록이므로 슬롯 대응도 합본 기준, 별도 재합침은 하지 않는다
    // (예전 "폼=실제만 + 예정 따로 보존해 재합침" 모델이면 예정이 중복 주입된다).
    const rabiesArr = rabiesSaveWorking(prev)
    const preserved = rabiesArr.slice(0, baseIndex)
    const prevExtras = rabiesArr.slice(baseIndex)

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

    // 보존(1·2차 등) + 폼의 전체 목록(실제+예정) → 날짜순 정규화(체인 검증·분리가
    // 날짜 순서를 전제). 미래 계획도 체인 검증에 포함되어 '2차가 너무 늦다' 등 경고를 받는다.
    const rabiesNext = normalizeRabiesOrder(
      [...preserved, ...newExtras].filter(hasValidDate) as Array<
        Record<string, unknown> & { date?: string | null }
      >,
    ) as unknown[]

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
        error: rabiesChainBreakMessage(chainBreak),
      }
    }

    // 날짜로 분리 — 실제(≤오늘)는 rabies_dates(운영자·PDF·완료판정), 미래(>오늘) 계획은
    // rabies_dates_scheduled(고객 예정 배지·검증용). 펫무브워크엔 실제로 한 접종만 남는다.
    const { real, scheduled } = splitRabiesByDate(rabiesNext)
    const nextData: Record<string, unknown> = { ...prev }
    if (real.length === 0) delete nextData.rabies_dates
    else nextData.rabies_dates = real
    if (scheduled.length === 0) delete nextData.rabies_dates_scheduled
    else nextData.rabies_dates_scheduled = scheduled

    // 추가 확인 플래그 — 실제 추가 회차가 있으면 완료(true), 없으면 제거. 미래는 분리돼 false 가
    // 안 나온다(마스킹 무력화). done-resolver(has-extra-rabies)는 실제만 보므로 회귀 없음.
    if (real.slice(baseIndex).length === 0) delete nextData.rabies_extra_confirmed
    else nextData.rabies_extra_confirmed = true

    // 1회 접종국 단일카드(baseIndex 0) — has-rabies-valid 가 rabies_single_confirmed 로 판정. 실제
    // 회차 기준(미래 분리됨). 2회국 1차(rabies_1_confirmed)와 별도 키 — 다중 목적지(일본+태국)에서
    // 단일카드 저장이 2회국 1차 완료를 덮어쓰지 않도록 분리.
    if (baseIndex === 0) {
      applyDatedConfirm(nextData, real, 'rabies_single_confirmed')
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
    return { ok: false, error: reportActionError(e, 'cases.updateRabiesExtraEntries') }
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
    // 미래(예정) 채혈일은 실제 검사 기록 대신 별도 예정 자리로 — 입력칸 비움 + 예정 배지.
    // 도래해도 '검사 진행 중'으로 안 잡히고, 지나면 배지만 사라진다(원래 상태). 실제 검사는
    // 보호자가 오늘/과거 채혈일로 저장할 때만 기록되어 2스텝(진행중 → 결과/완료)이 시작된다.
    const titerToday = todayKst()
    const titerEntryDate = typeof entry.date === 'string' ? (entry.date as string).slice(0, 10) : ''
    if (titerEntryDate && titerEntryDate > titerToday) {
      nextData.rabies_titer_scheduled = titerEntryDate
      delete entry.date
    } else {
      delete nextData.rabies_titer_scheduled
    }
    arr[0] = entry
    // index-0(1회차) 이 유효 채혈일(또는 예정 채혈)을 잃으면 빈 shell 로 남기지 않고 압축한다.
    // 남기면: 검사기관만 선택된 채 채혈일이 비어 보이고, 뒤(2회차+) 의 유효 기록이 그 shell
    // 뒤에 갇혀 '광견병 항체 검사 일정' 주의를 계속 띄우면서도 이 화면에선 못 지우는 유령 상태가
    // 된다. 단, 예정(rabies_titer_scheduled) 채혈은 도래 전까지 lab/value 를 보존해야 하므로
    // shell 을 유지한다.
    const titerScheduled =
      typeof nextData.rabies_titer_scheduled === 'string' &&
      (nextData.rabies_titer_scheduled as string).length >= 10
    if (!hasValidDate(entry) && !titerScheduled) {
      const compact = arr.filter((r) => hasValidDate(r))
      if (compact.length === 0) delete nextData.rabies_titer_records
      else nextData.rabies_titer_records = compact
    } else {
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
    return { ok: false, error: reportActionError(e, 'cases.updateTiterFields') }
  }
}

/**
 * 전염병 검사 step 의 '결과 확인 완료' 플래그(infectious_disease_confirmed=true) 를
 * set — 보호자가 detail 하단의 '완료' 버튼을 누를 때 호출(2026-07-30 사용자 결정 A).
 *
 * 왜 2단계인가: 이 검사는 해외 공인 검사기관에 보내야 하고 결과가 음성이어야 다음으로 갈 수
 * 있다. 채혈만으로 완료 처리하면 결과 대기 중인데 카드가 끝난 것처럼 보인다.
 * 광견병 항체 검사(markTiterResultConfirmed)와 **같은 모델**이다.
 *
 * 검사일이 하나라도 도래(≤오늘)해 있어야 set — 없으면 의미가 없어 거부한다.
 * ⚠️ 플래그는 **전역**이다(scoped 아님) — infectious_disease_records 자체가 전역 필드라
 *   짝을 맞췄다. 한쪽만 scoped 로 만들면 기록은 공유되는데 확인은 목적지별로 갈린다.
 */
export async function markInfectiousDiseaseResultConfirmed(
  caseId: string,
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const writeDest = resolveWriteToken(
      (existing as { destination: string | null }).destination,
      prev,
      destination,
    )
    const scopedRecords = writeDest
      ? readByDestValue(prev, writeDest, 'infectious_disease_records')
      : undefined
    const arr = (Array.isArray(scopedRecords)
      ? scopedRecords
      : Array.isArray(prev.infectious_disease_records)
        ? prev.infectious_disease_records
        : []) as Array<Record<string, unknown>>
    const today = todayKst()
    const hasArrived = arr.some(
      (r) =>
        r &&
        typeof r.date === 'string' &&
        (r.date as string).length >= 10 &&
        (r.date as string).slice(0, 10) <= today,
    )
    if (!hasArrived) {
      return { ok: false, error: '검사일이 입력되어 있지 않습니다.' }
    }
    // 확인 플래그도 **목적지별**(2026-07-30) — 검사 항목이 나라마다 달라, 호주용으로 3종만
    //   받고 확인한 게 뉴질랜드 여정에서 '완료'로 보이면 안 된다.
    let nextData: Record<string, unknown> = { ...prev }
    if (writeDest) {
      nextData = writeByDestValue(nextData, writeDest, 'infectious_disease_confirmed', true)
      delete nextData.infectious_disease_confirmed
    } else {
      nextData.infectious_disease_confirmed = true // scoping-fallback-ok: 목적지 미상
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
    return { ok: false, error: reportActionError(e, 'cases.markInfectiousDiseaseResultConfirmed') }
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
    return { ok: false, error: reportActionError(e, 'cases.markTiterResultConfirmed') }
  }
}

/**
 * 추가 항체 검사(2회차+) 의 '결과 확인 완료' 플래그(titer_extra_result_confirmed=true) 를 set —
 * 1회차 markTiterResultConfirmed 와 동일 모델(결과 수치를 직접 입력하는 대신 '완료' 클릭).
 * 추가 채혈일(index 1+)이 입력돼 있어야 set (없으면 의미 없음 → 거부).
 *
 * done-resolver(has-extra-titer)가 이 플래그 또는 최신 추가 회차의 결과값(value) 둘 중
 * 하나면 완료로 판정한다. 채혈일이 바뀌면 updateTiterExtraEntries 가 플래그를 해제.
 */
export async function markExtraTiterResultConfirmed(caseId: string): Promise<Result<CaseRow>> {
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
    const hasExtraDate = arr
      .slice(1)
      .some((r) => !!r && typeof r.date === 'string' && (r.date as string).length >= 10)
    if (!hasExtraDate) {
      return { ok: false, error: '추가 검사 채혈일이 입력되어 있지 않습니다.' }
    }
    const nextData: Record<string, unknown> = { ...prev, titer_extra_result_confirmed: true }

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.markExtraTiterResultConfirmed') }
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
  entries: Array<{
    date: string | null
    lab: string | null
    value: string | null
    /** 검체가 검사기관에 접수된 날 — 호주·괌·하와이의 대기 일수 기준일(선택 입력). */
    received_date?: string | null
  }>,
  /**
   * entries 가 배열의 몇 번째부터인가.
   *  - 1 (기본): '추가 검사' 별도 카드 — index 0(1회차)은 본 카드 소관이라 보존한다.
   *  - 0: 본 검사 카드가 목록을 통째로 다루는 목적지(일본·대만 외). 예전엔 이 경로가 없어
   *       본 카드가 index 0 한 칸만 편집했고, 재검사를 넣으면 이전 기록을 덮어썼다.
   */
  startIndex: 0 | 1 = 1,
): Promise<Result<CaseRow>> {
  try {
    for (const e of entries) {
      for (const v of [e.date, (e as { received_date?: string | null }).received_date]) {
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
    const arr = Array.isArray(prev.rabies_titer_records)
      ? [...(prev.rabies_titer_records as unknown[])]
      : []
    const preserved = arr.slice(0, startIndex)
    const prevExtras = arr.slice(startIndex)

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

      // 검체 도착일 — 선택 입력. 비우면 키를 지워 채혈일 fallback 으로 돌아간다.
      //   (예전엔 비관리 키라 머지로만 보존됐고, 앱에서 지울 방법이 없었다.)
      const rd = typeof fields.received_date === 'string' ? fields.received_date.trim() : ''
      if (rd) entry.received_date = rd
      else delete entry.received_date

      // date 없는 entry 는 의미 없는 잔여물 — drop (lab/value 만 남는 phantom 방지).
      if (!hasValidDate(entry)) continue
      newExtras.push(entry)
    }

    const nextData: Record<string, unknown> = { ...prev }
    // 본 카드 통째 관리(startIndex 0)에서 **1회차(첫 슬롯)의 미래 채혈은 1회차 예정 키**
    // (rabies_titer_scheduled)로 — updateTiterFields(1회차 전용 액션)와 동일 모델. 예전엔 전부
    // 아래 extra 예정 키로 가서, 예정 배지(scenario 는 rabies_titer_scheduled 만 읽음)도 안 뜨고
    // 입력칸도 비어 "저장하면 날짜가 사라지는" 증상이 됐다(2026-07-24 그리스·싱가포르 발견).
    // 검사기관(lab)·결과(value)는 도래 전까지 shell 로 보존(1회차 액션과 동일).
    let firstShell: Record<string, unknown> | null = null
    let extrasForSplit = newExtras
    if (startIndex === 0) {
      const first = newExtras[0]
      const fd =
        first && typeof first.date === 'string' ? (first.date as string).slice(0, 10) : ''
      if (fd && fd > todayKst()) {
        nextData.rabies_titer_scheduled = fd
        const shell = { ...first }
        delete shell.date
        firstShell = Object.keys(shell).length > 0 ? shell : null
        extrasForSplit = newExtras.slice(1)
      } else {
        delete nextData.rabies_titer_scheduled
      }
    }
    // 미래(예정) 추가 채혈은 실제 기록(rabies_titer_records)에서 빼 별도 예정 자리로 — 펫무브워크엔
    // 실제로 한 검사만 남고, 미래 예약은 예정 배지로만(종합백신·항체검사 1차와 동일).
    const pastExtras = splitScheduledDoses(extrasForSplit, 'rabies_titer_extra_scheduled', nextData)
    const titerNext: unknown[] = [
      ...preserved,
      ...(firstShell ? [firstShell] : []),
      ...pastExtras,
    ]
    // 뒤쪽 phantom(날짜 없는 잔여물) 압축 — 단 1회차 예정 shell(맨 앞)은 보존.
    while (
      titerNext.length > (firstShell ? 1 : 0) &&
      !hasValidDate(titerNext[titerNext.length - 1])
    ) {
      titerNext.pop()
    }
    if (titerNext.length === 0) delete nextData.rabies_titer_records
    else nextData.rabies_titer_records = titerNext

    // 추가 검사(2회+) 확인 플래그 — 실제(≤오늘) 추가 채혈이 있으면 완료(true), 없으면 제거.
    // 미래는 위에서 예정 자리로 빠져 제외되므로 false 가 나오지 않는다(마스킹 자동 무력화).
    if (titerNext.slice(1).length === 0) delete nextData.titer_extra_confirmed
    else nextData.titer_extra_confirmed = true

    // 최신 추가 채혈일이 바뀌거나 사라지면 '결과 확인 완료' 플래그 해제 — 이전 검사의 완료가
    // 새 검사에 그대로 적용되지 않도록. 1회차(rabies_titer_result_confirmed)와 동일 안전장치.
    const latestExtraDate = (rows: unknown[]): string => {
      let max = ''
      for (const r of rows.slice(1)) {
        const d =
          r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
            ? ((r as Record<string, unknown>).date as string)
            : ''
        if (d.length >= 10 && d > max) max = d
      }
      return max
    }
    if (latestExtraDate(titerNext) !== latestExtraDate(arr)) {
      delete nextData.titer_extra_result_confirmed
    }
    // 본 카드가 목록을 통째로 다루는 경우(startIndex 0) 1회차도 여기서 바뀔 수 있다 —
    // 채혈일이 달라지면 이전 검사의 '결과 확인 완료'가 새 검사에 그대로 남지 않도록 해제.
    // (별도 카드 경로에서는 index 0 을 건드리지 않으므로 해당 없음.)
    if (startIndex === 0) {
      const firstDate = (rows: unknown[]): string => {
        const r = rows[0]
        return r && typeof r === 'object' && typeof (r as Record<string, unknown>).date === 'string'
          ? ((r as Record<string, unknown>).date as string)
          : ''
      }
      if (firstDate(titerNext) !== firstDate(arr)) {
        delete nextData.rabies_titer_result_confirmed
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
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateTiterExtraEntries') }
  }
}

/** 항공권 구매 step 이 다루는 case.data 평탄 키 — 출국 4 + 귀국 4. */
const FLIGHT_DATA_KEYS = [
  'entry_date',
  'entry_time',
  'entry_departure_airport',
  'entry_airport',
  'entry_flight_number',
  'entry_transport',
  'return_date',
  'return_departure_airport',
  'return_arrival_airport',
  'return_flight_number',
  'return_transport',
  // 귀국 항공권 '미정' 플래그('1'/없음) — 왕복인데 귀국편 미정 시 출국 일정만으로 완료 인정.
  // 다른 항공권 키와 동일 저장 경로(by_dest/top-level)·flatten 을 타도록 같이 둔다.
  'return_undecided',
] as const

/**
 * 일본 legacy 출발일 fallback(japan_extra.inbound.date) 제거 — 출국일을 비울 때 호출.
 * departure_flight_date 의 read fallback 이라 남아 있으면 auto-fill sync 가 출국일을 되살린다.
 */
function clearLegacyInboundDate(data: Record<string, unknown>): void {
  const jx = data.japan_extra
  if (jx && typeof jx === 'object') {
    const inbound = (jx as Record<string, unknown>).inbound
    if (inbound && typeof inbound === 'object') delete (inbound as Record<string, unknown>).date
  }
}

/**
 * 항공권 구매 step 의 입력 필드를 patch — case.data 의 entry_* / return_* 평탄 키
 * (정보 탭 항공권 섹션·펫무브워크 추가정보와 동일 키)를 갱신.
 *
 * 빈 값은 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 * 편도 케이스도 귀국 키를 그대로 보내며(미편집이라 값 불변), 빈 값이면 제거된다.
 */
export async function updateFlightFields(
  caseId: string,
  // departure_date(출발일)는 FLIGHT_DATA_KEYS 가 아닌 별도 — 단일=컬럼/다중=by_dest 로 특수 저장.
  // 태국 항공권 카드처럼 출발일을 따로 입력하는 경우만 넘긴다. 미지정이면 기존대로 entry_date 동기화.
  fields: Record<(typeof FLIGHT_DATA_KEYS)[number], string | null> & {
    departure_date?: string | null
  },
  /** 다중 목적지 케이스에서 활성 목적지 토큰 — 지정 + 다중이면 항공권/출국일을 by_dest 에 분리 저장. */
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    for (const key of ['entry_date', 'departure_date', 'return_date'] as const) {
      const v = fields[key]
      if (v != null && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
    }
    {
      const t = typeof fields.entry_time === 'string' ? fields.entry_time.trim() : ''
      if (t && !/^\d{2}:\d{2}$/.test(t)) {
        return { ok: false, error: '시간 형식은 HH:mm 여야 합니다.' }
      }
    }
    // (출국 ≤ 귀국 검증은 tripType 을 알아야 해서 fetch 후로 이동 — 편도는 잔존 귀국일 무시.)
    // 귀국일이 입력돼 있으면 '미정' 플래그는 무의미 — 서버에서도 강제 해제(상호배타). 클라이언트가
    // 이미 비우지만, 직접 호출·레이스 대비로 한 번 더 정규화한다.
    if (typeof fields.return_date === 'string' && fields.return_date.trim().length > 0) {
      fields = { ...fields, return_undecided: '' }
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      // org_id 는 auto-fill 룰(computeAutoFill pending 스냅샷) 조회용.
      .select('data, destination, org_id')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const caseOrgId = (existing as { org_id: string }).org_id

    // 다중 목적지 + 활성 목적지 지정 → 항공권 필드 + 출국일을 by_dest[destination] 에 분리 저장.
    // 부수효과(departure_date 컬럼 sync·auto-fill)는 by_dest 경로에선 스킵 — admin updateCaseField
    // 와 동일. 컬럼은 단일값이라 다중 목적지를 못 담고, flatten 이 by_dest[dest].departure_date 를
    // 우선 읽어 has-flight-date·D-day 가 목적지별로 작동한다.
    const caseDestStr = (existing as { destination: string | null }).destination
    const isSingleDest = parseDestinations(caseDestStr).length === 1
    // 일본은 출국일(departure_date)이 departure_flight_date 와 양방향 sync — 출국일 쓸 때 이 키도
    // 함께 맞춰야 stale 잔존이 출국일을 되살리지 않는다. (Japan 한정 — 다른 목적지엔 이 키 없음.)
    const flightCtx = buildCaseJourneyContext(
      { destination: caseDestStr ?? null, data: prev } as CaseRow,
      destination ?? null,
    )
    const isJapanFlight = flightCtx.destinationKey === 'japan'
    // 미국 강아지 생후 6개월 규칙은 항공권 저장의 서버 backstop 에도 적용한다. 클라이언트
    // 가드를 우회해도 같은 도메인 함수가 거부한다. 다른 목적지는 기존 서버 정책을 유지한다.
    if (flightCtx.destinationKey === 'usa' && !(await isFreeInputMode())) {
      const entry = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      const explicitDep =
        typeof fields.departure_date === 'string' ? fields.departure_date.trim() : ''
      const currentCtx = buildDateRuleContext(
        { destination: caseDestStr ?? null, data: prev } as CaseRow,
        destination ?? null,
      )
      const proposedData: Record<string, unknown> = {
        ...currentCtx.data,
        ...fields,
        entry_date: entry || null,
        departure_flight_date: explicitDep || entry || null,
      }
      const validationError = validateEntryDateForDestination(entry, explicitDep, {
        ...currentCtx,
        data: proposedData,
        departureDate: explicitDep || entry || null,
      })
      if (validationError) return { ok: false, error: validationError }
    }
    // 출국 ≤ 귀국 — 왕복에서만 검사. 편도는 귀국 leg 가 없어, 왕복에서 전환되며 남은 잔존
    // 귀국일을 무시한다. updateCaseInfoFields 의 trip_type==='round' 가드와 동일 패턴.
    if (flightCtx.tripType === 'round') {
      const entry = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      const ret = typeof fields.return_date === 'string' ? fields.return_date.trim() : ''
      if (entry && ret && ret < entry && !(await isFreeInputMode())) {
        return { ok: false, error: '귀국 항공편 날짜가 출국 항공편 날짜보다 빨라요. 날짜를 확인하세요.' }
      }
    }
    // 출발일 ≤ 도착일 — 태국·필리핀·EU 패밀리처럼 출발일(departure_date)·도착일(entry_date)을
    // 둘 다 따로 입력받는 목적지에서, 도착일이 출발일보다 빠른 논리적 불가능 조합을 차단.
    // 둘 다 입력됐을 때만 비교(한쪽만 있으면 비교 불가라 통과). client(step-detail-view)와 동일 규칙.
    {
      const explicitDep = typeof fields.departure_date === 'string' ? fields.departure_date.trim() : ''
      const entry = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      if (explicitDep && entry && entry < explicitDep && !(await isFreeInputMode())) {
        return { ok: false, error: '도착일이 출발일보다 빨라요. 날짜를 확인하세요.' }
      }
    }
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
      // 출발일 = 명시적 departure_date 우선, 없으면 entry_date 동기화(일본 등 후방호환).
      const entryDate = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
      const explicitDep = typeof fields.departure_date === 'string' ? fields.departure_date.trim() : ''
      const departureCol = explicitDep || entryDate
      merged = writeByDestValue(merged, writeDest, 'departure_date', departureCol || null)
      // 일본: departure_flight_date 를 출국일과 항상 동일하게 맞춘다(변경·삭제 모두). auto-fill 은 빈
      // source 를 무시·채우기만 하므로, 안 맞추면 stale 한 departure_flight_date 가 양방향 sync 로
      // 출국일을 되살려 D-day 가 안 바뀐다. top-level/legacy fallback 도 정리.
      if (isJapanFlight) {
        merged = writeByDestValue(merged, writeDest, 'departure_flight_date', departureCol || null)
        delete merged.departure_flight_date // top-level 잔존 제거(by_dest 우선)
        clearLegacyInboundDate(merged)
      }

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
          merged.flight_info_recorded_at = new Date().toISOString().slice(0, 10) // scoping-fallback-ok: isSingleDest 가드 — 단일 목적지만 top-level
        } else if (!hasAnyFlightInfo) {
          delete merged.flight_info_recorded_at
        }
        updatePayload.departure_date = departureCol || null
      }

      // 단일 목적지: 출국일 변경 시 org_auto_fill_rules(일본 departure↔departure_flight_date sync 등)를
      // by_dest 경로로 적용 — top-level 경로와 동일. 커밋 전 pending 스냅샷으로 계산해 아래
      // 단일 UPDATE 에 합산(엔진 자체 SELECT/UPDATE 제거 — P1 #8).
      if (isSingleDest) {
        try {
          const computed = await computeAutoFill(admin, caseId, 'departure_date', writeDest, {
            orgId: caseOrgId,
            destination: caseDestStr ?? null,
            departureDate: departureCol || null,
            data: merged,
          })
          if (computed.ok && computed.changed) {
            updatePayload.data = computed.data
            Object.assign(updatePayload, computed.columns)
          }
        } catch { /* best-effort — 실패 시 자동채움 없이 본 저장만 */ }
      }

      // 단일 UPDATE + returning — 종전 UPDATE 후 refetch SELECT 를 합침.
      const { data: updated, error: updErr } = await admin
        .from('cases')
        .update(updatePayload)
        .eq('id', caseId)
        .select('*')
        .single()
      if (updErr) return { ok: false, error: updErr.message }
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
      nextData.flight_info_recorded_at = new Date().toISOString().slice(0, 10) // scoping-fallback-ok: writeDest 없음(목적지 미해석) 폴백
    } else if (!hasAnyFlightInfo) {
      delete nextData.flight_info_recorded_at
    }

    // 출발일(departure_date) 컬럼 = 명시적 departure_date 우선, 없으면 entry_date 동기화.
    // 태국 등 출발일 별도 입력 케이스는 entry_date(도착일)와 다른 날일 수 있어 명시값을 쓴다.
    // (일본 등 미지정 케이스는 종전대로 entry_date 동기화 — 후방호환.) 모두 비면 null 로 비워
    // journey 체크의 entry_date||departure_date 폴백이 유령 출국일을 잡지 않게 한다.
    const entryDate = typeof fields.entry_date === 'string' ? fields.entry_date.trim() : ''
    const explicitDep = typeof fields.departure_date === 'string' ? fields.departure_date.trim() : ''
    const departureCol = explicitDep || entryDate
    // 일본: departure_flight_date 를 출국일과 항상 동일하게 맞춘다(변경·삭제 모두) — by_dest 경로와 동일.
    // 안 맞추면 stale 한 값이 양방향 sync 로 departure_date 컬럼을 되살린다.
    if (isJapanFlight) {
      if (departureCol) nextData.departure_flight_date = departureCol // scoping-fallback-ok: writeDest 없음(목적지 미해석) 폴백
      else delete nextData.departure_flight_date
      clearLegacyInboundDate(nextData)
    }
    const updatePayload: Record<string, unknown> = {
      data: nextData,
      departure_date: departureCol || null,
    }

    // departure_date 가 갱신되면 org_auto_fill_rules 트리거 — 일본의 경우
    // departure_date → departure_flight_date 양방향 sync 룰이 fire 해 출국 항공편 그룹의
    // 출발일이 자동 채워짐. admin 의 updateCaseField 와 동일. 커밋 전 pending 스냅샷으로
    // 계산해 아래 단일 UPDATE 에 합산(엔진 자체 SELECT/UPDATE 제거 — P1 #8).
    try {
      const computed = await computeAutoFill(admin, caseId, 'departure_date', null, {
        orgId: caseOrgId,
        destination: caseDestStr ?? null,
        departureDate: departureCol || null,
        data: nextData,
      })
      if (computed.ok && computed.changed) {
        updatePayload.data = computed.data
        Object.assign(updatePayload, computed.columns)
      }
    } catch { /* best-effort — 실패 시 자동채움 없이 본 저장만 */ }

    // 단일 UPDATE + returning — 종전 UPDATE 후 refetch SELECT 를 합침.
    const { data: updated, error } = await admin
      .from('cases')
      .update(updatePayload)
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateFlightFields') }
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
    if (!destToken) return { ok: false, error: '여행지가 설정되지 않은 여정입니다.' }

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
    return { ok: false, error: reportActionError(e, 'cases.updateCaseTripType') }
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
    clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.markAdvanceNotificationApprovalSkipped') }
  }
}

/**
 * 사전 신고 '진행 중' — 보호자가 신고 후 '진행 중' 버튼을 눌러 확인. 신청일이 도래(≤오늘)했어도
 * 이 플래그 전엔 '예정'으로 취급(situational/배너 분기). 신청일이 있어야 의미가 있음 — 미입력 시 노옵.
 * 완료(skip)와 별개 단계라 done 으로 만들지 않는다. 일본 단일 단계라 플래그는 전역(top-level).
 */
export async function markAdvanceNotificationInProgress(
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
      typeof prev.advance_notification_date !== 'string' ||
      (prev.advance_notification_date as string).length < 10
    ) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    const nextData: Record<string, unknown> = {
      ...prev,
      advance_notification_in_progress: true,
    }
    // 운영자 수동 stored 값보다 보호자의 적극적 입력을 우선 — derive 모드로 전환(date-patch 와 동일).
    clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.markAdvanceNotificationInProgress') }
  }
}

export async function markJpExportQuarantineReservationSkipped(
  caseId: string,
  /** 활성 목적지 토큰 — 신청일을 by_dest[destination] 에서 읽어 가드한다(저장은 by_dest). */
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    // 신청일은 by_dest(활성 목적지) 우선, 마이그 전 top-level 폴백 — updateJpExportQuarantineFields 와 동일.
    const token = resolveWriteToken(existing?.destination, prev, destination)
    const appliedRaw = readByDestValue(prev, token, 'jp_export_quarantine_application_date')
    const applied =
      typeof appliedRaw === 'string' && appliedRaw.length >= 10
        ? appliedRaw
        : typeof prev.jp_export_quarantine_application_date === 'string'
          ? prev.jp_export_quarantine_application_date
          : ''
    if (applied.length < 10) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    const nextData: Record<string, unknown> = {
      ...prev,
      jp_export_quarantine_reservation_skipped: true,
    }
    // 완료 시그널 — admin demote 상태를 자동 해제.
    delete nextData.jp_export_quarantine_admin_demoted_at
    // stored 클리어해 derive 모드 전환.
    clearLegacyReportStatusForStep(nextData, 'jp-export-quarantine', 'export')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.markJpExportQuarantineReservationSkipped') }
  }
}

/**
 * 일본 수출검역 신청 '진행 중' — 사전 신고와 동일 모델(예약 확정 전 단계). 신청일이 있어야 의미가
 * 있음(by_dest 우선 읽기). 플래그는 reservation_skipped 와 동일하게 일본 단일 단계라 전역.
 */
export async function markJpExportQuarantineInProgress(
  caseId: string,
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const token = resolveWriteToken(existing?.destination, prev, destination)
    const appliedRaw = readByDestValue(prev, token, 'jp_export_quarantine_application_date')
    const applied =
      typeof appliedRaw === 'string' && appliedRaw.length >= 10
        ? appliedRaw
        : typeof prev.jp_export_quarantine_application_date === 'string'
          ? prev.jp_export_quarantine_application_date
          : ''
    if (applied.length < 10) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    const nextData: Record<string, unknown> = {
      ...prev,
      jp_export_quarantine_in_progress: true,
    }
    clearLegacyReportStatusForStep(nextData, 'jp-export-quarantine', 'export')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.markJpExportQuarantineInProgress') }
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
    if (v !== prevDate) {
      delete nextData.advance_notification_approval_skipped
      // 신청일이 바뀌면 '진행 중' 확인도 해제 — 새 신청일은 '예정'부터 다시 시작.
      delete nextData.advance_notification_in_progress
    }
    // 신고탭 stored 값을 클리어해 derive 모드로 전환 — portal 보호자의 적극적 입력이
    // 운영자의 기존 수동 상태보다 우선시되도록. 액션이 일어난 케이스만 영향.
    clearLegacyReportStatusForStep(nextData, 'advance-notification', 'import')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateAdvanceNotificationDate') }
  }
}

/**
 * 내원·임상검진 step 의 검진일을 patch — case.data.vet_visit_date (YYYY-MM-DD).
 * 빈/null 이면 키 제거. data 의 다른 키는 fetch-merge 로 보존.
 */
export async function updateVetVisitDate(
  caseId: string,
  date: string | null,
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
    // 활성 목적지 토큰을 읽기(flatten)와 동일하게 해석 — destination 미지정(대부분 진입로가 ?dest= 없이
    // 들어옴)이어도 다중 목적지면 첫 토큰으로 resolve 해 by_dest 에 저장한다. top-level 에 쓰면 다중
    // 목적지 read(strict flatten)가 그 값을 떨궈 검진일이 즉시 증발한다(검역·허가·항공편과 동일한
    // resolveWriteToken 패턴 — 바로 아래 resolveWriteToken 주석 참조).
    const writeDest = resolveWriteToken(
      (existing as { destination: string | null }).destination,
      prev,
      destination,
    )
    if (writeDest) {
      // 미래(예정) 검진일은 실제 검진일(by_dest)에 안 쓰고 별도 예정 자리(top-level)로 — 펫무브워크엔
      // 실제로 본 검진만 남고, 미래 예약은 '예정 배지'로만(종합백신·항체검사 1차와 동일).
      const vvFuture = !!v && v > todayKst()
      let nextData = writeByDestValue(prev, writeDest, 'vet_visit_date', vvFuture ? null : v || null)
      // 예정(미래) 내원일도 목적지별(by_dest) — 실제 내원일과 같은 분리 원칙. 다중 목적지에서
      // 한 나라 예정이 다른 나라로 새지 않게. read 는 flatten 이 surface(scenario.ts).
      nextData = writeByDestValue(nextData, writeDest, 'vet_visit_date_scheduled', vvFuture ? v : null)
      // vet_visit_confirmed 는 공용(top-level) 플래그 — 실제(≤오늘) 검진일만 완료로.
      applyDatedConfirm(nextData, !vvFuture && v ? [{ date: v }] : [], 'vet_visit_confirmed')
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
    // 여기는 writeDest=null(목적지 자체가 없는 케이스)만 도달하는 top-level 폴백 — 위 resolveWriteToken
    // 이 단일·다중 목적지를 모두 토큰으로 해석해 by_dest 로 보내므로, 다중 목적지가 이 경로로 새지 않는다.
    const nextData: Record<string, unknown> = { ...prev }
    const vvFuture = !!v && v > todayKst()
    if (vvFuture) {
      nextData.vet_visit_date_scheduled = v // scoping-fallback-ok: writeDest 없음(목적지 없는 케이스) 폴백
      delete nextData.vet_visit_date
    } else {
      delete nextData.vet_visit_date_scheduled
      if (v) nextData.vet_visit_date = v // scoping-fallback-ok: writeDest 없음(목적지 없는 케이스) 폴백
      else delete nextData.vet_visit_date
    }
    // 실제(≤오늘) 검진일만 완료로. 미래는 위에서 예정 자리로 빠져 제외.
    applyDatedConfirm(nextData, !vvFuture && v ? [{ date: v }] : [], 'vet_visit_confirmed') // scoping-fallback-ok

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateVetVisitDate') }
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
    return { ok: false, error: reportActionError(e, 'cases.updateKrExportQuarantineDate') }
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
    return { ok: false, error: reportActionError(e, 'cases.updateJpImportQuarantineDate') }
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
    // 허용 필드 = 카탈로그 done 선언(quarantine:<field>) 단일 출처 — base + 목적지 override.
    // 예전엔 손으로 쓴 정규식(검역일 패턴 + 아일랜드 예외 1개)이라, 이후 같은 confirm 모델로
    // 만든 카드(하와이 입국 신청·필리핀 현지 병원·노르웨이/키프로스/몰타 사전 통지·이스라엘
    // 사전 통보)가 명단 누락으로 저장이 전부 거부됐다(2026-07-25 발견). 이제 카탈로그에
    // 카드를 선언하면 자동 허용된다(임의 키 쓰기 차단은 그대로).
    if (!QUARANTINE_DONE_FIELD_KEYS.has(fieldKey)) {
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
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const v = typeof date === 'string' ? date.trim() : ''
    if (fieldKey.startsWith('us_')) {
      if (buildCaseJourneyContext(existing as CaseRow, destination).destinationKey !== 'usa') {
        return { ok: false, error: '미국 여정에서만 저장할 수 있는 필드입니다.' }
      }
      // us_export_quarantine_date 는 버튼 완료 카드로 전환돼(2026-07-26) 이 confirm 액션의
      // 허용 명단(quarantine: done)에서 자동으로 빠졌다 — 남은 건 수입검역일뿐.
      if (v) {
        const ctx = buildDateRuleContext(existing as CaseRow, destination)
        const validationError = validateImportQuarantineDate(v, ctx)
        if (validationError) return { ok: false, error: validationError }
      }
    }
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
    return { ok: false, error: reportActionError(e, 'cases.updateImportQuarantineDate') }
  }
}

/**
 * 수입 허가 step(import-permit)의 신청일·허가 번호를 patch — 태국·호주 등 허가 필요국 공용.
 * 두 키 모두 destination-scoped(by_dest) — 목적지마다 허가를 따로 받는다.
 * 신청일이 바뀌면 '완료 처리(skip)' 플래그를 해제 — 사전 신고(updateAdvanceNotificationDate)와
 * 동일 정책. 신청 마감(태국 7영업일) 도메인 차단은 client(입력 불가)·procedure-check(주의)가
 * 담당 — server 는 형식만.
 */
export async function updateImportPermitFields(
  caseId: string,
  fields: { application_date: string | null; permit_no: string | null },
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    const v = typeof fields.application_date === 'string' ? fields.application_date.trim() : ''
    if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
    }
    const permitNo = typeof fields.permit_no === 'string' ? fields.permit_no.trim() : ''

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
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      const prevFiledRaw = readByDestValue(prev, token, 'import_permit_application_date')
      const prevFiled = typeof prevFiledRaw === 'string' ? prevFiledRaw : ''
      nextData = writeByDestValue(nextData, token, 'import_permit_application_date', v || null)
      nextData = writeByDestValue(nextData, token, 'permit_no', permitNo || null)
      // 신청일 변경·삭제 시 완료 처리(skip)·'진행 중' 확인 해제 — 새 신청은 '예정'부터 다시.
      if (v !== prevFiled) {
        nextData = writeByDestValue(nextData, token, 'import_permit_issued_skipped', null)
        nextData = writeByDestValue(nextData, token, 'import_permit_in_progress', null)
      }
      // top-level 잔존 제거 — 다른 목적지로의 flatten fallback 누수 차단 (applyQuarantine 동일).
      delete nextData.import_permit_application_date
      delete nextData.permit_no
    } else {
      const prevFiled =
        typeof prev.import_permit_application_date === 'string'
          ? prev.import_permit_application_date
          : ''
      if (v) nextData.import_permit_application_date = v // scoping-fallback-ok: token 없음(목적지 없음) 폴백
      else delete nextData.import_permit_application_date
      if (permitNo) nextData.permit_no = permitNo // scoping-fallback-ok: token 없음(목적지 없음) 폴백
      else delete nextData.permit_no
      if (v !== prevFiled) {
        delete nextData.import_permit_issued_skipped
        delete nextData.import_permit_in_progress
      }
    }
    // 허가 번호를 넣는 순간이 곧 '허가를 확인한 날' — 신청일 칸이 없는 카드(뉴질랜드)의 완료일
    //   표시용이다(2026-07-29). 신청일이 있으면 그쪽이 우선이라 이 값은 폴백으로만 쓰인다.
    //   번호를 지우면 함께 지운다 — 완료 근거가 사라졌는데 날짜만 남으면 안 된다.
    const permitStampKey = 'import_permit_recorded_at'
    const prevPermitStamp = token
      ? readByDestValue(prev, token, permitStampKey)
      : prev[permitStampKey]
    if (!permitNo) {
      nextData = token
        ? writeByDestValue(nextData, token, permitStampKey, null)
        : (delete nextData[permitStampKey], nextData)
    } else if (typeof prevPermitStamp !== 'string' || prevPermitStamp.length < 10) {
      const stamp = todayKst()
      nextData = token
        ? writeByDestValue(nextData, token, permitStampKey, stamp)
        : { ...nextData, [permitStampKey]: stamp } // scoping-fallback-ok: token 없음 폴백
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
    return { ok: false, error: reportActionError(e, 'cases.updateImportPermitFields') }
  }
}

// ── 신청형 절차 카드(신청일 + 완료/첨부) — 범용 ──────────────────────────
/**
 * 수입 허가 **선행 절차 게이트**(importPermitPrerequisiteError)가 읽는 by_dest 필드들.
 *
 * 그 함수는 평탄화된 data 를 받으므로, 목적지 스코프에 저장된 값을 top-level 로 올려 줘야 한다.
 * ⚠️ **새 목적지에 선행 절차를 추가하면 여기에도 키를 넣을 것** — 빠뜨리면 게이트가 값을
 *   못 읽어 '선행이 없다'로 판정하고, 실제로는 통과시켜야 할 케이스를 막거나(값이 있는데 못 읽음)
 *   막아야 할 케이스를 통과시킨다. 남아공 AIA 키가 실제로 빠져 있었다(2026-07-30 발견).
 */
const IMPORT_PERMIT_PREREQ_FIELDS = [
  'nz_rcf_date',
  'nz_quarantine_reservation_date',
  'au_rnatt_declaration_date',
  'za_aia_permit_application_date',
] as const

function flattenPrereqFields(
  prev: Record<string, unknown>,
  token: string | null,
): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...prev }
  if (!token) return flat
  for (const k of IMPORT_PERMIT_PREREQ_FIELDS) {
    const v = readByDestValue(prev, token, k)
    if (typeof v === 'string') flat[k] = v
    else delete flat[k]
  }
  return flat
}

// 수입 허가와 동일 모델이지만 permit_no 가 없는 카드(싱가포르 계류장 예약·강아지 라이선스).
// 클라이언트는 stepId 만 넘기고, 서버가 신뢰 목록에서 필드 이름을 결정한다(임의 키 쓰기 차단).
const APPLICATION_STEP_SPECS: Record<string, ApplicationStepSpec> = {
  [SG_QUARANTINE_RESERVATION_APP_SPEC.attachStepId]: SG_QUARANTINE_RESERVATION_APP_SPEC,
  [SG_DOG_LICENCE_APP_SPEC.attachStepId]: SG_DOG_LICENCE_APP_SPEC,
}

/**
 * 신청형 절차 신청일 저장 — 범용(updateImportPermitFields 의 permit_no 없는 버전).
 * 신청일 변경·삭제 시 완료(skip)·'진행 중' 플래그를 해제한다(수입 허가와 동일 정책).
 * 필드는 by_dest 분리 — 활성 목적지 token 으로 기록.
 */
export async function updateApplicationDate(
  caseId: string,
  stepId: string,
  date: string | null,
  destination?: string | null,
  // (선택) 부가 예약일(계류장 예약 날짜 등) — spec.reservationField 가 있는 카드만. 정보성이라
  // 신청일과 달리 완료(skip)·진행 중 플래그를 건드리지 않는다.
  reservationDate?: string | null,
): Promise<Result<CaseRow>> {
  try {
    const spec = APPLICATION_STEP_SPECS[stepId]
    if (!spec) return { ok: false, error: '알 수 없는 절차 단계입니다.' }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
    }
    const rv = typeof reservationDate === 'string' ? reservationDate.trim() : ''
    if (rv !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(rv)) {
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
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      const prevFiledRaw = readByDestValue(prev, token, spec.dateField)
      const prevFiled = typeof prevFiledRaw === 'string' ? prevFiledRaw : ''
      nextData = writeByDestValue(nextData, token, spec.dateField, v || null)
      // 신청일 변경·삭제 시 완료 처리(skip)·'진행 중' 확인 해제 — 새 신청은 '예정'부터 다시.
      if (v !== prevFiled) {
        nextData = writeByDestValue(nextData, token, spec.skipFlag, null)
        nextData = writeByDestValue(nextData, token, spec.inProgressFlag, null)
      }
      if (spec.reservationField) {
        nextData = writeByDestValue(nextData, token, spec.reservationField, rv || null)
        delete nextData[spec.reservationField]
      }
      // top-level 잔존 제거 — 다른 목적지로의 flatten fallback 누수 차단.
      delete nextData[spec.dateField]
    } else {
      const prevFiledRaw = prev[spec.dateField]
      const prevFiled = typeof prevFiledRaw === 'string' ? prevFiledRaw : ''
      if (v) nextData[spec.dateField] = v // scoping-fallback-ok: token 없음(목적지 없음) 폴백
      else delete nextData[spec.dateField]
      if (v !== prevFiled) {
        delete nextData[spec.skipFlag]
        delete nextData[spec.inProgressFlag]
      }
      if (spec.reservationField) {
        if (rv) nextData[spec.reservationField] = rv // scoping-fallback-ok: token 없음 폴백
        else delete nextData[spec.reservationField]
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
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateApplicationDate') }
  }
}

/**
 * 신청형 절차 '완료' — 확인서 첨부 없이 발급 완료 처리(skip). 신청일이 있어야 의미가 있음
 * (markImportPermitIssued 와 동일 정책). 플래그는 by_dest 분리.
 */
export async function markApplicationIssued(
  caseId: string,
  stepId: string,
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    const spec = APPLICATION_STEP_SPECS[stepId]
    if (!spec) return { ok: false, error: '알 수 없는 절차 단계입니다.' }

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
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)
    const filedRaw = token
      ? readByDestValue(prev, token, spec.dateField)
      : prev[spec.dateField]
    const filed = typeof filedRaw === 'string' ? filedRaw : ''
    if (filed.length < 10) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      nextData = writeByDestValue(nextData, token, spec.skipFlag, true)
      delete nextData[spec.skipFlag]
    } else {
      nextData[spec.skipFlag] = true // scoping-fallback-ok: token 없음(목적지 없음) 폴백
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
    return { ok: false, error: reportActionError(e, 'cases.markApplicationIssued') }
  }
}

// ── 순수 날짜 완료 카드(발급일·예약일 = 완료 증거) — 범용 ─────────────────
// 확인 게이트 없이 날짜만 저장(done-resolver dated:<field> 가 ≤오늘=완료 판정). 클라이언트는
// stepId 만 넘기고 서버가 신뢰 목록에서 필드를 결정한다(임의 키 쓰기 차단).
// 카탈로그 + 전 목적지 override 의 실효 `done: 'dated:<field>'` 에서 파생한 단일 출처
// (@petmove/domain resolveDatedStepField). ⛔ 여기서 손으로 목록을 만들지 말 것 — 그렇게 하다
// 버튼 완료 카드만 훑는 조건 때문에 계류시설 예약 저장이 죽었다(2026-07-28). 자세한 사연은
// packages/domain/src/journey-steps/dated-steps.ts 주석.
//
// ⚠️ 목적지를 반드시 넘길 것 — 같은 stepId('departure')가 호주·뉴질랜드·싱가포르에서 각각
//   다른 검역일 필드를 쓴다. 목적지를 빼면 셋 중 하나로만 저장된다.

/**
 * 순수 날짜 완료 카드의 날짜 저장 — 범용. 확인 플래그 없음(dated 모델). 필드는 by_dest 분리.
 */
export async function updateSimpleDateField(
  caseId: string,
  stepId: string,
  date: string | null,
  destination?: string | null,
  /**
   * 회차가 둘인 카드의 **추가 날짜**(뉴질랜드 마이크로칩 인증 2차 등). 키는 그 카드가 선언한
   * 날짜 입력에서만 고를 수 있다(resolveStepDateFields) — 임의 키 쓰기 차단.
   */
  extras?: Record<string, string | null>,
): Promise<Result<CaseRow>> {
  try {
    const field = resolveDatedStepField(stepId, destination)
    if (!field) return { ok: false, error: '알 수 없는 절차 단계입니다.' }
    const v = typeof date === 'string' ? date.trim() : ''
    if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
    }
    const allowedExtras = new Set(
      resolveStepDateFields(stepId, destination).filter((k) => k !== field),
    )
    const extraEntries: Array<[string, string]> = []
    for (const [k, raw] of Object.entries(extras ?? {})) {
      if (!allowedExtras.has(k)) return { ok: false, error: '알 수 없는 입력 항목입니다.' }
      const ev = typeof raw === 'string' ? raw.trim() : ''
      if (ev !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(ev)) {
        return { ok: false, error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' }
      }
      extraEntries.push([k, ev])
    }

    const access = await assertCaseAccess(caseId)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data: existing, error: fetchErr } = await admin
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    if (stepId === 'us-cdc-dog-import-form') {
      // 하와이(주)·괌(미국령) 모두 CDC 연방 규칙이 그대로 적용된다(카드도 base 공유).
      // ⚠️ 명단은 **카드 applicability 에서 파생**한다 — 손으로 적었더니 괌이 빠져 카드는
      //   뜨는데 '완료'를 누르면 "미국·하와이 여정에서만 저장할 수 있는 단계입니다"가 났다
      //   (2026-07-26 괌 추가 때 카드·순서 override·서류 명단은 넣고 이 게이트만 놓침,
      //   2026-07-30 사용자 발견). 카드가 뜨는 곳이 곧 저장 가능한 곳이다.
      const cdcDests =
        JOURNEY_STEP_CATALOG.find((s) => s.id === 'us-cdc-dog-import-form')?.applicability
          .destinations ?? []
      const cdcDestKey = buildCaseJourneyContext(existing as CaseRow, destination).destinationKey
      if (cdcDests === 'all' ? false : !cdcDestKey || !cdcDests.includes(cdcDestKey)) {
        return { ok: false, error: '미국·하와이·괌 여정에서만 저장할 수 있는 단계입니다.' }
      }
      // 날짜 검증 없음 — CDC 신고 검증은 전부 삭제(2026-07-26 사용자 결정, 기록용 날짜만 저장).
    }
    // 광견병 증명서(뉴질랜드 RCF · 호주 RNATT 선언서) — 항체 결과를 옮겨 적는 서식이라
    //   채혈 기록 없이 발급될 수 없다. 이 카드들은 **버튼 완료**라 저장 검증(getSaveBlockError)을
    //   타지 않으므로 서버가 막는다(2026-07-29 사용자 지적 — 채혈 전에도 완료가 됐다).
    if (stepId === 'nz-rcf' || stepId === 'au-rnatt-declaration') {
      const titerDates = Array.isArray(prev.rabies_titer_records)
        ? (prev.rabies_titer_records as Array<Record<string, unknown>>).map((r) =>
            r && typeof r.date === 'string' ? r.date : '',
          )
        : []
      const err = validateRabiesDocRequiresTiter(v, titerDates)
      if (err) return { ok: false, error: err }
    }
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)

    // 수입 허가 선행 절차 게이트 — 호주·남아공은 이 카드가 **버튼 완료**라
    //   markImportPermitIssued 가 아니라 여기(updateSimpleDateField)로 저장된다. 게이트를
    //   그쪽에만 두었더니 선행(호주 RNATT 선언서·남아공 AIA 허가) 없이 완료가 됐다
    //   (2026-07-30 사용자 발견 — 남아공에서 드러났지만 호주도 2026-07-27 버튼 완료 전환
    //   이후 같은 상태였다). nz-rcf·au-rnatt-declaration 이 위에서 같은 이유로 막는 것과 짝.
    //   값을 **비울 때**(완료 취소)는 막지 않는다 — 되돌리기까지 막을 이유가 없다.
    if (stepId === 'import-permit' && v) {
      const prereqErr = importPermitPrerequisiteError(
        // 목적지 키는 **token 기준** — cases.destination 은 다중 목적지 연결 문자열이라
        //   그대로 넣으면 선언 순서상 먼저 걸리는 목적지로 해석된다(markImportPermitIssued 주석).
        findDestinationKey(token ?? destination ?? caseDestStr ?? '') ?? '',
        flattenPrereqFields(prev, token),
        true,
      )
      if (prereqErr) return { ok: false, error: prereqErr }
    }

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      nextData = writeByDestValue(nextData, token, field, v || null)
      // top-level 잔존 제거 — 다른 목적지로의 flatten fallback 누수 차단.
      delete nextData[field]
    } else {
      if (v) nextData[field] = v // scoping-fallback-ok: token 없음(목적지 없음) 폴백
      else delete nextData[field]
    }
    // 예약·구매형 카드 — 카드에 넣는 날짜는 **미래**(계류 시작일·검사 예약일)라 일정 목록의
    //   완료일로 쓸 수 없다. '예약을 마친 날'을 따로 찍어 그걸 완료일로 쓴다(항공권 구매의
    //   flight_info_recorded_at 과 같은 모델, 2026-07-28). 최초 1회만 — 나중에 예약 날짜를
    //   고쳐도 '언제 예약했는지'는 그대로 남아야 한다. 값을 비우면 함께 지운다.
    for (const [k, ev] of extraEntries) {
      if (token) {
        nextData = writeByDestValue(nextData, token, k, ev || null)
        delete nextData[k] // top-level 잔존 제거 — 주 필드와 같은 처리.
      } else if (ev) {
        nextData[k] = ev // scoping-fallback-ok: token 없음(목적지 없음) 폴백
      } else {
        delete nextData[k]
      }
    }
    if (isBookedStep(stepId, destination)) {
      const recKey = bookedRecordedAtKey(field)
      const existingRec = token ? readByDestValue(nextData, token, recKey) : nextData[recKey]
      if (!v) {
        nextData = token
          ? writeByDestValue(nextData, token, recKey, null)
          : (delete nextData[recKey], nextData)
      } else if (typeof existingRec !== 'string' || existingRec.length < 10) {
        const stamp = todayKst()
        nextData = token
          ? writeByDestValue(nextData, token, recKey, stamp)
          : { ...nextData, [recKey]: stamp }
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
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateSimpleDateField') }
  }
}

// (소형 단일값 카드 저장 액션 updateSimpleStepFields 는 2026-07-26 삭제 — 유일한 사용처였던
//  미국 '입국 경로 확인'·'도착 주 규정 확인' 카드가 사용자 결정으로 삭제됨.)

/**
 * 수입 허가 '완료' — 허가증 첨부 없이 발급 완료 처리(skip). 신청일이 있어야 의미가 있음
 * (사전 신고 markAdvanceNotificationApprovalSkipped 와 동일 정책). 플래그는 by_dest 분리.
 */
export async function markImportPermitIssued(
  caseId: string,
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)
    const filedRaw = token
      ? readByDestValue(prev, token, 'import_permit_application_date')
      : prev.import_permit_application_date
    const filed = typeof filedRaw === 'string' ? filedRaw : ''
    // 신청일 게이트는 **신청일 칸이 있는 카드**에만 적용한다(2026-07-29). 뉴질랜드는 신청일을
    //   받지 않고 허가 번호·첨부·완료 버튼 셋 중 하나로 완료하는 모델이라, 이 게이트를 그대로
    //   두면 완료 버튼이 "신청일이 입력되어 있지 않습니다."로 막힌다. 판정은 카드 선언에서
    //   파생한다(deriveApplicationStatus·완료 버튼 노출 조건과 같은 기준).
    //   ⚠️ 목적지는 **resolveWriteToken 이 푼 token** 으로 본다. `destination ?? caseDestStr` 로
    //   보면 둘 다 비어 있을 때(단일 목적지라 ?dest 가 없고 cases.destination 이 비어 케이스
    //   data 에만 목적지가 있는 경우) base 카드로 폴백해 신청일 칸이 있는 것으로 판정하고,
    //   뉴질랜드 완료 버튼이 "신청일이 입력되어 있지 않습니다."로 막혔다(2026-07-30 실기기 발견).
    //   목적지를 못 풀면 **막지 않는다**. 못 푼 상태에서 base 카드로 폴백하면 신청일 칸이 없는
    //   목적지(뉴질랜드)까지 신청일을 요구하게 된다. 완료 버튼 자체가 그 카드에서만 뜨므로,
    //   판정 불가일 때 통과시키는 편이 안전하다.
    const destForCard = token ?? destination ?? caseDestStr
    const collectsFiledDate =
      !!destForCard &&
      resolveStepDateFields('import-permit', destForCard).includes('import_permit_application_date')
    if (collectsFiledDate && filed.length < 10) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }
    // 선행 절차 게이트(뉴질랜드 계류 예약·RCF / 호주 RNATT 선언서 / 남아공 AIA 허가) —
    //   저장 검증과 **같은 함수**. 이 버튼은 저장 경로를 타지 않아서, 게이트를 저장 쪽에만
    //   두면 완료 버튼으로 선행 절차를 건너뛸 수 있다(2026-07-29).
    const flatData = flattenPrereqFields(prev, token)
    //   ⚠️ 목적지 키도 **token 기준**이다. cases.destination 은 다중 목적지를 '뉴질랜드,호주'
    //   처럼 이어 붙인 문자열이라, 그대로 findDestinationKey 에 넣으면 선언 순서상 먼저 걸리는
    //   목적지(호주)로 해석된다 → 뉴질랜드 카드에 'RNATT 선언서를 먼저 발급받으세요.'가 떴다
    //   (2026-07-30 실기기 발견). token 은 ?dest·첫 토큰으로 이미 하나만 골라 준다.
    const prereqErr = importPermitPrerequisiteError(
      findDestinationKey(token ?? destination ?? caseDestStr ?? '') ?? '',
      flatData,
      true,
    )
    if (prereqErr) return { ok: false, error: prereqErr }
    // 허가를 확인한 날 — 신청일 칸이 없는 카드(뉴질랜드)의 완료일 표시용. 신청일이 있으면
    //   그쪽이 우선이라 이 값은 폴백으로만 쓰인다. 최초 1회만 찍는다.
    const stampKey = 'import_permit_recorded_at'
    const prevStamp = token ? readByDestValue(prev, token, stampKey) : prev[stampKey]

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      nextData = writeByDestValue(nextData, token, 'import_permit_issued_skipped', true)
      delete nextData.import_permit_issued_skipped
    } else {
      nextData.import_permit_issued_skipped = true // scoping-fallback-ok: token 없음(목적지 없음) 폴백
    }
    if (typeof prevStamp !== 'string' || prevStamp.length < 10) {
      const stamp = todayKst()
      nextData = token
        ? writeByDestValue(nextData, token, stampKey, stamp)
        : { ...nextData, [stampKey]: stamp } // scoping-fallback-ok: token 없음 폴백
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
    return { ok: false, error: reportActionError(e, 'cases.markImportPermitIssued') }
  }
}

/**
 * 수입 허가 '완료 취소' — 완료 처리(skip)와 확인일을 함께 지운다.
 *
 * 신청일 칸이 있는 카드는 그 날짜를 바꾸면 완료가 풀린다(updateImportPermitFields). 신청일을
 * 받지 않는 카드(뉴질랜드)는 그 경로가 없어 한 번 완료하면 되돌릴 수단이 아예 없었다
 * (2026-07-29 사용자 지적). 버튼 완료 카드의 '완료 취소'와 같은 역할.
 * 허가 번호·첨부로 완료된 상태는 이 액션으로 풀리지 않는다 — 그건 그 값을 지워서 푼다.
 */
export async function unmarkImportPermitIssued(
  caseId: string,
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)

    let nextData: Record<string, unknown> = { ...prev }
    for (const key of ['import_permit_issued_skipped', 'import_permit_recorded_at']) {
      if (token) {
        nextData = writeByDestValue(nextData, token, key, null)
        delete nextData[key]
      } else {
        delete nextData[key]
      }
    }

    const { data: undone, error: undoErr } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (undoErr) return { ok: false, error: undoErr.message }
    return { ok: true, value: undone as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.unmarkImportPermitIssued') }
  }
}

/**
 * 수입 허가 '진행 중' — 보호자가 신청 후 '진행 중' 버튼을 눌러 확인(사전 신고와 동일, 완료와 별개).
 * 신청일이 있어야 의미가 있음. 플래그는 issued_skipped 와 동일하게 by_dest 분리.
 */
export async function markImportPermitInProgress(
  caseId: string,
  destination?: string | null,
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

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    const caseDestStr = (existing as { destination: string | null }).destination
    const token = resolveWriteToken(caseDestStr, prev, destination)
    const filedRaw = token
      ? readByDestValue(prev, token, 'import_permit_application_date')
      : prev.import_permit_application_date
    const filed = typeof filedRaw === 'string' ? filedRaw : ''
    if (filed.length < 10) {
      return { ok: false, error: '신청일이 입력되어 있지 않습니다.' }
    }

    let nextData: Record<string, unknown> = { ...prev }
    if (token) {
      nextData = writeByDestValue(nextData, token, 'import_permit_in_progress', true)
      delete nextData.import_permit_in_progress
    } else {
      nextData.import_permit_in_progress = true // scoping-fallback-ok: token 없음(목적지 없음) 폴백
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
    return { ok: false, error: reportActionError(e, 'cases.markImportPermitInProgress') }
  }
}

/**
 * 종합백신(general-vaccine step)의 접종 기록을 한 번에 patch — case.data.general_vaccine_dates
 * 전체 교체. 동물 단위 사실(목적지 무관 전역 키)이라 by_dest 스코핑 없음 (rabies_dates 동일).
 *
 * entries 는 화면 순서대로, 같은 인덱스의 기존 record 비관리 키를 보존(updateRabiesExtraEntries
 * 와 동일 모델). date 없는 phantom 은 drop.
 */
/** 종합백신 계열 배열 필드 — 임의 키 쓰기 차단용 허용 목록(PARASITE_FIELD_KEYS 와 같은 패턴). */
const VACCINE_ARRAY_FIELD_KEYS = new Set([
  'general_vaccine_dates',
  'kennel_cough_dates',
  // 독감(CIV) — 같은 shape. 2026-07-27 호주 노출로 입력 UI 를 붙이며 함께 허용.
  'civ_dates',
])

/** 배열 필드 → '예정→도래' 확인 플래그 키. 전역(동물 단위) 키로 destination-scoped 아님. */
const VACCINE_ARRAY_CONFIRMED_KEYS: Record<string, string> = {
  general_vaccine_dates: 'general_vaccine_confirmed',
  kennel_cough_dates: 'kennel_cough_confirmed',
  civ_dates: 'civ_confirmed',
}

/**
 * 종합백신 계열 배열 저장 — 켄넬코프(kennel_cough_dates)도 **같은 shape**(date + valid_until
 * + 약품 4필드)이라 필드키만 바꿔 재사용한다(2026-07-27 켄넬코프 카드 분리).
 * ⛔ 임의 키 쓰기 방지 — 허용 목록(VACCINE_ARRAY_FIELD_KEYS) 밖은 거부한다.
 */
export async function updateGeneralVaccineEntries(
  caseId: string,
  entries: Array<{
    date: string | null
    valid_until: string | null
    product?: string | null
    manufacturer?: string | null
    lot?: string | null
    expiry?: string | null
  }>,
  fieldKey: string = 'general_vaccine_dates',
): Promise<Result<CaseRow>> {
  try {
    if (!VACCINE_ARRAY_FIELD_KEYS.has(fieldKey)) {
      return { ok: false, error: '잘못된 백신 필드입니다.' }
    }
    const scheduledKey = `${fieldKey}_scheduled`
    const confirmedKey = VACCINE_ARRAY_CONFIRMED_KEYS[fieldKey] ?? 'general_vaccine_confirmed'
    for (const e of entries) {
      for (const key of ['date', 'valid_until', 'expiry'] as const) {
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
    const prevArr = Array.isArray(prev[fieldKey]) ? [...(prev[fieldKey] as unknown[])] : []

    const next: Record<string, unknown>[] = []
    for (let i = 0; i < entries.length; i++) {
      const fields = entries[i]
      const prevSlot = prevArr[i]
      const prevEntry =
        prevSlot && typeof prevSlot === 'object'
          ? { ...(prevSlot as Record<string, unknown>) }
          : {}
      const isFreshEntry = Object.keys(prevEntry).length === 0
      const entry: Record<string, unknown> = { ...prevEntry }
      for (const [key, raw] of Object.entries(fields)) {
        const val = typeof raw === 'string' ? raw.trim() : raw
        if (val == null || val === '') delete entry[key]
        else entry[key] = val
      }
      if (!hasValidDate(entry)) continue
      // 약품 4필드 중 하나라도 채워진 신규 entry 는 '타병원 접종' 기본 — 보호자는 어느 병원
      // 약품인지 모르는 상태고, admin 이 본병원이면 펫무브워크에서 해제(광견병과 동일 정책).
      if (
        isFreshEntry &&
        ['product', 'manufacturer', 'lot', 'expiry'].some((k) => typeof entry[k] === 'string')
      ) {
        entry.other_hospital = true
      }
      next.push(entry)
    }

    // chain 검증 — 각 접종은 직전 접종의 면역 유효기간 이내여야 부스터로 인정(광견병과 동일).
    // 만료 후 접종은 새 기초접종이 되므로 직전 유효기간 이내 입력만 허용 — findRabiesChainBreak
    // (범용 체인 검사)로 광견병·종합백신 단일 출처. 클라이언트(getSaveBlockError)도 같은 검증.
    const gvChainSeq = next.map((r) => ({
      date: typeof r.date === 'string' ? r.date : '',
      valid_until: typeof r.valid_until === 'string' ? r.valid_until : null,
    }))
    const gvChainBreak = findRabiesChainBreak(gvChainSeq)
    if (gvChainBreak) {
      return {
        ok: false,
        error: rabiesChainBreakMessage(gvChainBreak),
      }
    }

    const nextData: Record<string, unknown> = { ...prev }
    // 미래(예정) 회차는 기록에서 빼서 별도 예정 자리로 — 입력칸 비움 + 예정 배지.
    const gvRecords = splitScheduledDoses(next, scheduledKey, nextData)
    if (gvRecords.length === 0) delete nextData[fieldKey]
    else nextData[fieldKey] = gvRecords
    applyDatedConfirm(nextData, gvRecords, confirmedKey)

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateGeneralVaccineEntries') }
  }
}

/** 구충(내·외부) step 의 처치 기록 배열 키 — updateParasiteEntries 화이트리스트. */
// 심장사상충도 같은 date_array 모델이라 같은 액션을 쓴다(2026-07-27 카드 분리).
const PARASITE_FIELD_KEYS = new Set([
  'external_parasite_dates',
  'internal_parasite_dates',
  'heartworm_dates',
  // 폐충(Angiostrongylus vasorum) — 심장사상충과 같은 date_array 모델. 2026-07-29 카드 분리.
  'lungworm_dates',
  // 전염병 검사 — 같은 date_array shape(약품 필드는 화면에서 숨김). 2026-07-27 호주 노출로 추가.
  'infectious_disease_records',
])

/**
 * 구충(내·외부) step 의 처치 기록을 한 번에 patch — case.data.<fieldKey> 전체 교체.
 *
 * 대부분 **동물 단위 사실**(목적지 무관 전역 키) — updateGeneralVaccineEntries 와 동일 모델.
 * ⚠️ 예외: `infectious_disease_records` 는 **목적지별**이다(2026-07-30 사용자 지정).
 *   검사 항목이 나라마다 달라(호주 3종 / 뉴질랜드 5종) 기록을 공유하면 부족한 검사가
 *   다른 여정에서 '검사 완료'로 보인다. 그 키만 by_dest 로 라우팅한다.
 */
export async function updateParasiteEntries(
  caseId: string,
  fieldKey: string,
  entries: Array<{
    date: string | null
    // 약품 4필드(약품명·제조사·제조번호·제품유효기간) — 내부 기생충 치료 '세부 정보(선택)'.
    product?: string | null
    manufacturer?: string | null
    lot?: string | null
    expiry?: string | null
  }>,
  /** 활성 목적지 — 전염병 검사(목적지별 키)의 저장 대상을 정한다. 다른 키는 무시. */
  destination?: string | null,
): Promise<Result<CaseRow>> {
  try {
    if (!PARASITE_FIELD_KEYS.has(fieldKey)) {
      return { ok: false, error: '잘못된 구충 필드입니다.' }
    }
    for (const e of entries) {
      // date·expiry 는 날짜형 — 형식 검증. product·manufacturer·lot 은 자유 텍스트.
      for (const v of [e.date, e.expiry]) {
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
      .select('data, destination')
      .eq('id', caseId)
      .single()
    if (fetchErr) return { ok: false, error: fetchErr.message }

    const prev = (existing?.data ?? {}) as Record<string, unknown>
    // 전염병 검사만 **목적지별** 저장(2026-07-30 사용자 지정) — 검사 항목이 나라마다 달라
    //   (호주 3종 / 뉴질랜드 5종) 기록을 공유하면 부족한 검사가 다른 여정에서 '완료'로 보인다.
    //   구충·심장사상충·폐충은 동물 단위 사실이라 종전대로 전역이다.
    //   ⚠️ 읽을 때도 그 목적지 값을 본다. by_dest 엔트리가 아직 없으면 top-level 잔존값을
    //     읽어 첫 저장에서 그 목적지로 옮겨 준다(별도 마이그레이션 없이 자연 이관).
    const scopedField = fieldKey === 'infectious_disease_records'
    const writeDest = scopedField
      ? resolveWriteToken(
          (existing as { destination: string | null }).destination,
          prev,
          destination,
        )
      : null
    const scopedPrev = writeDest ? readByDestValue(prev, writeDest, fieldKey) : undefined
    const prevArr = [
      ...(Array.isArray(scopedPrev)
        ? scopedPrev
        : Array.isArray(prev[fieldKey])
          ? (prev[fieldKey] as unknown[])
          : []),
    ]

    const next: Record<string, unknown>[] = []
    for (let i = 0; i < entries.length; i++) {
      const fields = entries[i]
      const prevSlot = prevArr[i]
      const prevEntry =
        prevSlot && typeof prevSlot === 'object'
          ? { ...(prevSlot as Record<string, unknown>) }
          : {}
      const isFreshEntry = Object.keys(prevEntry).length === 0
      const entry: Record<string, unknown> = { ...prevEntry }
      // date + 약품 4필드를 병합 — 빈값은 키 삭제(자동 추론 폴백 유지), 나머지는 trim 후 저장.
      for (const [key, raw] of Object.entries(fields)) {
        const val = typeof raw === 'string' ? raw.trim() : raw
        if (val == null || val === '') delete entry[key]
        else entry[key] = val
      }
      if (!hasValidDate(entry)) continue
      // 약품 4필드 중 하나라도 채워진 신규 entry 는 '타병원' 기본 (종합백신과 동일 정책).
      if (
        isFreshEntry &&
        ['product', 'manufacturer', 'lot', 'expiry'].some((k) => typeof entry[k] === 'string')
      ) {
        entry.other_hospital = true
      }
      next.push(entry)
    }

    // 날짜순 정규화 — "index 0 = 가장 이른 처치 = 1차" 불변식을 **저장 시점**에 보장한다.
    // 광견병(normalizeRabiesOrder)과 같은 모델로 통일(2026-07-28 사용자 지정). 그전엔 입력
    // 순서를 그대로 써서, 2차를 먼저 넣으면 화면 라벨이 '외부구충 / 외부구충 2차'인데 날짜는
    // 거꾸로 보였다(검증 룰은 원래 날짜순으로 봐서 판정은 맞았고, 라벨만 뒤집혔다).
    // phantom 은 위 루프에서 이미 걸러져 next 는 전부 유효 date 다.
    const sorted = normalizeRabiesOrder(next as Array<Record<string, unknown> & { date?: string | null }>)

    let nextData: Record<string, unknown> = { ...prev }
    // 미래(예정) 회차는 기록에서 빼서 별도 예정 자리로 — 입력칸 비움 + 예정 배지.
    const pRecords = splitScheduledDoses(sorted, `${fieldKey}_scheduled`, nextData)
    if (pRecords.length === 0) delete nextData[fieldKey]
    else nextData[fieldKey] = pRecords
    // 전염병 검사(목적지별) — splitScheduledDoses 가 top-level 에 써 둔 두 키를 by_dest 로
    //   옮기고 top-level 잔존을 지운다. 안 지우면 다른 목적지가 flatten fallback 으로
    //   이 검사를 물려받는다(단일 목적지 케이스 경로).
    if (writeDest) {
      const sched = nextData[`${fieldKey}_scheduled`]
      nextData = writeByDestValue(nextData, writeDest, fieldKey, pRecords.length > 0 ? pRecords : null)
      nextData = writeByDestValue(
        nextData,
        writeDest,
        `${fieldKey}_scheduled`,
        typeof sched === 'string' && sched ? sched : null,
      )
      delete nextData[fieldKey]
      delete nextData[`${fieldKey}_scheduled`]
    }
    // 확인 플래그 키 — '<이름>_dates' 뿐 아니라 '<이름>_records'(전염병 검사)도 벗겨야
    //   'infectious_disease_confirmed' 가 된다. _dates 만 벗기면 키가 그대로 남아
    //   'infectious_disease_records' 에 플래그를 덮어써 기록을 날린다(2026-07-27).
    // ⛔ 전염병 검사는 여기서 자동 set 하지 않는다(2026-07-30) — 그 키는 이제 **보호자가
    //   결과를 받았다고 확인**하는 플래그다(검사 → 결과 2단계, markInfectiousDiseaseResult
    //   Confirmed). 자동으로 켜면 채혈만으로 완료돼 결과 대기 구간이 사라진다.
    //   대신 **검사일이 바뀌면 확인을 해제**한다 — 새 검사 결과를 또 기다려야 하므로.
    if (scopedField) {
      const prevDates = prevArr
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).date : r))
        .filter((d): d is string => typeof d === 'string')
        .join(',')
      const nextDates = pRecords
        .map((r) => (typeof r.date === 'string' ? r.date : ''))
        .filter(Boolean)
        .join(',')
      if (prevDates !== nextDates) {
        // 확인 플래그도 목적지별 — 그 목적지 값만 해제한다.
        nextData = writeDest
          ? writeByDestValue(nextData, writeDest, 'infectious_disease_confirmed', null)
          : (delete nextData.infectious_disease_confirmed, nextData)
        if (writeDest) delete nextData.infectious_disease_confirmed
      }
    } else {
      applyDatedConfirm(nextData, pRecords, fieldKey.replace(/_(dates|records)$/, '_confirmed'))
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
    return { ok: false, error: reportActionError(e, 'cases.updateParasiteEntries') }
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
    return { ok: false, error: reportActionError(e, 'cases.updateJpExportQuarantineVisitDate') }
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
    return { ok: false, error: reportActionError(e, 'cases.updateKrImportQuarantineDate') }
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
      // token 없음(목적지 없는 케이스)만 도달하는 top-level 폴백 — resolveWriteToken 이 단일·다중을
      // 모두 토큰으로 해석하므로 다중 목적지는 위 by_dest 경로로 간다.
      if (a) nextData.jp_export_quarantine_application_date = a // scoping-fallback-ok: token 없음 폴백
      else delete nextData.jp_export_quarantine_application_date
      if (d) nextData.jp_export_quarantine_date = d // scoping-fallback-ok: token 없음 폴백
      else delete nextData.jp_export_quarantine_date
      if (time) nextData.jp_export_quarantine_time = time // scoping-fallback-ok: token 없음 폴백
      else delete nextData.jp_export_quarantine_time
    }
    // 신청일이 바뀌거나 지워지면 '완료 처리(skip)'를 해제 — 사전 신고와 동일 사유.
    // reservation_skipped 는 일본 전용 키(다른 목적지가 같은 step 을 안 가져 누수 없음) → 공용 유지.
    if (a !== prevApplied) {
      delete nextData.jp_export_quarantine_reservation_skipped
      // 신청일이 바뀌면 '진행 중' 확인도 해제 — 새 신청일은 '예정'부터 다시 시작.
      delete nextData.jp_export_quarantine_in_progress
    }
    // 예약일·시간은 '희망/예정' 데이터일 뿐, 완료 판정에 영향 없음 — 보호자가 하단 '완료'
    // 버튼(reservation_skipped 플래그)을 명시적으로 눌러야 step 이 done. 사전 신고와 동일 모델.
    // 기존에 admin 토글로 confirmed=true 가 세팅된 케이스가 있다면 그 값은 그대로 둔다
    // (admin 의 명시적 액션이라 portal 입력 변화로 자동 무력화하지 않음).
    // 신청일·예약·확정 어떤 시점이든 보호자가 portal 에서 적극적 입력을 했다는 뜻 —
    // stored 클리어해 derive 모드로 전환 (운영자 수동값이 있었다면 그 시점부터만 무력화).
    clearLegacyReportStatusForStep(nextData, 'jp-export-quarantine', 'export')

    const { data: updated, error } = await admin
      .from('cases')
      .update({ data: nextData })
      .eq('id', caseId)
      .select('*')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, value: updated as CaseRow }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.updateJpExportQuarantineFields') }
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
    return { ok: false, error: reportActionError(e, 'cases.saveCaseFeedback') }
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
  // ⛔ 'email' 은 쓰기 금지(2026-08-01 보안 리뷰) — data.email 은 계정 자동 링크 매칭키라
  //   (추가 전용 트리거 20260627000001), 고객이 임의 값으로 바꾸면 남의 계정에 이 케이스가
  //   링크된다(케이스 공유 주입). profile.ts applyGuardianToCase 가 같은 이유로 email 전파를
  //   이미 제거한 정책과 통일 — 연락 이메일은 customer_profiles.contact_email 에만 저장.
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
      return { ok: false, error: '귀국일은 출국일 이후여야 해요.' }
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
    // 태국 노선 — 출국일이 광견병·종합백신 최근 접종일 + 21일 이전이면 저장 거부.
    // 필리핀 노선 — 출국일이 생후 120일 이전이면 저장 거부.
    // updateFlightFields 와 같은 정책 — 회복 경로 없는 위반만 hard 차단.
    //
    // 단, 사용자가 출국일·목적지·생년월일을 **실제로 바꾼 경우에만** 검증한다(base 비교). 공유 폼이
    // 보호자·동물·여행 sub-page 를 모두 거치므로, 그 칸들을 안 건드린 저장(보호자 연락처 등)이 이미
    // 저장된 출국일의 기존 위반으로 막히면 안 된다. base 없으면(구 호출) 종전대로 항상 검증.
    const entryInputsChanged =
      !base ||
      input.departure_date !== base.departure_date ||
      input.destination !== base.destination ||
      input.birth_date !== base.birth_date
    if (entryInputsChanged) {
      const ruleCtx = {
        // birth_date 는 이 폼에서 함께 수정될 수 있어 폼 값을 우선 (prev 는 stale).
        // 저장이 아니라 검증용 로컬 view — data 쓰기 아님.
        data: {
          ...prev,
          birth_date: effective.birth_date?.trim() || undefined, // scoping-lint-ignore — 검증용 view
          species: effective.species || undefined, // scoping-lint-ignore — 검증용 view
        },
        destination: effective.destination,
        departureDate: null,
      }
      const entryErr =
        validateJpEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validateThEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validatePhEntryDate(effective.departure_date.trim(), ruleCtx) ??
        // 홍콩 — 출국일이 생후 5개월 이전이면 저장 거부(AFCD DC-02v05 5항).
        validateHkEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validateIlEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validateEuEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validateTwEntryDate(effective.departure_date.trim(), ruleCtx) ??
        validateUsDogEntryDate(effective.departure_date.trim(), ruleCtx)
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
    return { ok: false, error: reportActionError(e, 'cases.updateCaseInfoFields') }
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

    // 광견병 + 종합백신(개/고양이) + 내부구충(개/고양이) 약품 카탈로그 — portal 입력에서
    // 날짜 기준 자동추천(백신) 및 구충제 예시 placeholder(내부구충, 종별)에 쓴다.
    const { data: rows, error } = await admin
      .from('org_vaccine_products')
      .select('category, vaccine, product, manufacturer, batch, expiry, year')
      .eq('org_id', (caseRow as { org_id: string }).org_id)
      .in('category', [
        'rabies',
        'comprehensive_dog',
        'comprehensive_cat',
        'parasite_internal_dog',
        'parasite_internal_cat',
      ])
    if (error) return { ok: false, error: error.message }

    const value = emptyVaccineProductsData()
    for (const row of (rows ?? []) as Array<RabiesProductRow & { category: string }>) {
      const product = {
        vaccine: row.vaccine ?? undefined,
        product: row.product ?? undefined,
        manufacturer: row.manufacturer,
        batch: row.batch,
        expiry: row.expiry,
        year: row.year ?? undefined,
      }
      if (row.category === 'comprehensive_dog') value.comprehensive_dog.push(product)
      else if (row.category === 'comprehensive_cat') value.comprehensive_cat.push(product)
      else if (row.category === 'parasite_internal_dog') value.parasite_internal_dog.push(product)
      else if (row.category === 'parasite_internal_cat') value.parasite_internal_cat.push(product)
      else value.rabies.push(product)
    }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'cases.getCaseVaccineData') }
  }
}
