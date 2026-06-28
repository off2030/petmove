import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'
import { LegalBackBar } from '@/components/legal-back-bar'

// 요청마다 docs/legal/support.md 를 새로 읽어 렌더 (terms/privacy 와 동일 패턴).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '고객지원 — 펫무브',
  description: '펫무브 고객지원 · 문의 안내',
}

export default async function SupportPage() {
  const html = await renderLegalDoc('support')
  return (
    <>
      <LegalBackBar title="고객지원" />
      <article
        className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
