import { redirect } from 'next/navigation'
import { createClient } from '@petmove/auth/server'
import { BottomNav } from '@/components/portal-shell/bottom-nav'
import { TopChrome } from '@/components/portal-shell/top-chrome'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (여정/서류/정보/프로필) 공통 레이아웃.
 *
 * - 미로그인 시 /login 으로 리다이렉트 (proxy.ts 가 1차 방어, 여기서 2차 안전망).
 * - 상단 TopChrome (PETMOVE 워드마크 + safe-area), 하단 BottomNav 고정.
 * - 배경은 Stone 베이지 (Calm 톤). 화면별 컴포넌트가 같은 색을 풀-블리드 사용.
 */
export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    user = null
  }
  if (!user) redirect('/login?next=/journey')

  return (
    <div
      style={{
        background: '#F2EDE6',
        color: '#2A2620',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopChrome />
      <main style={{ flex: 1, paddingBottom: 88 }}>{children}</main>
      <BottomNav />
    </div>
  )
}
