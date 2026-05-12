import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Legacy: /info → /cases.
export default function LegacyInfoPage() {
  redirect('/cases')
}
