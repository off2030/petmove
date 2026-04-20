import { createClient } from '@supabase/supabase-js'

/**
 * Singleton Supabase client for browser-side usage (file uploads, etc.).
 * Prevents "Multiple GoTrueClient instances" warning.
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)
