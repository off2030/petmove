'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  JOURNEY_STEP_CATALOG,
  getStepsForCase,
  resolveDone,
  resolveRequiredDocs,
} from '@petmove/domain'
import { useCase } from '@/components/portal-shell/case-data-provider'

interface ChecklistRow {
  id: string
  name: string
  /** verified: 보유 또는 완료. na: 해당 없음 처리(분모 제외, ✓ 톤). */
  verified: boolean
  na: boolean
}

/**
 * Step detail 페이지의 '서류 체크리스트' 카드. 서류 탭(buildDocsView)과 동일 로직 —
 * spec 이 있는 목적지(예: 일본 5건)는 큐레이션, 그 외는 step.allowAttachments 기반 폴백.
 * verified 시그널·해당없음 토글이 서류 탭과 같은 소스를 보므로 자동 동기.
 */
export function StepDocChecklist({ caseId }: { caseId: string }) {
  const caseRow = useCase(caseId)
  const rows = useMemo<ChecklistRow[]>(() => {
    if (!caseRow) return []
    const required = resolveRequiredDocs(caseRow.destination, caseRow)
    if (required) {
      return required.map((d) => ({
        id: d.id,
        name: d.name,
        verified: d.verified,
        na: d.na,
      }))
    }
    const steps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)
    return steps
      .filter((s) => s.allowAttachments)
      .map((s) => ({
        id: s.id,
        name: s.title,
        verified: resolveDone(s.done, caseRow),
        na: false,
      }))
  }, [caseRow])

  if (rows.length === 0) return null

  const C = {
    surface: 'var(--pm-surface)',
    line: 'var(--pm-line)',
    ink: 'var(--pm-ink)',
    ink2: 'var(--pm-ink-2)',
    ink3: 'var(--pm-ink-3)',
    sage: 'var(--pm-sage)',
  } as const
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  // '해당없음' 은 분모에서 빠지고 분자에 1로 친다(서류 탭 카운팅과 같은 규칙).
  const totalDenom = rows.filter((r) => !r.na).length
  const doneNum = rows.filter((r) => r.verified || r.na).length

  return (
    <section
      style={{
        marginTop: 16,
        padding: '18px 18px',
        borderRadius: 18,
        background: C.surface,
        border: `.5px solid ${C.line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ ...monoCap }}>서류 체크리스트</div>
        <div style={{ fontSize: 12, color: C.ink3, fontVariantNumeric: 'tabular-nums' }}>
          {doneNum}/{totalDenom}
        </div>
      </div>
      <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row) => {
          const checked = row.verified || row.na
          return (
            <li
              key={row.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45 }}
            >
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: checked ? C.sage : 'transparent',
                  border: checked ? 'none' : `1px solid ${C.line}`,
                  color: checked ? C.surface : C.ink3,
                }}
              >
                {checked && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span style={{ color: checked ? C.ink2 : C.ink, textDecoration: row.na ? 'line-through' : 'none' }}>
                {row.name}
              </span>
              {row.na && (
                <span style={{ marginLeft: 4, fontSize: 11, color: C.ink3 }}>해당 없음</span>
              )}
            </li>
          )
        })}
      </ul>
      <Link
        href={`/cases/${caseId}/docs`}
        style={{
          marginTop: 16,
          padding: '9px 14px',
          borderRadius: 999,
          border: `.5px solid ${C.line}`,
          background: 'rgba(255,253,247,.55)',
          color: C.ink,
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          textDecoration: 'none',
        }}
      >
        서류 탭으로 바로가기
        <span style={{ color: C.ink3 }}>→</span>
      </Link>
    </section>
  )
}
