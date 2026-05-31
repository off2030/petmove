'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { DEFAULT_VET_INFO, loadVetInfo, saveVetInfo, type VetInfo } from '@/lib/vet-info'

export type OrgType = 'hospital' | 'transport' | 'both'

export async function getCompanyInfo(): Promise<VetInfo> {
  return await loadVetInfo()
}

export async function updateCompanyInfo(patch: Partial<VetInfo>): Promise<{ ok: true; info: VetInfo } | { ok: false; error: string }> {
  try {
    const info = await saveVetInfo(patch)
    await syncOrgTypeFromData(info)
    revalidatePath('/settings')
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * org_type 자동 판정 — 채운 정보로 결정. 별도 '유형 선택' UI 없이, 조직정보 탭에
 * 입력한 내용으로 PDF 발급자 동작이 정해지도록.
 *   병원 정보(clinic_ko) + 운송 정보(transport_company_ko) 둘 다 → both
 *   운송만 → transport (PDF 수의사 칸 비움)
 *   그 외 → hospital
 * 직영(platform) 은 제외 — 절대 덮어쓰지 않음. best-effort(실패가 저장을 막지 않음).
 */
async function syncOrgTypeFromData(info: VetInfo): Promise<void> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data: cur } = await supabase
      .from('organizations')
      .select('org_type')
      .eq('id', orgId)
      .maybeSingle()
    const curType = (cur as { org_type?: string } | null)?.org_type
    if (curType === 'platform') return // 직영은 자동판정 대상 아님
    const hasHospital = !!info.clinic_ko?.trim()
    const hasTransport = !!info.transport_company_ko?.trim()
    const next: OrgType = hasHospital && hasTransport ? 'both' : hasTransport ? 'transport' : 'hospital'
    if (curType !== next) {
      await supabase
        .from('organizations')
        .update({ org_type: next, updated_at: new Date().toISOString() })
        .eq('id', orgId)
    }
  } catch {
    // best-effort: org_type 판정 실패가 회사 정보 저장을 막지 않음
  }
}

export async function resetCompanyInfo(): Promise<{ ok: true; info: VetInfo } | { ok: false; error: string }> {
  // org 별 seed 값(organization_settings.company_info_default) 을 company_info 로 복사.
  // seed 가 없으면 에러 — UI 에서 버튼 숨김 처리.
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('value')
      .eq('org_id', orgId)
      .eq('key', 'company_info_default')
      .maybeSingle()
    const seed = (data?.value as Partial<VetInfo> | null) ?? null
    if (!seed) {
      return { ok: false, error: '이 조직에는 기본값이 설정되어 있지 않습니다.' }
    }
    const info = await saveVetInfo({ ...DEFAULT_VET_INFO, ...seed })
    revalidatePath('/settings')
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function hasCompanyInfoDefault(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organization_settings')
      .select('key')
      .eq('org_id', orgId)
      .eq('key', 'company_info_default')
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

export async function getOrgType(): Promise<OrgType> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organizations')
      .select('org_type')
      .eq('id', orgId)
      .maybeSingle()
    const t = data?.org_type
    return t === 'transport' ? 'transport' : t === 'both' ? 'both' : 'hospital'
  } catch {
    return 'hospital'
  }
}

export async function updateOrgType(next: OrgType): Promise<{ ok: true; org_type: OrgType } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { error } = await supabase
      .from('organizations')
      .update({ org_type: next, updated_at: new Date().toISOString() })
      .eq('id', orgId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/settings')
    return { ok: true, org_type: next }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
