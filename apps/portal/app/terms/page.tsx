import type { Metadata } from 'next'
import { renderLegalDoc } from '@/lib/legal'

export const metadata: Metadata = {
  title: '이용약관 — 펫무브',
  description: '펫무브 서비스 이용약관',
}

export default async function TermsPage() {
  const html = await renderLegalDoc('terms')
  return (
    <article
      className="legal-prose mx-auto max-w-2xl px-md py-xl md:py-2xl"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
