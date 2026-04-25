import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite, getInviteSummary } from '@/lib/actions/invites'
import { InviteJoin } from './invite-join'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // 미로그인 — invite 요약 + 인라인 로그인 옵션
    const summary = await getInviteSummary(token)
    if (!summary.ok) {
      return <InviteError message={summary.error} />
    }
    if (summary.value.expired) {
      return <InviteError message="만료된 초대입니다. 관리자에게 새 초대를 요청하세요." />
    }
    if (summary.value.alreadyAccepted) {
      return <InviteError message="이미 수락된 초대입니다." />
    }
    return <InviteJoin token={token} summary={summary.value} />
  }

  // 로그인 됨 — 자동 수락 시도
  const result = await acceptInvite(token)
  if (result.ok) {
    // 비번 미설정 + email 가입자면 set-password 강제 (proxy 가드가 잡지만 명시적으로)
    redirect('/cases')
  }

  return <InviteError message={result.error} />
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-lg">
      <div className="max-w-md w-full space-y-md rounded-xl border border-border/60 bg-card p-xl shadow-sm text-center">
        <h1 className="text-xl font-semibold">초대 수락 실패</h1>
        <p className="text-base text-muted-foreground">{message}</p>
        <a
          href="/cases"
          className="inline-block px-md py-2.5 rounded-md bg-accent hover:bg-accent/90 transition-colors"
        >
          홈으로
        </a>
      </div>
    </div>
  )
}
