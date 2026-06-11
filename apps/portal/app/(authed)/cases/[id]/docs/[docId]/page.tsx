'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { use } from 'react'
import { findRequiredDoc } from '@petmove/domain'
import { RequiredDocDetail } from '@/components/cases/required-doc-detail'
import { useCase } from '@/components/portal-shell/case-data-provider'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { readCaseDocuments } from '@/lib/documents'

/**
 * 필수 서류 상세 — /cases/<id>/docs/<docId>. Client 컴포넌트.
 *
 * 1) Context 에서 케이스 조회 (네트워크 없음)
 * 2) 케이스의 destination + docId 로 spec 매칭 → 미적용 notFound
 * 3) previewStepId 가 있으면 case.data.documents 에서 해당 step 업로드 추림 (preview 소스)
 */
export default function RequiredDocDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>
}) {
  const { id, docId } = use(params)
  const searchParams = useSearchParams()
  const activeDest = searchParams.get('dest')
  const caseRowRaw = useCase(id)
  if (!caseRowRaw) notFound()

  // 다중 목적지: 활성 목적지(?dest=) 1개짜리 뷰로 좁혀 spec 매칭·서류 상태(by_dest)를 그
  // 목적지 기준으로 읽는다. 단일/미지정은 사실상 원본 그대로.
  const caseRow = activeDestinationView(caseRowRaw, activeDest)

  const doc = findRequiredDoc(caseRow.destination, docId, caseRow)
  if (!doc) notFound()

  // 첨부·미리보기 대상 — attachStepId 태그 파일 (step 연동 서류는 공유 step,
  // 그 외 별지25 등은 doc.id). 모든 필수 서류가 첨부 가능.
  const previewDocs = readCaseDocuments(caseRow.data).filter(
    (d) => d.stepId === doc.attachStepId,
  )

  return (
    <RequiredDocDetail
      caseId={id}
      doc={doc}
      previewDocs={previewDocs}
      activeDest={activeDest}
    />
  )
}
