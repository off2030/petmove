import { getShareLinkByToken } from '@/lib/actions/share-links'
import { ShareForm } from './share-form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ShareLinkPage({ params }: Props) {
  const { token } = await params
  const r = await getShareLinkByToken(token)
  if (!r.ok) {
    return <ShareError message={r.error} />
  }
  return <ShareForm initial={r.value} />
}

function ShareError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-lg">
      <div className="max-w-md w-full space-y-md rounded-xl border border-border/80 bg-card p-xl shadow-sm text-center">
        <h1 className="font-serif text-[20px] font-medium">링크를 사용할 수 없습니다</h1>
        <p className="font-serif text-[14px] text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
