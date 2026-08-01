import { redirect } from 'next/navigation'
import { createClient } from '@petmove/auth/server'
import { SetPasswordForm } from './form'

export const dynamic = 'force-dynamic'

function sanitizeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return '/cases'
    // WHATWG URL 파서는 탭·CR·LF 를 제거하고 파싱한다 — '/'+TAB+'/evil.com' 이 선두 검사를
  // 통과한 뒤 https://evil.com/ 으로 해석되는 open redirect 우회(2026-08-01 리뷰 발견).
  // 제어문자·역슬래시가 하나라도 있으면 통째로 거부한다.
  if (/[\t\n\r\\]/.test(v)) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//')) return '/cases'
  return v
}

function isReset(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === '1' || v === 'true'
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const next = sanitizeNext(params.next)
  // ?reset=1 — /login 의 "비밀번호 재설정 메일" → callback 통과 후 도착하는 마커.
  // 이미 password_set=true 인 사용자도 비번 변경 폼을 다시 띄우기 위해 password_set 체크 우회.
  const reset = isReset(params.reset)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/set-password')}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, password_set')
    .eq('id', user.id)
    .maybeSingle()

  // reset 플로우가 아니면서 이미 비번 설정된 사용자 → next 로 바로 (기존 동작 보존).
  if (!reset && profile?.password_set) redirect(next)

  return (
    <SetPasswordForm
      email={profile?.email ?? user.email ?? ''}
      next={next}
      mode={reset ? 'reset' : 'set'}
    />
  )
}
