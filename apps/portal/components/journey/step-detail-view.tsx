'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import type { CheckResult, ProcedureCheck, StepDefinition } from '@petmove/domain'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { updateMicrochipFields } from '@/lib/actions/cases'
import { MicrochipInputs } from './microchip-inputs'

interface CollectedCheck {
  check: ProcedureCheck
  result: CheckResult
}

/**
 * 케이스 step 상세 화면. Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 4 영역:
 *  1) 헤더 — back link + 우측 저장 버튼(microchip 한정) / 동그라미+title / 펫·여행
 *  2) 설명 — step.description (마크다운은 단순 줄바꿈만)
 *  3) ⚠ 경고 — 매핑된 procedure-checks 중 ok=false
 *  4) 입력 필드 — microchip step 만 인터랙티브, 그 외는 read-only 스키마
 *
 * microchip step 의 폼 state(chip / date / dirty / save)는 이 컴포넌트에서 관리.
 * iOS Contacts 편집 패턴 — 우상단 '저장' 버튼이 화면 전체 폼 변경을 한 번에 commit.
 * MicrochipInputs 는 controlled (chip/date/setChip/setDate props) 로 입력만 담당.
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
  const isMicrochip = step.id === 'microchip'
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()

  // microchip 폼 state — 다른 step 에서는 아무 효과 없음(렌더 안 함). hooks 는 매번 호출.
  const savedChip = caseRow?.microchip ?? ''
  const savedDate = readImplantDate(caseRow?.data)
  const [chip, setChip] = useState(savedChip)
  const [date, setDate] = useState(savedDate)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const dirty = isMicrochip && (chip !== savedChip || date !== savedDate)

  // dirty 일 때는 외부 변경(Realtime/admin push) 무시 — 사용자 입력 보존.
  useEffect(() => {
    if (!dirty) setChip(caseRow?.microchip ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.microchip])
  useEffect(() => {
    if (!dirty) setDate(readImplantDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])

  function handleSave() {
    if (!isMicrochip || !dirty) return
    if (chip !== '' && chip.length !== 15) {
      setStatus('error')
      setError('마이크로칩 번호는 15자리여야 합니다.')
      return
    }
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await updateMicrochipFields(caseId, chip || null, date || null)
      if (res.ok) {
        updateCase(res.value)
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

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
        // microchip 일 때 하단 sticky 저장 바 + bottom-nav 공간을 더 확보.
        paddingBottom: isMicrochip ? 132 : 32,
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
        {isMicrochip && (
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
              <MicrochipInputs chip={chip} date={date} onChipChange={setChip} onDateChange={setDate} />
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

      {/* 하단 sticky 저장 바 — microchip 한정. 한국 모바일 앱 패턴 (토스/카카오/당근).
          dirty 일 때 accent 활성, 아니면 muted disabled. BottomNav(z40) 아래 layer
          이지만 컨텐츠는 BottomNav 위쪽에만 배치돼 시각 겹침 없음. */}
      {isMicrochip && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: 12,
            paddingLeft: 20,
            paddingRight: 20,
            // bottom-nav 영역(content 41px + max(safe-area, 12px)) 만큼 비워둠 + 12px gap
            paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 53px)',
            background:
              'linear-gradient(180deg, rgba(245,239,232,0) 0%, rgba(245,239,232,.92) 30%, rgba(245,239,232,.92) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 39,
            pointerEvents: 'none',
          }}
        >
          {status !== 'idle' && (
            <div
              aria-live="polite"
              style={{
                textAlign: 'center',
                fontSize: 12,
                color: status === 'error' ? C.warn : status === 'saved' ? C.sage : C.ink3,
                marginBottom: 8,
              }}
            >
              {status === 'saving' && '저장 중…'}
              {status === 'saved' && '✓ 저장됨'}
              {status === 'error' && (error ?? '저장 실패')}
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || status === 'saving'}
            style={{
              pointerEvents: 'auto',
              width: '100%',
              padding: '14px 0',
              borderRadius: 14,
              border: 0,
              background: dirty && status !== 'saving' ? C.accent : 'rgba(42,38,32,.10)',
              color: dirty && status !== 'saving' ? '#fff' : C.ink3,
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              cursor: dirty && status !== 'saving' ? 'pointer' : 'not-allowed',
              transition: 'background .15s, color .15s',
            }}
          >
            저장
          </button>
        </div>
      )}
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

function readImplantDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['microchip_implant_date']
  return typeof v === 'string' ? v : ''
}
