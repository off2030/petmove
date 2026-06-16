'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { getStepDocumentUrl, pruneMissingStepDocuments } from '@/lib/actions/documents'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { CaseHeader } from '@/components/cases/case-header'
import { StepAttachments } from '@/components/journey/step-attachments'
import type { AutoDocItem, DocsViewData, StoredDocItem } from '@/lib/docs/catalog'

/**
 * 케이스 서류함. Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 시각 소스: docs/portal-preview/docs.jsx — 그대로 옮김.
 * Phase 1 read-only: 업로드 버튼은 placeholder, 다운로드 버튼은 표시만.
 */
export function DocsView({
  data,
  caseId,
  activeDest,
}: {
  data: DocsViewData
  caseId: string
  /** 활성 목적지(?dest=) — 다중 목적지에서 서류 상세로 들어갈 때 유지. */
  activeDest?: string | null
}) {
  const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
  const C = {
    bg: 'var(--pm-bg)',
    surface: 'var(--pm-surface)',
    ink: 'var(--pm-ink)',
    ink2: 'var(--pm-ink-2)',
    ink3: 'var(--pm-ink-3)',
    line: 'var(--pm-line)',
    accent: 'var(--pm-accent)',
    soft: 'var(--pm-accent-soft)',
    sage: 'var(--pm-sage)',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  }
  const num: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  const { updateCase } = useCases()
  // 진입 시 orphan(삭제됐는데 기록만 남은) 문서 정리 — storedDocs·미리보기의
  // 'Object not found' 항목 제거. 변경 있을 때만 케이스 갱신.
  useEffect(() => {
    let cancelled = false
    pruneMissingStepDocuments(caseId).then((res) => {
      if (!cancelled && res.ok) updateCase(res.value)
    })
    return () => {
      cancelled = true
    }
  }, [caseId, updateCase])

  const { pet, trip, requiredDocs, checklist, quarantineDocs, autoDocs, storedDocs } = data
  const quarantineDone = quarantineDocs.filter((d) => d.verified).length
  // requiredDocs spec 이 있는 목적지(예: 일본)는 큐레이션된 5건만 보고,
  // 기존 자동 체크리스트·자동 작성 섹션은 가린다.
  const useCurated = requiredDocs !== null
  const checklistDone = checklist.filter((d) => d.verified).length
  const requiredDone = requiredDocs?.filter((d) => d.verified).length ?? 0
  // '해당없음' 으로 표시한 서류는 분모에서 제외 — 보유/해당없음을 다 정리하면 X/X.
  const requiredTotal = requiredDocs?.filter((d) => !d.na).length ?? 0

  function handleOpenDoc(docId: string) {
    getStepDocumentUrl(caseId, docId).then((res) => {
      if (res.ok) window.open(res.value, '_blank')
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
        paddingBottom: 24,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {/* Header */}
        <CaseHeader
          caseId={caseId}
          tab="docs"
          petName={pet.name}
          fromCity={trip.fromCity}
          toCity={trip.toCity}
          tripType={trip.tripType}
          ink={C.ink}
          ink2={C.ink2}
          ink3={C.ink3}
          serif={serif}
        />

        {useCurated ? (
          /* 큐레이션 모드: 국가별 '필수 서류' 한 섹션 (예: 일본 5건) */
          <>
            <SectionLabel right={`${requiredDone}/${requiredTotal}`}>서류 체크리스트</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {requiredDocs!.map((d) => (
                <ChecklistRow
                  key={d.id}
                  doc={d}
                  C={C}
                  monoCap={monoCap}
                  pendingLabel="준비중"
                  href={`/cases/${caseId}/docs/${d.id}${destQuery}`}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* 1) Checklist */}
            <SectionLabel right={`${checklistDone}/${checklist.length}`}>서류 체크리스트</SectionLabel>
            {checklist.length === 0 ? (
              <EmptyHint>이 목적지에는 보호자가 따로 챙길 서류가 없습니다.</EmptyHint>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {checklist.map((d) => (
                  <ChecklistRow key={d.id} doc={d} C={C} monoCap={monoCap} />
                ))}
              </div>
            )}

            {/* 2) 증명서 자동 작성 */}
            <SectionLabel right={`${autoDocs.length}건`}>증명서 자동 작성</SectionLabel>
            {autoDocs.length === 0 ? (
              <EmptyHint>이 목적지는 자동 작성 증명서가 없습니다.</EmptyHint>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {autoDocs.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      background: C.surface,
                      border: `.5px solid ${C.line}`,
                      borderRadius: 14,
                      overflow: 'hidden',
                    }}
                  >
                    <DocRow doc={d} pending={!d.verified} C={C} num={num} monoCap={monoCap} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 검역증 — 검역 단계에서 받는 증명서. 행 클릭 시 해당 일정 step 상세(첨부·완료)로 이동. */}
        {quarantineDocs.length > 0 && (
          <>
            <SectionLabel right={`${quarantineDone}/${quarantineDocs.length}`}>검역증</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {quarantineDocs.map((d) => (
                <ChecklistRow
                  key={d.id}
                  doc={d}
                  C={C}
                  monoCap={monoCap}
                  pendingLabel="받기 전"
                  href={`/cases/${caseId}/journey/${d.id}${destQuery}`}
                />
              ))}
            </div>
          </>
        )}

        {/* 3) 보관함 — 라벨 + '파일 추가' 카드만으로 직관적이라 빈 상태 설명문 생략. */}
        <SectionLabel right={`${storedDocs.length}건`}>보관함</SectionLabel>
        {storedDocs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {storedDocs.map((d) => (
              <div
                key={d.id}
                style={{
                  background: C.surface,
                  border: `.5px solid ${C.line}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <DocRow
                  doc={d}
                  pending={!d.verified}
                  C={C}
                  num={num}
                  monoCap={monoCap}
                  onDownload={() => handleOpenDoc(d.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* 사본 추가 업로드 — 다른 파일 추가 필드와 동일한 StepAttachments. 보관함은
            전체 documents 를 보여주므로 stepId='misc' 로 태깅(서류명은 원본 파일명).
            올린 파일은 위 보관함 리스트에 합류. 모바일은 탭 시 카메라/사진/파일 선택. */}
        <div style={{ marginTop: 14 }}>
          <StepAttachments
            caseId={caseId}
            stepId="misc"
            documents={[]}
            hideList
            hint="추가로 보관하고 싶은 사진, PDF를 저장하세요."
          />
        </div>
      </div>
    </div>
  )
}

// ── 하위 컴포넌트 ────────────────────────────────────────────────────────

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

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--pm-surface)',
        border: '.5px dashed var(--pm-line)',
        borderRadius: 14,
        padding: '14px 16px',
        fontSize: 13,
        color: 'var(--pm-ink-3)',
        lineHeight: 1.55,
      }}
    >
      {children}
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
}

function ChecklistRow({
  doc,
  C,
  monoCap,
  pendingLabel = '대기',
  href,
}: {
  doc: { id: string; name: string; source: string; verified: boolean; na?: boolean; awaiting?: boolean }
  C: PaletteShape
  monoCap: React.CSSProperties
  /** 미준비 상태의 우측 라벨. 기본 '대기'. 큐레이션 섹션은 '준비중'. awaiting 일 땐 무시. */
  pendingLabel?: string
  /** 있으면 카드 전체가 Link 가 되어 상세 페이지로 이동. */
  href?: string
}) {
  const ok = doc.verified
  // 해당없음 — 보유도 미준비도 아닌 회색 톤 상태. 카운트 분모에서 제외됨.
  const na = doc.na === true
  // 발급 예정 — 다른 step 완료 후 자동 발급되는 서류 (한국 수출 동물검역증 등).
  // 보호자 능동 '준비중' 과 구분되는 수동 '대기' 상태 — opacity·라벨로 시각 분리.
  const awaiting = doc.awaiting === true && !ok && !na
  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 14,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textDecoration: 'none',
    color: 'inherit',
    cursor: href ? 'pointer' : 'default',
    opacity: awaiting ? 0.6 : 1,
  }
  const inner = (
    <>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          background: ok ? C.sage : 'transparent',
          // 일정 타임라인 미완료 원과 동일하게 — 점선 ink3 → 실선 line.
          border: ok ? 'none' : `1px solid ${C.line}`,
          color: ok ? C.surface : C.ink3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ok ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : na ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: ok ? C.ink : na ? C.ink3 : C.ink2,
          }}
        >
          {doc.name}
        </div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{doc.source}</div>
      </div>
      <span
        style={{
          ...monoCap,
          color: ok ? C.sage : C.ink3,
          fontWeight: 600,
        }}
      >
        {ok ? '있음' : na ? '해당없음' : awaiting ? '발급 예정' : pendingLabel}
      </span>
    </>
  )
  return href ? (
    <Link href={href} style={cardStyle}>
      {inner}
    </Link>
  ) : (
    <div style={cardStyle}>{inner}</div>
  )
}

function DocRow({
  doc,
  pending,
  C,
  num,
  monoCap,
  onDownload,
}: {
  doc: AutoDocItem | StoredDocItem
  pending: boolean
  C: PaletteShape
  num: React.CSSProperties
  monoCap: React.CSSProperties
  /** 있으면 다운로드 버튼이 활성화돼 클릭 시 호출 (보관 중인 서류 한정). */
  onDownload?: () => void
}) {
  const sized = 'size' in doc && doc.size ? doc.size : null
  return (
    <div
      style={{
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <DocIcon docType={doc.type} pending={pending} C={C} num={num} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: pending ? C.ink2 : C.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {doc.name}
          </span>
          {doc.fresh && (
            <span
              style={{
                ...monoCap,
                padding: '1px 6px',
                background: C.soft,
                color: C.accent,
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              NEW
            </span>
          )}
        </div>
        <div style={{ ...num, fontSize: 12, color: C.ink3, marginTop: 3 }}>
          {doc.date ? doc.date.replace(/-/g, '·') : '발급 대기'}
          {sized && ` · ${sized}`} · {doc.source}
        </div>
      </div>
      {pending ? (
        <span
          style={{
            ...monoCap,
            padding: '4px 8px',
            background: 'rgb(var(--pm-ink-rgb) / .04)',
            borderRadius: 999,
          }}
        >
          대기
        </span>
      ) : (
        <button
          type="button"
          aria-label="열기"
          onClick={onDownload}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: `.5px solid ${C.line}`,
            background: 'transparent',
            color: C.ink2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: onDownload ? 'pointer' : 'not-allowed',
          }}
          disabled={!onDownload}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
      )}
    </div>
  )
}

function DocIcon({
  docType,
  pending,
  C,
  num,
}: {
  docType: string
  pending: boolean
  C: PaletteShape
  num: React.CSSProperties
}) {
  return (
    <div
      style={{
        width: 36,
        height: 44,
        borderRadius: 4,
        flexShrink: 0,
        background: pending ? 'rgb(var(--pm-ink-rgb) / .04)' : C.soft,
        border: pending ? `.5px dashed ${C.line}` : 'none',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {pending ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.ink3}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      ) : (
        <span
          style={{
            ...num,
            fontSize: 10,
            fontWeight: 500,
            color: C.accent,
            letterSpacing: '0.08em',
          }}
        >
          {docType.toUpperCase()}
        </span>
      )}
      {!pending && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 9,
            height: 9,
            background: 'rgba(255,255,255,.5)',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
          }}
        />
      )}
    </div>
  )
}

