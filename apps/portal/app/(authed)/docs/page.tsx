import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Legacy: /docs → /cases.
export default function LegacyDocsPage() {
  redirect('/cases')
}
