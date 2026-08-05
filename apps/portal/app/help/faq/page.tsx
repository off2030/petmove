import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'
import { LegalBackBar } from '@/components/legal-back-bar'

// 요청마다 docs/legal/help-faq.md 를 새로 읽어 렌더 (terms/privacy 와 동일 패턴).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '자주 묻는 질문 — 펫무브',
  description: '펫무브 앱 자주 묻는 질문(FAQ)',
}

export default async function HelpFaqPage() {
  const html = await renderLegalDoc('help-faq')
  return (
    <>
      <LegalBackBar title="자주 묻는 질문" />
      <article
        className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
