'use server'

/**
 * 마이크로칩으로 기존 케이스를 찾는다.
 * 드롭/페이스트로 새 케이스를 만들기 전, 중복을 방지하기 위한 조회.
 *
 * 저장된 포맷이 공백 포함(`000 000 000 000 000`, formatMicrochip 결과) 또는
 * 숫자만(legacy) 두 종류라 두 variant 모두 조회.
 *
 * 보안: PostgREST `.or()` 의 인자는 `,` `(` `)` 를 구분자로 쓰므로 사용자가
 * 입력한 raw 문자열을 그대로 끼우면 query break / row 노출 가능. digits 추출
 * 후 파생한 두 변형만 사용 — 둘 다 [0-9 ]+ 문자만 포함이라 안전.
 */

import { createClient } from '@petmove/auth/server'
import type { CaseRow } from '@/lib/supabase/types'

export async function lookupCaseByMicrochip(
  chip: string,
): Promise<{ ok: true; case: CaseRow | null } | { ok: false; error: string }> {
  const digits = chip.replace(/\D/g, '')
  if (!digits) return { ok: true, case: null }

  const spaced = digits.replace(/(\d{3})(?=\d)/g, '$1 ')
  // 변형 변형들은 모두 digits + space 만 포함 → PostgREST or() 안전.
  const variants = Array.from(new Set([digits, spaced]))

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
