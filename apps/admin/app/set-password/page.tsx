import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from './form'

export const dynamic = 'force-dynamic'

function sanitizeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = sanitizeNext(params.next)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/set-password')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, password_set')
    .eq('id', user.id)
    .maybeSingle()

  // 이미 비번 설정됨 → next 로 바로
  if (profile?.password_set) redirect(next)

  return <SetPasswordForm email={profile?.email ?? user.email ?? ''} next={next} />
}
