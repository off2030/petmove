'use client'

import { useRef, useState, useTransition } from 'react'
import { useCases } from '@/components/portal-shell/case-data-provider'
import {
  deleteStepDocument,
  getStepDocumentUrl,
  uploadStepDocument,
} from '@/lib/actions/documents'
import { type CaseDocument, formatFileSize } from '@/lib/documents'

/**
 * journey step '첨부' 영역 — 파일(사진·PDF) 업로드·열람·삭제.
 *
 * 업로드 결과는 case.data.documents 에 기록되어 서류 탭(보관 중인 서류)에도 노출된다.
 * 모든 storage 작업은 lib/actions/documents.ts 의 service-role server action 경유.
 */

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink3: '#9A9286',
  accent: '#B89968',
  soft: '#E8DCC4',
  warn: '#C26A4A',
} as const

export function StepAttachments({
  caseId,
  stepId,
  documents,
  hint,
}: {
  caseId: string
  stepId: string
  documents: CaseDocument[]
  hint?: string
}) {
  const { updateCase } = useCases()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    setError(null)
    const fd = new FormData()
    fd.set('caseId', caseId)
    fd.set('stepId', stepId)
    fd.set('file', file)
    startTransition(async () => {
      const res = await uploadStepDocument(fd)
      if (res.ok) updateCase(res.value)
      else setError(res.error)
    })
  }

  function handleOpen(docId: string) {
    if (openingId) return
    setError(null)
    setOpeningId(docId)
    getStepDocumentUrl(caseId, docId).then((res) => {
      setOpeningId(null)
      if (res.ok) window.open(res.value, '_blank')
      else setError(res.error)
    })
  }

  function handleDelete(docId: string) {
    if (busy) return
    if (!window.confirm('이 파일을 삭제할까요?')) return
    setError(null)
    startTransition(async () => {
      const res = await deleteStepDocument(caseId, docId)
      if (res.ok) updateCase(res.value)
      else setError(res.error)
    })
  }

  return (
    <div>
      {documents.length > 0 && (
        <div
          style={{
            background: C.surface,
            border: `.5px solid ${C.line}`,
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          {documents.map((doc, i) => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderTop: i === 0 ? undefined : `.5px solid ${C.line}`,
              }}
            >
              <FileBadge mime={doc.mime} />
              <button
                type="button"
                onClick={() => handleOpen(doc.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: C.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.name}
                </div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                  {openingId === doc.id ? '여는 중…' : formatFileSize(doc.size)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                aria-label="삭제"
                disabled={busy}
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: `.5px solid ${C.line}`,
                  background: 'transparent',
                  color: C.ink3,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          width: '100%',
          borderRadius: 14,
          padding: 14,
          background: 'transparent',
          border: `1px dashed ${C.accent}80`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            flexShrink: 0,
            background: C.soft,
            color: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v14M5 10l7-7 7 7M3 21h18" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>
            {busy ? '처리 중…' : '파일 추가'}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 1.5 }}>
            {hint ?? '관련 서류 사진/PDF 를 올릴 수 있습니다.'}
          </div>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: C.warn, lineHeight: 1.5 }}>{error}</p>
      )}
    </div>
  )
}

function FileBadge({ mime }: { mime: string }) {
  return (
    <div
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
      {mime === 'application/pdf' ? 'PDF' : 'IMG'}
    </div>
  )
}
