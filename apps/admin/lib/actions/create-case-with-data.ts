'use server'

/**
 * 추출된 데이터와 함께 새 케이스를 한 번에 만든다.
 * createCase → updateCaseField 루프를 네트워크 한 번으로 줄이기 위한 서버 액션.
 *
 * 빈 값/null은 자동으로 drop되고, regular column / data jsonb로 적절히 분배된다.
 */

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { formatMicrochip } from '@/lib/fields'
import type { CaseRow } from '@/lib/supabase/types'
import { revalidatePath } from 'next/cache'

/** regular column으로 저장되는 키 (cases 테이블의 실제 컬럼) */
const REGULAR_COLUMNS = new Set([
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'destination',
  'departure_date',
])

export interface CaseSeed {
  column?: Record<string, unknown>
  data?: Record<string, unknown>
}

export async function createCaseWithData(
  seed: CaseSeed,
): Promise<{ ok: true; case: CaseRow } | { ok: false; error: string }> {
  const supabase = await createClient()
  const orgId = await getActiveOrgId()

  // 정리: null/빈 문자열/undefined 제거
  const cleanColumn: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(seed.column ?? {})) {
    if (!REGULAR_COLUMNS.has(k)) continue
    if (v === null || v === undefined || v === '') continue
    if (k === 'microchip') {
      const normalized = formatMicrochip(String(v))
      if (!normalized) continue
      cleanColumn[k] = normalized
      continue
    }
    cleanColumn[k] = v
  }
  const cleanData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(seed.data ?? {})) {
    if (v === null || v === undefined || v === '') continue
    cleanData[k] = v
  }

  const insertRow = {
    org_id: orgId,
    customer_name: '',
    ...cleanColumn,
    data: cleanData,
  }

  const { data, error } = await supabase
    .from('cases')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) {
    if (error.message.includes('cases_org_microchip_unique')) {
      return { ok: false, error: '이미 등록된 마이크로칩 번호입니다' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/cases')
  return { ok: true, case: data as CaseRow }
}
