import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// caseId 없이 진입하면 설정 hub 로. 카드에서 진입할 땐 /me/animal/[caseId] 로 옴.
export default function MeAnimalIndexPage() {
  redirect('/me')
}
