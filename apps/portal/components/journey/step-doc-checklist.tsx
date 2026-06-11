'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  JOURNEY_STEP_CATALOG,
  getStepsForCase,
  resolveDone,
  resolveRequiredDocs,
} from '@petmove/domain'
import { activeDestinationView } from '@/lib/cases/active-destination'
import { useCase } from '@/components/portal-shell/case-data-provider'

interface ChecklistRow {
  id: string
  name: string
  /** verified: 보유 또는 완료. na: 해당 없음 처리(분모 제외, ✓ 톤). */
  verified: boolean
  na: boolean
  /** 항목 탭 시 이동할 경로 — 큐레이션 서류는 그 서류 상세(완료 버튼), 폴백은 서류 탭. */
  href: string
}

/**
 * Step detail 페이지의 '서류 체크리스트' 카드. 서류 탭(buildDocsView)과 동일 로직 —
 * spec 이 있는 목적지(예: 일본 5건)는 큐레이션, 그 외는 step.allowAttachments 기반 폴백.
 * verified 시그널·해당없음 토글이 서류 탭과 같은 소스를 보므로 자동 동기.
 *
 * 단, 현재 step 보다 뒤에 발급되는 서류(stepRef.order > currentStep.order)는 제외 —
 * 예: 출국 전 임상검사(vet-visit, order 110)엔 한국 수출 동물검역증(stepRef
 * certificate-issue, order 120)이 미래 단계 서류라 보이지 않는다.
 */
export function StepDocChecklist({
  caseId,
  currentStepId,
  activeDest,
}: {
  caseId: string
  currentStepId: string
  /** 활성 목적지(?dest=) — 다중 목적지에서 서류 체크리스트를 그 목적지 기준으로. */
  activeDest?: string | null
}) {
  const caseRowRaw = useCase(caseId)
  const caseRow = useMemo(
    () => (caseRowRaw ? activeDestinationView(caseRowRaw, activeDest) : caseRowRaw),
    [caseRowRaw, activeDest],
  )
  const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
  const rows = useMemo<ChecklistRow[]>(() => {
    if (!caseRow) return []
    const currentOrder = JOURNEY_STEP_CATALOG.find((s) => s.id === currentStepId)?.order ?? Infinity
    const isFuture = (stepRef: string | undefined) => {
      if (!stepRef) return false
      const ref = JOURNEY_STEP_CATALOG.find((s) => s.id === stepRef)
      return ref ? ref.order > currentOrder : false
    }
    const required = resolveRequiredDocs(caseRow.destination, caseRow)
    if (required) {
      return required
        .filter((d) => !isFuture(d.previewStepId))
        .map((d) => ({
          id: d.id,
          name: d.name,
          verified: d.verified,
          na: d.na,
          // 큐레이션 서류 — 그 서류 상세로(완료/해당없음 버튼이 거기 있음).
          href: `/cases/${caseId}/docs/${d.id}${destQuery}`,
        }))
    }
    const steps = getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)
    return steps
      .filter((s) => s.allowAttachments && s.order <= currentOrder)
      .map((s) => ({
        id: s.id,
        name: s.title,
        verified: resolveDone(s.done, caseRow),
        na: false,
        // 폴백(spec 없는 목적지) — 서류 상세 페이지가 없으므로 서류 탭으로.
        href: `/cases/${caseId}/docs${destQuery}`,
      }))
  }, [caseRow, currentStepId, caseId, destQuery])

  if (rows.length === 0) return null

  const C = {
    surface: 'var(--pm-surface)',
    line: 'var(--pm-line)',
    ink: 'var(--pm-ink)',
    ink2: 'var(--pm-ink-2)',
    ink3: 'var(--pm-ink-3)',
    sage: 'var(--pm-sage)',
  } as const

  // '해당없음' 은 분모에서 빠지고 분자에 1로 친다(서류 탭 카운팅과 같은 규칙).
  const totalDenom = rows.filter((r) => !r.na).length
  const doneNum = rows.filter((r) => r.verified || r.na).length
  // 진행 바 채움 비율 — 분모 0(전부 해당없음)이면 채울 게 없으니 100%로.
  const pct = totalDenom === 0 ? 100 : Math.min(100, Math.round((doneNum / totalDenom) * 100))

  // 제목은 외부 h3('서류 체크리스트')가 담당 — 이 카드 내부엔 카운트만 우측에 노출.
  return (
    <div
      style={{
        padding: '18px 18px',
        borderRadius: 18,
        background: C.surface,
        border: `.5px solid ${C.line}`,
      }}
    >
      {/* '서류 준비 현황' 제목이 바로 위에 있어 라벨은 생략 — 카운트만 우측에. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 12, color: C.ink3, fontVariantNumeric: 'tabular-nums' }}>
          {doneNum}/{totalDenom}
        </span>
      </div>
      <div
        aria-hidden
        style={{
          marginTop: 8,
          height: 5,
          borderRadius: 999,
          background: C.line,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: C.sage,
            borderRadius: 999,
            transition: 'width .3s ease',
          }}
        />
      </div>
      {/* 헤더(진행 바)와 본문(리스트) 사이 구분 — 시각적 호흡 + 얇은 hairline. */}
      <div aria-hidden style={{ marginTop: 18, borderTop: `.5px solid ${C.line}` }} />
      <ul style={{ margin: '18px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((row) => {
          const checked = row.verified || row.na
          return (
            <li key={row.id}>
              {/* 항목 전체가 그 서류 상세(완료/해당없음 버튼)로 가는 링크 — 우측 › 로 이동 신호.
                  "여기서 완료하나?" 혼란을 없애고, 안 채워진 서류를 탭하면 바로 완료 화면으로. */}
              <Link
                href={row.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                  lineHeight: 1.45,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
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
                  <span style={{ fontSize: 11, color: C.ink3 }}>해당 없음</span>
                )}
                <span aria-hidden style={{ marginLeft: 'auto', flexShrink: 0, color: C.ink3, fontSize: 16 }}>
                  ›
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link
        href={`/cases/${caseId}/docs`}
        style={{
          marginTop: 32,
          padding: '9px 14px',
          borderRadius: 999,
          border: `.5px solid ${C.line}`,
          background: 'rgb(var(--pm-surface-rgb) / 0.55)',
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
        자세히
        <span style={{ color: C.ink3 }}>→</span>
      </Link>
    </div>
  )
}
