import { createClient } from '@petmove/auth/server'
import { signOut } from '@/lib/actions/profile'

export const dynamic = 'force-dynamic'

/**
 * 내 계정 (/me) — 케이스 컨텍스트 밖. 계정·동물병원·에이전시·로그아웃.
 *
 * 디자인은 미니멀 임시본 — portal-preview 시안 확정 후 정식화.
 */
export default async function MePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? null

  return (
    <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1
        style={{
          fontFamily: "'Fraunces', 'Pretendard Variable', serif",
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          margin: '12px 0 0',
        }}
      >
        내 계정
      </h1>

      <div
        style={{
          padding: '18px 18px',
          borderRadius: 14,
          background: '#FBF7F1',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ fontSize: 12, color: '#9A9286', marginBottom: 4 }}>로그인 이메일</div>
        <div style={{ fontSize: 15, color: '#2A2620', wordBreak: 'break-all' }}>
          {email ?? '—'}
        </div>
      </div>

      <form action={signOut}>
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 12,
            background: 'transparent',
            border: '1px solid rgba(0,0,0,0.12)',
            color: '#A04525',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          로그아웃
        </button>
      </form>
    </div>
  )
}
