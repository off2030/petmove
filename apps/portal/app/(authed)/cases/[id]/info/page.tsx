import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// 정보 페이지는 설정 hub 로 통합됨 (2026-05-29). 옛 링크/북마크 보호를 위해 /me 로 보냄.
export default function LegacyCaseInfoPage() {
  redirect('/me')
}
