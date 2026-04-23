'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { DEFAULT_VET_INFO, loadVetInfo, saveVetInfo, type VetInfo } from '@/lib/vet-info'

export type OrgType = 'hospital' | 'transport'

export async function getCompanyInfo(): Promise<VetInfo> {
  return await loadVetInfo()
}

export async function updateCompanyInfo(patch: Partial<VetInfo>): Promise<{ ok: true; info: VetInfo } | { ok: false; error: string }> {
  try {
    const info = await saveVetInfo(patch)
    revalidatePath('/settings')
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
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
    return t === 'transport' ? 'transport' : 'hospital'
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
