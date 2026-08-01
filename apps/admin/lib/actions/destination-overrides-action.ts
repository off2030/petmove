'use server'

import { revalidatePath } from 'next/cache'
import { reportActionError } from './_report-error'
import { saveDestinationOverrides } from '@/lib/destination-overrides-config'
import type { DestinationOverridesConfig } from '@petmove/domain'

export type SaveResult =
  | { ok: true; config: DestinationOverridesConfig }
  | { ok: false; error: string }

export async function saveDestinationOverridesAction(
  config: DestinationOverridesConfig,
): Promise<SaveResult> {
  try {
    const saved = await saveDestinationOverrides(config)
    revalidatePath('/settings')
    revalidatePath('/cases')
    return { ok: true, config: saved }
  } catch (err) {
    const msg = reportActionError(err, 'destination-overrides-action.saveDestinationOverridesAction')
    return { ok: false, error: err instanceof Error ? msg : '저장 실패' }
  }
}
