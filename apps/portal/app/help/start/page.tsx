import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'
import { LegalBackBar } from '@/components/legal-back-bar'

// 요청마다 docs/legal/help-start.md 를 새로 읽어 렌더 (terms/privacy 와 동일 패턴).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '펫무브 시작 가이드 — 펫무브',
  description: '펫무브 앱 시작 가이드 — 등록부터 알림까지',
}

export default async function HelpStartPage() {
  const html = await renderLegalDoc('help-start')
  return (
    <>
      <LegalBackBar title="펫무브 시작 가이드" />
      <article
        className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
