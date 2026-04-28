'use server'

import { revalidatePath } from 'next/cache'
import { saveVaccineDefaults, type VaccineDefaults } from '@/lib/vaccine-defaults'

export async function updateVaccineDefault(
  patch: Partial<VaccineDefaults>,
): Promise<{ ok: true; value: VaccineDefaults } | { ok: false; error: string }> {
  try {
    const value = await saveVaccineDefaults(patch)
    // 대시보드 layout 이 server-side 로 fetch 한 값을 새로고침하도록 invalidate.
    revalidatePath('/', 'layout')
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
