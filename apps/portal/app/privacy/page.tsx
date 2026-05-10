import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'

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
