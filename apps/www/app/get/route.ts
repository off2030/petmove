import { NextRequest, NextResponse } from 'next/server'
import { STORE_IOS, STORE_ANDROID } from '@/lib/store-links'

// 스마트 앱 링크 — 블로그·카톡 등 외부 지면에서 쓰는 단일 주소.
// 모바일은 해당 스토어 직행, 그 외(PC)는 홈페이지 앱 소개 섹션으로.
export function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') ?? ''
  if (/iPhone|iPad|iPod/i.test(ua)) return NextResponse.redirect(STORE_IOS, 302)
  if (/Android/i.test(ua)) return NextResponse.redirect(STORE_ANDROID, 302)
  return NextResponse.redirect(new URL('/#app', req.url), 302)
}
