'use client'

import { useCases } from '@/components/portal-shell/case-data-provider'
import { GuardianEditView } from '@/components/me/guardian-edit-view'
import { ComingSoonView } from '@/components/me/coming-soon-view'

export default function MeGuardianPage() {
  const { cases } = useCases()
  if (cases.length === 0) {
    return <ComingSoonView title="보호자" message="먼저 케이스를 등록하세요." />
  }
  return <GuardianEditView />
}
