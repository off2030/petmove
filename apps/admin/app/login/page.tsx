import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

/** next 파라미터 검증 — open redirect 방지. 같은 오리진의 경로만 허용. */
function sanitizeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return '/cases'
  // must start with / and not be protocol-relative (//) or a backslash path (Windows trick)
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = sanitizeNext(params.next)
  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error

  const supabase = await createClient()
  // stale refresh token 이면 throw — /login 은 미로그인 진입이 정상이라 무시.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    user = null
  }

  if (user) redirect(next)

  return <LoginForm next={next} initialError={errorParam ?? null} />
}
