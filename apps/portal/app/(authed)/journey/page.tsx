import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Legacy: /journey → /cases (1건이면 그 케이스의 journey 로 자동 redirect 됨)
export default function LegacyJourneyPage() {
  redirect('/cases')
}
