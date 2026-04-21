'use server'

import { revalidatePath } from 'next/cache'
import { DEFAULT_VET_INFO, loadVetInfo, saveVetInfo, type VetInfo } from '@/lib/vet-info'

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

export async function resetCompanyInfo(): Promise<{ ok: true; info: VetInfo }> {
  // 모든 키를 기본값으로 되돌림.
  const info = await saveVetInfo(DEFAULT_VET_INFO)
  revalidatePath('/settings')
  return { ok: true, info }
}
