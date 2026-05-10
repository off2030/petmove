import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client. Reads the publishable (anon) key from env.
 * Safe to use in Server Components, Route Handlers, and Server Actions.
 *
 * React cache() 로 request-scoped 싱글톤 — 같은 요청 안에서 여러 헬퍼가
 * createClient() 를 호출해도 client 는 한 번만 생성되고 cookie 파싱·auth state 도 공유.
 * layout 의 Promise.all 같이 병렬 fetch 가 많은 경로에서 효과 큼.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — ignore. Middleware will refresh.
          }
        },
      },
    },
  )
})
