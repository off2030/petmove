import { createBrowserClient } from '@supabase/ssr'

// Cookie 기반 세션 저장 — middleware(server)와 세션 공유하려면 필수.
// (구 @supabase/supabase-js createClient 는 localStorage 에만 저장해서 SSR 과 단절됨)
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)
