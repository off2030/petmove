'use server'

import { revalidatePath } from 'next/cache'
import { saveImportReportCountries } from '@/lib/import-report-config'

export type SaveResult = { ok: true; countries: string[] } | { ok: false; error: string }

function revalidateAll() {
  revalidatePath('/settings')
  revalidatePath('/cases')
}

export async function saveImportReportCountriesAction(list: string[]): Promise<SaveResult> {
  try {
    const countries = await saveImportReportCountries(list)
    revalidateAll()
    return { ok: true, countries }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '저장 실패' }
  }
}
