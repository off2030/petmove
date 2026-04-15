'use server'

import { createClient } from '@/lib/supabase/server'
import { fillPdf } from '@/lib/pdf-fill'
import type { CaseRow } from '@/lib/supabase/types'

export type GeneratePdfResult =
  | { ok: true; pdf: string; filename: string }
  | { ok: false; error: string }

async function generate(formKey: string, caseId: string): Promise<GeneratePdfResult> {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single()
  if (error || !row) return { ok: false, error: error?.message ?? '케이스를 찾을 수 없습니다' }
  return fillPdf(formKey, row as CaseRow)
}

export async function generateFormRE(caseId: string) {
  return generate('FormRE', caseId)
}
