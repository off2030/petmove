'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import type { RequiredDocItem } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { getStepDocumentUrl, pruneMissingStepDocuments } from '@/lib/actions/documents'
import { setRequiredDocComplete } from '@/lib/actions/required-docs'
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
          서류함
        </Link>

        {/* Title row */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              marginTop: 6,
              background: doc.verified ? C.sage : 'transparent',
              border: doc.verified ? 'none' : `1px dashed ${C.ink3}`,
              color: C.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {doc.verified && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...serif, fontSize: 22, lineHeight: 1.25, margin: 0, color: C.ink }}>{doc.name}</h1>
          </div>
        </div>

        {/* Description */}
        <div
          style={{
            marginTop: 20,
            background: C.surface,
            border: `.5px solid ${C.line}`,
            borderRadius: 14,
            padding: '16px 18px',
            fontSize: 14,
            lineHeight: 1.7,
            color: C.ink2,
            whiteSpace: 'pre-line',
          }}
        >
          {doc.description}
        </div>

        {/* Manual toggle */}
        {doc.manual && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={busy}
            style={{
              marginTop: 14,
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
            {busy ? '처리 중…' : doc.verified ? '보유 표시 해제' : '보유로 표시'}
          </button>
        )}

        {error && (
          <p style={{ marginTop: 8, fontSize: 12, color: C.warn, lineHeight: 1.5 }}>{error}</p>
        )}

        {/* Preview */}
        <SectionLabel right={previewDocs.length > 0 ? `${previewDocs.length}건` : undefined}>
          디지털 원본·사본
        </SectionLabel>
        {previewDocs.length === 0 ? (
          <div
            style={{
              background: C.surface,
              border: `.5px dashed ${C.line}`,
              borderRadius: 14,
              padding: '20px 16px',
              fontSize: 13,
              color: C.ink3,
              lineHeight: 1.6,
              textAlign: 'center',
            }}
          >
            아직 올린 원본이나 사본이 없습니다.
            {doc.previewStepId && (
              <div style={{ marginTop: 6 }}>
                <Link
                  href={`/cases/${caseId}/journey/${doc.previewStepId}`}
                  style={{ color: C.accent, textDecoration: 'underline' }}
                >
                  관련 단계에서 파일을 올릴 수 있습니다
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {previewDocs.map((d) => (
              <PreviewCard key={d.id} caseId={caseId} doc={d} C={C} monoCap={monoCap} />
            ))}
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
}: {
  caseId: string
  doc: CaseDocument
  C: PaletteShape
  monoCap: React.CSSProperties
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
          <iframe
            src={url}
            title={doc.name}
            style={{ width: '100%', height: 480, border: 0, display: 'block' }}
          />
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
