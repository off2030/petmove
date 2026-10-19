import type { Metadata } from 'next'
import { LabHome } from '@/components/lab/lab-home'
import '@/styles/lab.css'

// 비공개 시안 — proxy.ts 의 /lab 비밀번호 게이트 뒤에 있다. 사이트맵·내부 링크에 넣지 않는다.
export const metadata: Metadata = {
  title: '홈 시안 · 펫무브',
  robots: { index: false, follow: false },
}

export default function LabHomePage() {
  return <LabHome />
}
