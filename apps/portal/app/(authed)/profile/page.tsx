import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Legacy: /profile → /me (case-외 페이지로 분리됨).
export default function LegacyProfilePage() {
  redirect('/me')
}
