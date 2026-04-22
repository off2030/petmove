'use server'

import { revalidatePath } from 'next/cache'
import { saveCertConfig } from '@/lib/cert-config'
import type { CertConfig } from '@petmove/domain'

export type SaveResult =
  | { ok: true; config: CertConfig }
  | { ok: false; error: string }

export async function saveCertConfigAction(config: CertConfig): Promise<SaveResult> {
  try {
    const saved = await saveCertConfig(config)
    revalidatePath('/settings')
    revalidatePath('/cases')
    return { ok: true, config: saved }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '저장 실패' }
  }
}
