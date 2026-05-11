import { redirect } from 'next/navigation'
import { createClient } from '@petmove/auth/server'
import { BottomNav } from '@/components/portal-shell/bottom-nav'

export const dynamic = 'force-dynamic'

/**
 * 인증된 보호자 셸. 4탭 (여정/서류/정보/프로필) 공통 레이아웃.
 *
 * - 미로그인 시 /login 으로 리다이렉트 (proxy.ts 가 1차 방어, 여기서 2차 안전망).
 * - 하단 BottomNav 고정. 본문 paddingBottom 으로 nav 만큼 공간 확보.
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
      <main style={{ flex: 1, paddingBottom: 88 }}>{children}</main>
      <BottomNav />
    </div>
  )
}
