'use server'

import { revalidatePath } from 'next/cache'
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
    return { ok: false, error: err instanceof Error ? err.message : '저장 실패' }
  }
}
