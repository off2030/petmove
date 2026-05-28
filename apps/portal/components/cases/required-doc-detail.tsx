'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import type { RequiredDocItem } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { deleteStepDocument, getStepDocumentUrl, pruneMissingStepDocuments } from '@/lib/actions/documents'
import { setRequiredDocComplete } from '@/lib/actions/required-docs'
import { StepAttachments } from '@/components/journey/step-attachments'
import { type CaseDocument } from '@/lib/documents'

/**
 * 필수 서류 상세. Stone 팔레트 / Fraunces serif — DocsView 와 동일 톤.
 *
 * 4 영역:
 *  1) 헤더 — back link / 동그라미+name / 상태(보유·준비중)
 *  2) 설명 — doc.description (단순 줄바꿈만)
 *  3) 수기 완료 토글 — doc.manual=true 일 때만 노출
 *  4) 미리보기 — previewStepId 의 업로드 파일 (image: <img>, PDF: <iframe>)
 *     파일 없거나 previewStepId 없으면 placeholder.
 */
export function RequiredDocDetail({
  caseId,
  doc,
  previewDocs,
}: {
  caseId: string
  doc: RequiredDocItem
  previewDocs: CaseDocument[]
}) {
  const C = {
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    soft: '#E8DCC4',
    sage: '#8FA68C',
    warn: '#C26A4A',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  const { updateCase } = useCases()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // 진입 시 orphan(삭제됐는데 기록만 남아 'Object not found' 로 뜨는) 문서 정리.
  // 변경 있을 때만 케이스 갱신 → previewDocs 가 다시 계산되어 깨진 항목이 사라짐.
  useEffect(() => {
    let cancelled = false
    pruneMissingStepDocuments(caseId).then((res) => {
      if (!cancelled && res.ok) updateCase(res.value)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, updateCase])

  function handleToggle() {
    setError(null)
    startTransition(async () => {
      const res = await setRequiredDocComplete(caseId, doc.id, !doc.verified)
      if (res.ok) updateCase(res.value)
      else setError(res.error)
    })
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 32,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {/* Back link */}
        <Link
          href={`/cases/${caseId}/docs`}
          style={{
            ...monoCap,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: C.ink2,
            textDecoration: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          서류
        </Link>

        {/* Title row — 일정 step 헤더와 동일하게 동그라미·항목명 수직 중앙 정렬. */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 일정 step 상세 헤더 원과 동일 — 26px, 미완료는 실선 line, 체크 13px. */}
          <div
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: '50%',
              background: doc.verified ? C.sage : 'transparent',
              border: doc.verified ? 'none' : `1px solid ${C.line}`,
              color: C.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {doc.verified && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...serif, fontSize: 24, lineHeight: 1.2, margin: 0, color: C.ink }}>{doc.name}</h1>
          </div>
        </div>

        {/* Description — 일정 step 과 동일한 불릿 형식. 비어있지 않은 줄마다 bullet,
            \n\n 단락 경계는 marginTop 으로 간격. */}
        <section
          style={{
            marginTop: 20,
            padding: '18px 18px',
            borderRadius: 18,
            background: C.surface,
            border: `.5px solid ${C.line}`,
            fontSize: 15,
            lineHeight: 1.65,
            color: C.ink2,
          }}
        >
          {(() => {
            const lines = doc.description.split('\n')
            let paraBreakBefore = false
            return (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {lines.flatMap((line, i) => {
                  if (line.trim() === '') {
                    paraBreakBefore = true
                    return []
                  }
                  const item = (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        marginTop: i === 0 ? 0 : paraBreakBefore ? 14 : 8,
                      }}
                    >
                      <span style={{ flexShrink: 0, color: C.ink3 }} aria-hidden>
                        •
                      </span>
                      <span>{line}</span>
                    </li>
                  )
                  paraBreakBefore = false
                  return [item]
                })}
              </ul>
            )
          })()}
        </section>

        {/* 첨부 — 모든 필수 서류. ① 미리보기(이미지/PDF, 삭제 ×) → ② 파일 추가 버튼.
            attachStepId 태그로 업로드·삭제 (별지25 등은 doc.id, step 연동은 공유 step).
            수기 서류는 사본을 첨부하면 그 자체가 발급 증빙이라 '보유' 처리된다. */}
        <SectionLabel right={previewDocs.length > 0 ? `${previewDocs.length}건` : undefined}>
          첨부
        </SectionLabel>
        {previewDocs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 10 }}>
            {previewDocs.map((d) => (
              <PreviewCard
                key={d.id}
                caseId={caseId}
                doc={d}
                C={C}
                monoCap={monoCap}
                onDelete={() => {
                  deleteStepDocument(caseId, d.id).then((res) => {
                    if (res.ok) updateCase(res.value)
                  })
                }}
              />
            ))}
          </div>
        )}
        {/* 파일명 리스트 없이 업로드 버튼만 (미리보기를 위에서 따로 그림). */}
        <StepAttachments
          caseId={caseId}
          stepId={doc.attachStepId}
          documents={previewDocs}
          hideList
        />

        {/* 보유 — 수기 서류이고 첨부가 없을 때만(첨부가 있으면 그 자체가 발급 증빙).
            설명 → 첨부 → 버튼 순. 안내문은 아직 미완료일 때만. */}
        {doc.manual && previewDocs.length === 0 && (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: `1px solid ${doc.verified ? C.line : C.accent}`,
                background: doc.verified ? 'transparent' : C.accent,
                color: doc.verified ? C.ink2 : C.surface,
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: busy ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {busy ? '처리 중…' : doc.verified ? '완료 취소' : '완료'}
            </button>
            {error && (
              <p style={{ marginTop: 8, fontSize: 12, color: C.warn, lineHeight: 1.5 }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: string }) {
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: '#9A9286',
    fontWeight: 500,
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginTop: 22,
        marginBottom: 10,
        padding: '0 4px',
      }}
    >
      <span style={monoCap}>{children}</span>
      {right && <span style={monoCap}>{right}</span>}
    </div>
  )
}

interface PaletteShape {
  bg: string
  surface: string
  ink: string
  ink2: string
  ink3: string
  line: string
  accent: string
  soft: string
  sage: string
  warn: string
}

function PreviewCard({
  caseId,
  doc,
  C,
  monoCap,
  onDelete,
}: {
  caseId: string
  doc: CaseDocument
  C: PaletteShape
  monoCap: React.CSSProperties
  /** 있으면 카드 헤더에 삭제(×) 노출. */
  onDelete?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getStepDocumentUrl(caseId, doc.id).then((res) => {
      if (cancelled) return
      if (res.ok) setUrl(res.value)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, doc.id])

  const isPdf = doc.mime === 'application/pdf'

  return (
    <div
      style={{
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 30,
            height: 38,
            flexShrink: 0,
            borderRadius: 4,
            background: C.soft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: C.accent,
          }}
        >
          {isPdf ? 'PDF' : 'IMG'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.name}
          </div>
          <div style={{ ...monoCap, marginTop: 2 }}>
            {doc.uploadedAt.slice(0, 10).replace(/-/g, '·')}
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="삭제"
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              border: `.5px solid ${C.line}`,
              background: 'transparent',
              color: C.ink3,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div style={{ borderTop: `.5px solid ${C.line}`, background: '#fff' }}>
        {error ? (
          <div style={{ padding: 16, fontSize: 12, color: C.warn, textAlign: 'center' }}>
            {error}
          </div>
        ) : !url ? (
          <div style={{ padding: 32, fontSize: 12, color: C.ink3, textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : isPdf ? (
          // 모바일 WebView 는 iframe 내 PDF 인라인 렌더를 지원하지 않아 빈 화면이 됨.
          // 인라인 대신 기기 기본 뷰어로 여는 버튼.
          <button
            type="button"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            style={{
              width: '100%',
              padding: '20px 16px',
              border: 0,
              background: 'transparent',
              color: C.accent,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6M10 14 21 3" />
            </svg>
            PDF 열기
          </button>
        ) : (
          <img
            src={url}
            alt={doc.name}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        )}
      </div>
    </div>
  )
}
