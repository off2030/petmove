import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from '@/lib/actions/invites'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const next = `/invite/${encodeURIComponent(token)}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }

  const result = await acceptInvite(token)

  if (result.ok) {
    redirect('/cases')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-lg">
      <div className="max-w-md w-full space-y-md rounded-xl border border-border/60 bg-card p-xl shadow-sm text-center">
        <h1 className="text-xl font-semibold">초대 수락 실패</h1>
        <p className="text-base text-muted-foreground">{result.error}</p>
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
