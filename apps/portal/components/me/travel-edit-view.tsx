'use client'

import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { hasSiblingCase } from '@/lib/cases/info-form'
import { EditPageShell, StickySaveBar } from './settings-shared'
import { TravelFormSections } from './travel-form-sections'
import { useCaseEditForm } from './use-case-edit-form'

/**
 * 설정 > 여행 정보 — /me/travel.
 *
 * SectionCard 구성(기본·출국 항공권·귀국 항공권·일본 수출검역)은 travel-form-sections.tsx
 * 로 분리되어 AnimalEditView(/me/animal/[caseId]) 와 공유한다. 이 페이지는 EditPageShell
 * + 저장 바만 입혀서 그대로 띄운다.
 */

export function TravelEditView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { cases } = useCases()
  const { form, set, dirty, status, error, handleSave } = useCaseEditForm(caseRow, caseId)
  const hasSibling = hasSiblingCase(cases, caseRow)

  return (
    <EditPageShell
      title="여행 정보"
      bottomBar={
        <StickySaveBar dirty={dirty} status={status} error={error} onSave={handleSave} />
      }
    >
      <TravelFormSections
        caseRow={caseRow}
        form={form}
        set={set}
        hasSibling={hasSibling}
        marginTop={8}
      />
    </EditPageShell>
  )
}
