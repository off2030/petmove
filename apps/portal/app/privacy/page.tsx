import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'

// 요청마다 docs/legal/privacy.md 를 새로 읽어 렌더. 정적 prerender 면 Next 증분 빌드 캐시가
// fs.readFile 을 의존성으로 추적 못 해 .md 만 바뀐 배포에서 옛 내용이 그대로 나옴.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '개인정보처리방침 — 펫무브',
  description: '펫무브 서비스 개인정보처리방침',
}

export default async function PrivacyPage() {
  const html = await renderLegalDoc('privacy')
  return (
    <article
      className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
