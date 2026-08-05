import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'
import { LegalBackBar } from '@/components/legal-back-bar'

// 요청마다 docs/legal/help-start.md 를 새로 읽어 렌더 (terms/privacy 와 동일 패턴).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '처음 사용하시는 분 — 펫무브',
  description: '펫무브 앱 시작 안내 — 가입부터 준비 일정까지',
}

export default async function HelpStartPage() {
  const html = await renderLegalDoc('help-start')
  return (
    <>
      <LegalBackBar title="처음 사용하시는 분" />
      <article
        className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
