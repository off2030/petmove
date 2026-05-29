'use server'

// 고객 의견 목록 — 펫무브(고객 앱) 여정 완료 후 보호자가 남긴 만족도+자유 의견(case.data.feedback).
// 일반 멤버: RLS 로 본인 조직만. 슈퍼어드민: service-role 로 전 조직 통합(인증 가드 통과 후).

import { createClient } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'

export interface FeedbackEntry {
  caseId: string
  orgId: string
  orgName: string | null
  customerName: string | null
  petName: string | null
  rating: number | null
  text: string
  submittedAt: string | null
}

export type ListFeedbackResult =
  | { ok: true; entries: FeedbackEntry[]; isSuperAdmin: boolean }
  | { ok: false; error: string }

function readFeedback(
  data: unknown,
): { rating: number | null; text: string; submittedAt: string | null } | null {
  if (!data || typeof data !== 'object') return null
  const fb = (data as Record<string, unknown>).feedback
  if (!fb || typeof fb !== 'object') return null
  const r = (fb as Record<string, unknown>).rating
  const t = (fb as Record<string, unknown>).text
  const s = (fb as Record<string, unknown>).submittedAt
  const rating = typeof r === 'number' ? r : null
  const text = typeof t === 'string' ? t : ''
  if (rating === null && !text) return null
  return { rating, text, submittedAt: typeof s === 'string' ? s : null }
}

interface CaseRow {
  id: string
  org_id: string
  customer_name: string | null
  pet_name: string | null
  data: unknown
}

const COLUMNS = 'id, org_id, customer_name, pet_name, data'

/**
 * 고객 의견 목록을 반환.
 * - 일반 멤버: RLS 가 자동으로 본인 조직 케이스로 제한 → 본인 조직 의견만.
 * - 슈퍼어드민: createAdminClient(service-role) 로 전 조직 케이스 조회 → 조직명까지 포함.
 *   (CLAUDE.md 규칙: service-role 호출 전 인증 가드 — is_super_admin 확인 후에만 사용.)
 */
export async function listFeedback(): Promise<ListFeedbackResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isSuperAdmin = !!profile?.is_super_admin

  let rows: CaseRow[] = []
  const orgNameById = new Map<string, string>()

  if (isSuperAdmin) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cases')
      .select(COLUMNS)
      .not('data->feedback', 'is', null)
      .is('deleted_at', null)
    if (error) return { ok: false, error: error.message }
    rows = (data ?? []) as CaseRow[]

    const orgIds = [...new Set(rows.map((r) => r.org_id))]
    if (orgIds.length > 0) {
      const { data: orgs } = await admin
        .from('organizations')
        .select('id, name')
        .in('id', orgIds)
      for (const o of orgs ?? []) orgNameById.set(o.id as string, (o.name as string) ?? '')
    }
  } else {
    // RLS(is_org_member)가 본인 조직으로 제한.
    const { data, error } = await supabase
      .from('cases')
      .select(COLUMNS)
      .not('data->feedback', 'is', null)
      .is('deleted_at', null)
    if (error) return { ok: false, error: error.message }
    rows = (data ?? []) as CaseRow[]
  }

  const entries: FeedbackEntry[] = []
  for (const r of rows) {
    const fb = readFeedback(r.data)
    if (!fb) continue
    entries.push({
      caseId: r.id,
      orgId: r.org_id,
      orgName: orgNameById.get(r.org_id) ?? null,
      customerName: r.customer_name,
      petName: r.pet_name,
      rating: fb.rating,
      text: fb.text,
      submittedAt: fb.submittedAt,
    })
  }

  // 최신 의견부터 (submittedAt ISO 내림차순, 없으면 뒤로).
  entries.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))

  return { ok: true, entries, isSuperAdmin }
}
