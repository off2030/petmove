import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { GuideExplorer } from '@/components/guide-explorer'

export const metadata: Metadata = {
  title: '가이드 · 펫무브',
  description: '나라별 반려동물 출국 가이드 - 일본·태국·필리핀 등 49개국의 검역 준비 방법을 확인하세요.',
  alternates: { canonical: '/guide/' },
}

export default function GuidePage() {
  return (
    <div className="pg pg-hub">
      <SiteHeader active="guide" />
      <GuideExplorer />
      <SiteFooter />
    </div>
  )
}
