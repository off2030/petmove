import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Naver OAuth callback — code 교환 + user info → Supabase user 생성/조회 → 세션 cookie set.
// Supabase 가 Naver 를 builtin 지원 안 해서 자체 처리. magic link 의 hashed_token 을
// 직접 verifyOtp 로 소비해 cookie 발급.

export const dynamic = 'force-dynamic'

function sanitizeNext(v: string | null | undefined): string {
  if (!v) return '/cases'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/cases'
  return v
}

function loginRedirect(origin: string, error: string) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(error)}`, origin),
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const naverError = url.searchParams.get('error')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get('pm_naver_state')?.value
  const next = sanitizeNext(cookieStore.get('pm_naver_next')?.value)
  // 1회용 — 즉시 제거
  cookieStore.delete('pm_naver_state')
  cookieStore.delete('pm_naver_next')

  if (naverError) {
    return loginRedirect(url.origin, `naver: ${naverError}`)
  }
  if (!code || !stateParam || !expectedState || stateParam !== expectedState) {
    return loginRedirect(url.origin, 'naver_state_mismatch')
  }

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return loginRedirect(url.origin, 'naver_not_configured')
  }

  // 1. code → access_token
  const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token')
  tokenUrl.searchParams.set('grant_type', 'authorization_code')
  tokenUrl.searchParams.set('client_id', clientId)
  tokenUrl.searchParams.set('client_secret', clientSecret)
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('state', stateParam)

  let accessToken: string
  try {
    const tokenRes = await fetch(tokenUrl, { method: 'GET', cache: 'no-store' })
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string }
    if (!tokenJson.access_token) {
      return loginRedirect(url.origin, `naver_token: ${tokenJson.error ?? 'no token'}`)
    }
    accessToken = tokenJson.access_token
  } catch (e) {
    return loginRedirect(url.origin, `naver_token: ${(e as Error).message}`)
  }

  // 2. access_token → user info (email, name)
  let email: string
  let name: string | null
  try {
    const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    const meJson = (await meRes.json()) as {
      resultcode?: string
      response?: { email?: string; name?: string; nickname?: string }
    }
    if (meJson.resultcode !== '00' || !meJson.response?.email) {
      return loginRedirect(url.origin, 'naver_no_email')
    }
    email = meJson.response.email.toLowerCase()
    name = meJson.response.name ?? meJson.response.nickname ?? null
  } catch (e) {
    return loginRedirect(url.origin, `naver_me: ${(e as Error).message}`)
  }

  // 3. Supabase user 조회/생성 — profiles 직접 query (auth.admin.listUsers 보다 훨씬 빠름).
  //
  // 같은 이메일로 다른 provider (email magic link, google) 로 가입한 사용자가 있으면
  // 자동으로 그 계정에 매핑된다. Naver developers 정책상 이메일은 본인 검증을 거친
  // 값만 반환하므로 이메일 탈취로 인한 계정 hijack 위험은 낮다. 의도된 동작.
  // 매핑 시 console 에 한 줄 남겨 추후 운영 로그(Vercel functions) 에서 추적 가능.
  const admin = createAdminClient()
  let userId: string | null = null
  try {
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existing) {
      userId = existing.id as string
      // 기존 user 의 app_metadata.providers 에 'naver' 가 누락돼 있으면 append.
      // 누락 시 미들웨어 hasOnlyEmailProvider 가 true 로 잘못 평가되어 Naver 로
      // 로그인한 사용자가 /set-password 로 강제 리다이렉트되는 혼란이 발생.
      const { data: userResp } = await admin.auth.admin.getUserById(userId)
      const currentMeta = (userResp?.user?.app_metadata ?? {}) as Record<string, unknown>
      const currentProviders = (currentMeta.providers as string[] | undefined) ?? []
      if (!currentProviders.includes('naver')) {
        console.log(`[naver-auth] linking naver to existing user ${userId} (${email})`)
        await admin.auth.admin.updateUserById(userId, {
          app_metadata: { ...currentMeta, providers: [...currentProviders, 'naver'] },
        })
      }
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: name ? { name, full_name: name } : {},
        app_metadata: { provider: 'naver', providers: ['naver'] },
      })
      if (createErr || !created.user) {
        return loginRedirect(url.origin, `naver_create: ${createErr?.message ?? 'unknown'}`)
      }
      userId = created.user.id
      if (name) {
        await admin.from('profiles').update({ name }).eq('id', userId)
      }
    }
  } catch (e) {
    return loginRedirect(url.origin, `naver_lookup: ${(e as Error).message}`)
  }

  // 4. magic link 생성 → hashed_token 으로 verifyOtp → 세션 cookie set
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkErr || !linkData.properties?.hashed_token) {
      return loginRedirect(url.origin, `naver_link: ${linkErr?.message ?? 'no token'}`)
    }
    const supabase = await createClient()
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    })
    if (verifyErr) {
      return loginRedirect(url.origin, `naver_verify: ${verifyErr.message}`)
    }
  } catch (e) {
    return loginRedirect(url.origin, `naver_session: ${(e as Error).message}`)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
