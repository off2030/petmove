'use server'

import { revalidatePath } from 'next/cache'
import { saveExternalLinks } from '@/lib/external-links'
import type { ExternalLinksConfig } from '@petmove/domain'

export type SaveResult =
  | { ok: true; config: ExternalLinksConfig }
  | { ok: false; error: string }

export async function saveExternalLinksAction(
  config: ExternalLinksConfig,
): Promise<SaveResult> {
  try {
    const saved = await saveExternalLinks(config)
    revalidatePath('/calculator')
    return { ok: true, config: saved }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '저장 실패' }
  }
}
