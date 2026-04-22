'use server'

import { revalidatePath } from 'next/cache'
import { saveInspectionConfig } from '@/lib/inspection-config'
import type { InspectionConfig } from '@petmove/domain'

export type SaveResult =
  | { ok: true; config: InspectionConfig }
  | { ok: false; error: string }

export async function saveInspectionConfigAction(config: InspectionConfig): Promise<SaveResult> {
  try {
    const saved = await saveInspectionConfig(config)
    revalidatePath('/settings')
    revalidatePath('/cases')
    revalidatePath('/todos')
    return { ok: true, config: saved }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '저장 실패' }
  }
}
