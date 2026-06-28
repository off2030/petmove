'use client'


import { C } from '@/lib/palette'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import type { RequiredDocItem } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { deleteStepDocument, getStepDocumentUrl, pruneMissingStepDocuments } from '@/lib/actions/documents'
import { downloadFile } from '@/lib/native/download'
import { useMediaViewer } from '@/components/portal-shell/media-viewer'
import { setRequiredDocComplete, setRequiredDocNa } from '@/lib/actions/required-docs'
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
  activeDest,
}: {
  caseId: string
  doc: RequiredDocItem
  previewDocs: CaseDocument[]
  /** 활성 목적지(?dest=) — 다중 목적지에서 완료/해당없음을 그 목적지(by_dest)로 저장. */
  activeDest?: string | null
}) {

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
      const res = await setRequiredDocComplete(caseId, doc.id, !doc.verified, activeDest)
      if (res.ok) updateCase(res.value)
      else setError(res.error)
    })
  }

  function handleToggleNa() {
    setError(null)
    startTransition(async () => {
      const res = await setRequiredDocNa(caseId, doc.id, !doc.na, activeDest)
      if (res.ok) updateCase(res.value)
      else setError(res.error)
    })
  }

  // 첨부가 곧 발급 증빙 — 완료를 자동으로 잠근다(일정 step 의 '저장' 비활성과 동일).
  const hasAttachment = previewDocs.length > 0

  const btnBase: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: busy ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
  const primaryBtn: React.CSSProperties = {
    ...btnBase,
    border: `1px solid ${C.accent}`,
    background: C.accent,
    color: C.surface,
  }
  const outlineBtn: React.CSSProperties = {
    ...btnBase,
    border: `1px solid ${C.line}`,
    background: 'transparent',
    color: C.ink2,
  }
  // 일정 step 의 비활성 '저장' 바와 동일 톤 — 회색 면 채움 + not-allowed.
  const disabledBtn: React.CSSProperties = {
    ...btnBase,
    border: 0,
    background: 'var(--pm-line)',
    color: C.ink3,
    cursor: 'not-allowed',
  }
  // '해당없음' — 대부분 케이스에서 누르는 버튼이라 흐린 outline 대신 채움으로 또렷하게.
  const naBtn: React.CSSProperties = {
    ...btnBase,
    border: `1px solid ${C.soft}`,
    background: C.soft,
    color: C.ink,
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
          href={`/cases/${caseId}/docs${activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''}`}
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
          {/* 일정 step 상세 헤더 원과 동일 — 26px, 미완료는 실선 line, 체크 13px.
              해당없음은 회색 톤 dash(—). */}
          <div
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: '50%',
              background: doc.verified ? C.sage : 'transparent',
              border: doc.verified ? 'none' : `1px solid ${C.line}`,
              color: doc.verified ? C.surface : C.ink3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {doc.verified ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : doc.na ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ) : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...serif, fontSize: 18, lineHeight: 1.2, margin: 0, color: C.ink }}>{doc.name}</h1>
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

        {/* 서식 다운로드(빈 지정 양식, 별지25 등) — 출시 범위에서 제외(2026-06-28). 데이터(doc.templates)와
            downloadFile 경로는 남겨 두고 이 섹션 UI 만 내림. 재도입 시 이 블록을 복원. */}

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

        {/* 상태 토글 — 수기 서류. 일정 step 의 '저장' 바와 동일하게: 첨부가 있으면
            버튼이 사라지지 않고 비활성(회색)으로 남는다 — 첨부 자체가 발급 증빙이라
            완료를 잠그고, 되돌리려면 위 첨부 카드의 ×로 삭제. 설명 → 첨부 → 버튼 순.
            naAllowed 서류는 미완료 시 '해당없음' 도 노출. */}
        {doc.manual && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {doc.na ? (
              <button type="button" onClick={handleToggleNa} disabled={busy} style={outlineBtn}>
                {busy ? '처리 중…' : '해당없음 취소'}
              </button>
            ) : hasAttachment ? (
              <button type="button" disabled style={disabledBtn}>
                ✓ 있음
              </button>
            ) : doc.awaiting ? (
              // 발급 예정 — 발급(선행 step) 전이라 아직 받지 못한 서류. 직접 '완료' 불가
              // (체크리스트 '발급 예정' 과 동일 게이트). 완료 경로: ① 발급 단계 도래로 awaiting
              // 해제되면 완료 활성, ② 미리 받았으면 위에서 첨부 → 첨부가 발급 증빙이라 완료.
              // naAllowed 면 '해당없음' 은 그대로 허용.
              <>
                <button type="button" disabled style={disabledBtn}>
                  준비했어요
                </button>
                {doc.naAllowed && (
                  <button type="button" onClick={handleToggleNa} disabled={busy} style={naBtn}>
                    해당없음
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={busy}
                  style={doc.verified ? outlineBtn : primaryBtn}
                >
                  {busy ? '처리 중…' : doc.verified ? '✓ 있음' : '준비했어요'}
                </button>
                {doc.naAllowed && !doc.verified && (
                  <button
                    type="button"
                    onClick={handleToggleNa}
                    disabled={busy}
                    style={naBtn}
                  >
                    해당없음
                  </button>
                )}
              </>
            )}
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
    color: 'var(--pm-ink-3)',
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
  const { openImage } = useMediaViewer()
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
      <div style={{ borderTop: `.5px solid ${C.line}`, background: 'var(--pm-surface)' }}>
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
          // PDF 는 다운로드(네이티브는 저장·공유 시트, 웹은 새 탭/다운로드)로 처리.
          <button
            type="button"
            onClick={() => void downloadFile(url, doc.name)}
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
            PDF 다운로드
          </button>
        ) : (
          // 이미지: 탭하면 앱 내장 전체화면 뷰어(저장 버튼 포함)로 크게 본다.
          <img
            src={url}
            alt={doc.name}
            onClick={() => openImage(url, doc.name)}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer' }}
          />
        )}
      </div>
    </div>
  )
}
