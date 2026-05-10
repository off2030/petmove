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
  // org 이름만 노출 — 보호자/펫 이름은 PII 라 미리보기에 안 띄움.
  // fallback 은 고객 친화 브랜드 "펫무브" (직원용 admin 앱 이름인 "펫무브워크" X).
  const orgName = r.ok ? (r.value.org_name || '펫무브') : '펫무브'
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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="mx-auto w-full max-w-md py-20 text-center">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground">
          Unavailable
        </p>
        <h1 className="mb-3 font-serif text-2xl font-medium tracking-tight text-foreground">
          링크를 사용할 수 없습니다
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
