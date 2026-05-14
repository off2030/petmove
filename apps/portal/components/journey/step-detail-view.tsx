import Link from 'next/link'
import type { CheckResult, ProcedureCheck, StepDefinition } from '@petmove/domain'
import { MicrochipInputs } from './microchip-inputs'

interface CollectedCheck {
  check: ProcedureCheck
  result: CheckResult
}

/**
 * 케이스 step 상세 화면. Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 4 영역:
 *  1) 헤더 — pet → 목적지, 뒤로가기
 *  2) 설명 — step.description (마크다운은 단순 줄바꿈만)
 *  3) ⚠ 경고 — 매핑된 procedure-checks 중 ok=false. ok=true 룰은 접힌 카운터로
 *  4) 입력 필드 미리보기 — MVP 에서는 스키마만 표시. 실제 폼은 후속 PR
 */
export function StepDetailView({
  caseId,
  step,
  done,
  stepNumber,
  checkResults,
  destinationLabel,
  petName,
  tripType,
}: {
  caseId: string
  step: StepDefinition
  done: boolean
  /** applicable step 들 안에서 1-based 순번. 일정 row 의 좌측 번호와 동일. */
  stepNumber: number
  checkResults: CollectedCheck[]
  destinationLabel: string
  petName: string
  tripType: 'round' | 'one_way'
}) {
  const C = {
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    sage: '#8FA68C',
    warn: '#C26A4A',
    warnBg: 'rgba(194,106,74,0.08)',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
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

  const failed = checkResults.filter((c) => !c.result.ok)

  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        paddingBottom: 32,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        {/* Back link */}
        <Link
          href={`/cases/${caseId}/journey`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: C.ink2,
            textDecoration: 'none',
            padding: '6px 0',
          }}
        >
          ← 일정으로
        </Link>

        {/* Header — 일정 row 와 동일한 동그라미(완료 ✓ 또는 번호) + 항목명. */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: done ? C.sage : 'transparent',
              border: done ? 'none' : `1px solid ${C.line}`,
              color: done ? C.surface : C.ink3,
              ...num,
              fontSize: 13,
            }}
            aria-hidden
          >
            {done ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              stepNumber
            )}
          </div>
          <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.15, margin: 0, color: C.ink, minWidth: 0 }}>
            {step.title}
          </h1>
        </div>
        <div style={{ fontSize: 12, color: C.ink2, marginTop: 4 }}>
          {petName} · 한국 {tripType === 'round' ? '⇄' : '→'} {destinationLabel}
        </div>

        {/* Description */}
        <section
          style={{
            marginTop: 22,
            padding: '18px 18px',
            borderRadius: 18,
            background: C.surface,
            border: `.5px solid ${C.line}`,
            fontSize: 15,
            lineHeight: 1.65,
            color: C.ink2,
          }}
        >
          {step.description.split(/\n\n+/).map((para, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '14px 0 0' }}>
              {para}
            </p>
          ))}
          {step.id === 'intake' && (
            <Link
              href={`/cases/${caseId}/info`}
              style={{
                marginTop: 14,
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
              검토하러 가기
              <span style={{ color: C.ink3 }}>→</span>
            </Link>
          )}
        </section>

        {/* Warnings */}
        {failed.length > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.warnBg,
              border: `.5px solid ${C.warn}33`,
            }}
          >
            <div style={{ ...monoCap, color: C.warn, fontWeight: 700, marginBottom: 8 }}>
              점검 필요 {failed.length}건
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failed.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{check.title}</div>
                  <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                  {result.fixHint && (
                    <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>↳ {result.fixHint}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Inputs — 마이크로칩 step 은 인터랙티브, 그 외는 read-only 스키마 미리보기. */}
        {step.id === 'microchip' && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력 정보</h3>
            <div
              style={{
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 16,
                padding: '16px 16px',
              }}
            >
              <MicrochipInputs caseId={caseId} />
            </div>
          </section>
        )}
        {step.id !== 'microchip' && step.inputs && step.inputs.length > 0 && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력 정보</h3>
            <div
              style={{
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 16,
                padding: '4px 14px',
              }}
            >
              {step.inputs.map((field, i) => {
                const last = i === (step.inputs?.length ?? 0) - 1
                return (
                  <div
                    key={field.key}
                    style={{
                      padding: '12px 0',
                      borderBottom: last ? 'none' : `.5px solid ${C.line}`,
                    }}
                  >
                    <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
                      {field.label}
                      {field.required && <span style={{ color: C.warn, marginLeft: 4 }}>*</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                      {fieldTypeLabel(field.type)}
                      {field.helpText && ` · ${field.helpText}`}
                    </div>
                  </div>
                )
              })}
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
              입력 기능은 곧 추가됩니다. 현재는 펫무브워크에서 담당 수의사가 입력합니다.
            </p>
          </section>
        )}

        {/* Attachments placeholder */}
        {step.allowAttachments && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>첨부</h3>
            <div
              style={{
                padding: '18px 16px',
                borderRadius: 16,
                background: C.surface,
                border: `.5px dashed ${C.line}`,
                fontSize: 13,
                color: C.ink3,
                lineHeight: 1.55,
              }}
            >
              {step.attachmentHint ?? '관련 서류 사진/PDF 를 올릴 수 있습니다.'}
              <div style={{ marginTop: 6, fontSize: 11, color: C.ink3 }}>업로드는 곧 추가됩니다.</div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function fieldTypeLabel(t: string): string {
  switch (t) {
    case 'date':
      return '날짜'
    case 'date_array':
      return '날짜 (여러 건)'
    case 'text':
      return '텍스트'
    case 'number':
      return '숫자'
    case 'select':
      return '선택'
    case 'textarea':
      return '긴 텍스트'
    default:
      return t
  }
}
