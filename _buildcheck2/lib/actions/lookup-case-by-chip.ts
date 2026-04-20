'use server'

/**
 * 마이크로칩으로 기존 케이스를 찾는다.
 * 드롭/페이스트로 새 케이스를 만들기 전, 중복을 방지하기 위한 조회.
 *
 * 저장된 포맷이 공백 포함(`000 000 ...`)일 수도, 없을 수도 있어서
 * 입력 chip을 숫자만 남긴 뒤 두 가지 포맷을 모두 조회한다.
 */

import { createClient } from '@/lib/supabase/server'
import type { CaseRow } from '@/lib/supabase/types'

export async function lookupCaseByMicrochip(
  chip: string,
): Promise<{ ok: true; case: CaseRow | null } | { ok: false; error: string }> {
  const digits = chip.replace(/\D/g, '')
  if (!digits) return { ok: true, case: null }

  const spaced = digits.replace(/(\d{3})(?=\d)/g, '$1 ')
  const variants = Array.from(new Set([digits, spaced, chip.trim()]))

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .is('deleted_at', null)
    .or(variants.map(v => `microchip.eq.${v}`).join(','))
    .limit(1)

  if (error) return { ok: false, error: error.message }
  return { ok: true, case: (data?.[0] as CaseRow) ?? null }
}
