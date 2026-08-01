'use server'

import { revalidatePath } from 'next/cache'
import { reportActionError } from './_report-error'
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
    return { ok: true, config: saved }
  } catch (err) {
    const msg = reportActionError(err, 'inspection-config-action.saveInspectionConfigAction')
    return { ok: false, error: err instanceof Error ? msg : '저장 실패' }
  }
}
