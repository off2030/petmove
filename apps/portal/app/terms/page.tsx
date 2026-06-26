import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'
import { LegalBackBar } from '@/components/legal-back-bar'

// 요청마다 docs/legal/terms.md 를 새로 읽어 렌더. 정적 prerender 면 Next 증분 빌드 캐시가
// fs.readFile 을 의존성으로 추적 못 해 .md 만 바뀐 배포에서 옛 내용이 그대로 나옴.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '이용약관 — 펫무브',
  description: '펫무브 서비스 이용약관',
}

export default async function TermsPage() {
  const html = await renderLegalDoc('terms')
  return (
    <>
      <LegalBackBar title="이용약관" />
      <article
        className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
