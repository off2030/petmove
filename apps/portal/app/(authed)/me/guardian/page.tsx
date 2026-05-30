'use client'

import { useCases } from '@/components/portal-shell/case-data-provider'
import { GuardianEditView } from '@/components/me/guardian-edit-view'
import { ComingSoonView } from '@/components/me/coming-soon-view'

export default function MeGuardianPage() {
  const { cases } = useCases()
  const primary = cases[0]
  if (!primary) {
    return <ComingSoonView title="보호자" message="먼저 케이스를 등록해주세요." />
  }
  return <GuardianEditView caseRow={primary} caseId={primary.id} />
}
