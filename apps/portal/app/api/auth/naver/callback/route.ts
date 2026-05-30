import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'
import { ensureCustomerProfile, autoLinkCasesByEmail } from '@/lib/supabase/customer'

// Naver OAuth callback — code 교환 + user info → Supabase user 생성/조회 → 세션 cookie set.
// Supabase 가 Naver 를 builtin 지원 안 해서 자체 처리. magic link 의 hashed_token 을
// 직접 verifyOtp 로 소비해 cookie 발급.
//
// portal 판: auth.users 는 admin 과 공유. 기존 user 조회 시 admin 의 profiles +
// portal 의 customer_profiles 둘 다 확인 (둘 중 하나라도 있으면 같은 user_id 사용).
// 매핑 후 ensureCustomerProfile + autoLinkCasesByEmail 호출.

export const dynamic = 'force-dynamic'

function sanitizeNext(v: string | null | undefined): string {
  if (!v) return '/'
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/'
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
    const tokenRes = await fetch(tokenUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
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
      signal: AbortSignal.timeout(8_000),
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

  // 3. Supabase user 조회/생성.
  // auth.users 는 admin/portal 이 공유. 같은 email 의 user 가 admin 의 profiles 또는
  // portal 의 customer_profiles 어느 쪽에라도 있으면 그 user_id 로 매핑 (자동 계정 통합).
  // Naver 가 이메일 본인 인증을 거치므로 이메일 탈취로 인한 hijack 위험 낮음.
  const admin = createAdminClient()
  let userId: string | null = null
  try {
    // admin profiles (스태프)
    const { data: existingProf } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingProf) {
      userId = existingProf.id as string
    } else {
      // portal customer_profiles — email_normalized 로 조회
      const { data: existingCust } = await admin
        .from('customer_profiles')
        .select('user_id')
        .eq('email_normalized', email)
        .maybeSingle()
      if (existingCust) {
        userId = existingCust.user_id as string
      }
    }

    if (userId) {
      // 기존 user — providers 에 'naver' 없으면 append
      const { data: userResp } = await admin.auth.admin.getUserById(userId)
      const currentMeta = (userResp?.user?.app_metadata ?? {}) as Record<string, unknown>
      const currentProviders = (currentMeta.providers as string[] | undefined) ?? []
      if (!currentProviders.includes('naver')) {
        console.log(`[naver-auth portal] linking naver to existing user ${userId} (${email})`)
        await admin.auth.admin.updateUserById(userId, {
          app_metadata: { ...currentMeta, providers: [...currentProviders, 'naver'] },
        })
      }
    } else {
      // 새 user — customer_profiles 본인 row 는 5단계의 ensureCustomerProfile 이 만듦
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

    // 5. portal 특화 — customer_profiles 자동 생성 + 이메일 기준 자동 매칭
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    if (sessionUser) {
      try { await ensureCustomerProfile(supabase, sessionUser) } catch { /* best-effort */ }
      try { await autoLinkCasesByEmail(admin, sessionUser) } catch { /* best-effort */ }
    }
  } catch (e) {
    return loginRedirect(url.origin, `naver_session: ${(e as Error).message}`)
  }

  void userId
  return NextResponse.redirect(new URL(next, url.origin))
}
