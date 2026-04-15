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

export async function generateFormAC(caseId: string) {
  return generate('FormAC', caseId)
}

export async function generateIdentificationDeclaration(caseId: string) {
  return generate('IdentificationDeclaration', caseId)
}

export async function generateForm25(caseId: string) {
  return generate('Form25', caseId)
}

export async function generateForm25AuNz(caseId: string) {
  return generate('Form25AuNz', caseId)
}

export async function generateAnnexIII(caseId: string) {
  return generate('AnnexIII', caseId)
}

export async function generateUK(caseId: string) {
  return generate('UK', caseId)
}
