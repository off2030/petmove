import type { Metadata } from 'next'
import { getShareLinkByToken } from '@/lib/actions/share-links'
import { ShareForm } from './share-form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const r = await getShareLinkByToken(token)
  // org 이름만 노출 — 보호자/펫 이름은 PII 라 미리보기에 안 띄움
  const orgName = r.ok ? (r.value.org_name || '펫무브워크') : '펫무브워크'
  const title = `${orgName} - 다음 정보를 입력해주세요!`
  const description = '링크를 열어 반려동물 해외 이동에 필요한 정보를 입력해 주세요.'
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
    robots: { index: false, follow: false },
  }
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
