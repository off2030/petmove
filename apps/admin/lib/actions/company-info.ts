'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { getMyOrgRole } from './my-role'
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

// ─────────────────────────────────────────────────
// 조직 아바타/로고 — organizations.avatar_url (20260608000009)
//
// 펫무브 보호자 화면(담당 병원·운송 카드)에 표시되는 조직 아바타. 사진은 user-avatars
// 버킷의 org/{orgId}/ 경로에 저장(보호자 아바타와 동일 버킷 관례). 업로드/제거는 조직
// 관리자만 — service-role(admin client)로 user-avatars insert RLS(첫 폴더=auth.uid()) 우회
// 하므로, 반드시 isAdmin 가드를 통과한 뒤에만 admin client 를 쓴다(admin CLAUDE.md 규칙 6).
// 클라이언트가 미리 512px 정사각 JPEG 로 리사이즈한 Blob 을 FormData 'file' 로 전달한다.
// ─────────────────────────────────────────────────

const ORG_AVATAR_BUCKET = 'user-avatars'

export async function getOrgAvatar(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    const { data } = await supabase
      .from('organizations')
      .select('avatar_url')
      .eq('id', orgId)
      .maybeSingle()
    return (data as { avatar_url?: string | null } | null)?.avatar_url ?? null
  } catch {
    return null
  }
}

export async function uploadOrgAvatar(
  formData: FormData,
): Promise<{ ok: true; avatar_url: string } | { ok: false; error: string }> {
  try {
    const role = await getMyOrgRole()
    if (!role.isAdmin) return { ok: false, error: '조직 관리자만 변경할 수 있습니다.' }

    const file = formData.get('file')
    if (!(file instanceof Blob)) return { ok: false, error: '파일이 없습니다.' }
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다 (최대 5MB).' }

    const orgId = await getActiveOrgId()
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    // 기존 아바타 경로 — 새 업로드 성공 후 정리.
    const { data: prev } = await admin
      .from('organizations')
      .select('avatar_url')
      .eq('id', orgId)
      .maybeSingle()
    const oldUrl = (prev as { avatar_url?: string | null } | null)?.avatar_url ?? null

    const path = `org/${orgId}/${crypto.randomUUID()}.jpg`
    const buffer = await file.arrayBuffer()
    const { error: upErr } = await admin.storage
      .from(ORG_AVATAR_BUCKET)
      .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
    if (upErr) return { ok: false, error: `업로드 실패: ${upErr.message}` }

    const { data: pub } = admin.storage.from(ORG_AVATAR_BUCKET).getPublicUrl(path)
    const publicUrl = pub.publicUrl

    const { error: updErr } = await admin
      .from('organizations')
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', orgId)
    if (updErr) {
      await admin.storage.from(ORG_AVATAR_BUCKET).remove([path])
      return { ok: false, error: updErr.message }
    }

    if (oldUrl) {
      const oldPath = oldUrl.split(`/${ORG_AVATAR_BUCKET}/`)[1]
      if (oldPath) await admin.storage.from(ORG_AVATAR_BUCKET).remove([oldPath])
    }

    revalidatePath('/settings')
    return { ok: true, avatar_url: publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function removeOrgAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const role = await getMyOrgRole()
    if (!role.isAdmin) return { ok: false, error: '조직 관리자만 변경할 수 있습니다.' }

    const orgId = await getActiveOrgId()
    const { createAdminClient } = await import('@petmove/auth')
    const admin = createAdminClient()

    const { data: prev } = await admin
      .from('organizations')
      .select('avatar_url')
      .eq('id', orgId)
      .maybeSingle()
    const oldUrl = (prev as { avatar_url?: string | null } | null)?.avatar_url ?? null

    const { error: updErr } = await admin
      .from('organizations')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', orgId)
    if (updErr) return { ok: false, error: updErr.message }

    if (oldUrl) {
      const oldPath = oldUrl.split(`/${ORG_AVATAR_BUCKET}/`)[1]
      if (oldPath) await admin.storage.from(ORG_AVATAR_BUCKET).remove([oldPath])
    }

    revalidatePath('/settings')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
