import { redirect } from 'next/navigation'
import { createClient } from '@petmove/auth/server'

export const dynamic = 'force-dynamic'

/**
 * Portal 진입점.
 *   - 로그인된 보호자 → /cases (4탭 셸).
 *   - 비로그인 → /login.
 *
 * proxy.ts 가 `/` 는 항상 public 으로 통과시키므로 분기는 여기서.
 */
export default async function HomePage() {
  const supabase = await createClient()
  let userId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    userId = null
  }
  redirect(userId ? '/cases' : '/login')
}
