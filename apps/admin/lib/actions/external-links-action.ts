'use server'

import { revalidatePath } from 'next/cache'
import { reportActionError } from './_report-error'
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
    const msg = reportActionError(err, 'external-links-action.saveExternalLinksAction')
    return { ok: false, error: err instanceof Error ? msg : '저장 실패' }
  }
}
