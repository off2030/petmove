'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { findRequiredDoc } from '@petmove/domain'
import { RequiredDocDetail } from '@/components/cases/required-doc-detail'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { readCaseDocuments } from '@/lib/documents'
import { replaceTab } from '@/components/portal-shell/tab-nav'

/**
 * 필수 서류 상세 본체 — TabHost 의 detail 레이어로 렌더. (구 /cases/<id>/docs/<docId> page 본문.)
 * caseId·docId·dest 는 TabHost 가 URL 에서 파싱해 props 로 내려준다.
 *
 * 1) Context 에서 케이스 조회 (네트워크 없음)
 * 2) 케이스의 destination + docId 로 spec 매칭 → 미적용이면 서류함으로 부드럽게 복귀
 *    (구 notFound() 는 셸 레벨에서 던지면 위험 — StepDetailScreen 과 동일 규약)
 * 3) previewStepId 가 있으면 case.data.documents 에서 해당 step 업로드 추림 (preview 소스)
 */
export function DocDetailScreen({
  caseId,
  docId,
  dest,
}: {
  caseId: string
  docId: string
  dest: string | null
}) {
  const activeDest = dest
  const router = useRouter()
  const caseRowRaw = useCase(caseId)

  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁혀 spec 매칭·서류 상태(by_dest)를 그
  // 목적지 기준으로 읽는다. 단일/미지정은 사실상 원본 그대로.
  const caseRow = caseRowRaw ? activeDestinationView(caseRowRaw, activeDest) : null
  const doc = caseRow ? findRequiredDoc(caseRow.destination, docId, caseRow) : null

  useEffect(() => {
    if (!caseRowRaw) {
      router.replace('/cases')
    } else if (!doc) {
      const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
      replaceTab(router, `/cases/${caseId}/docs${destQuery}`)
    }
  }, [caseRowRaw, doc, caseId, activeDest, router])

  if (!caseRow || !doc) return null

  // 첨부·미리보기 대상 — attachStepId 태그 파일 (step 연동 서류는 공유 step,
  // 그 외 별지25 등은 doc.id). 모든 필수 서류가 첨부 가능.
  const previewDocs = readCaseDocuments(caseRow.data).filter(
    (d) => d.stepId === doc.attachStepId,
  )

  return (
    <RequiredDocDetail caseId={caseId} doc={doc} previewDocs={previewDocs} activeDest={activeDest} />
  )
}
