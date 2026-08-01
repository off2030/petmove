'use server'

import { reportActionError } from './_report-error'
import { revalidatePath } from 'next/cache'
import {
  loadUserContactInfo,
  saveUserContactInfo,
  type UserContactInfo,
} from '@/lib/user-contact'

export async function getUserContactInfo(): Promise<UserContactInfo> {
  return loadUserContactInfo()
}

export async function updateUserContactInfo(
  patch: Partial<UserContactInfo>,
): Promise<{ ok: true; info: UserContactInfo } | { ok: false; error: string }> {
  try {
    const info = await saveUserContactInfo(patch)
    revalidatePath('/settings')
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'user-contact-info.updateUserContactInfo') }
  }
}
