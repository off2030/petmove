'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import type { CheckResult, ProcedureCheck, StepDefinition } from '@petmove/domain'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import {
  updateAdvanceNotificationDate,
  updateFlightFields,
  updateMicrochipFields,
  updateRabiesEntryFields,
  updateTiterFields,
  updateVetVisitDate,
} from '@/lib/actions/cases'
import { readCaseDocuments } from '@/lib/documents'
import { AdvanceNotificationInputs } from './advance-notification-inputs'
import { FlightInputs, type FlightForm } from './flight-inputs'
import { MicrochipInputs } from './microchip-inputs'
import { RabiesEntryInputs, type RabiesEntryForm } from './rabies-entry-inputs'
import { StepAttachments } from './step-attachments'
import { TiterInputs, type TiterForm } from './titer-inputs'
import { VetVisitInputs } from './vet-visit-inputs'

interface CollectedCheck {
  check: ProcedureCheck
  result: CheckResult
}

/**
 * 케이스 step 상세 화면. Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 4 영역:
 *  1) 헤더 — back link / 동그라미+title / 펫·여행
 *  2) 설명 — step.description (마크다운은 단순 줄바꿈만)
 *  3) ⚠ 경고 — 매핑된 procedure-checks 중 ok=false
 *  4) 입력 필드 — microchip·광견병1·2차·항체검사 step 은 인터랙티브, 그 외는 read-only 스키마
 *
 * 인터랙티브 step 의 폼 state·dirty·save 는 이 컴포넌트에서 관리. 하단 sticky
 * '저장' 바가 화면 전체 폼 변경을 한 번에 commit. 입력 컴포넌트
 * (MicrochipInputs / RabiesEntryInputs / TiterInputs) 는 controlled — 입력만 담당.
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
  const isRabies1 = step.id === 'rabies-vaccine-1'
  const isRabies2 = step.id === 'rabies-vaccine-2'
  const isRabies = isRabies1 || isRabies2
  // rabies_dates 배열 내 위치 — 1차=0, 2차=1.
  const rabiesIndex = isRabies2 ? 1 : 0
  const isTiter = step.id === 'rabies-titer'
  const isFlight = step.id === 'flight-purchase'
  const isAdvanceNotification = step.id === 'advance-notification'
  const isVetVisit = step.id === 'vet-visit'
  const isInteractive =
    isMicrochip || isRabies || isTiter || isFlight || isAdvanceNotification || isVetVisit
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()

  // 인터랙티브 step 폼 state — 다른 step 에서는 렌더 안 함. hooks 는 매번 호출.
  const savedChip = caseRow?.microchip ?? ''
  const savedDate = readImplantDate(caseRow?.data)
  const [chip, setChip] = useState(savedChip)
  const [date, setDate] = useState(savedDate)

  const savedRabies = readRabiesEntryForm(caseRow?.data, rabiesIndex)
  const [rabies, setRabies] = useState<RabiesEntryForm>(savedRabies)

  const savedTiterForm = readTiterForm(caseRow?.data)
  const [titerForm, setTiterForm] = useState<TiterForm>(savedTiterForm)

  const savedFlightForm = readFlightForm(caseRow?.data)
  const [flightForm, setFlightForm] = useState<FlightForm>(savedFlightForm)

  const savedAdvanceDate = readAdvanceDate(caseRow?.data)
  const [advanceDate, setAdvanceDate] = useState(savedAdvanceDate)

  const savedVetVisitDate = readVetVisitDate(caseRow?.data)
  const [vetVisitDate, setVetVisitDate] = useState(savedVetVisitDate)

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const microchipDirty = isMicrochip && (chip !== savedChip || date !== savedDate)
  const rabiesDirty = isRabies && !rabiesFormEqual(rabies, savedRabies)
  const titerDirty =
    isTiter &&
    (titerForm.date !== savedTiterForm.date ||
      titerForm.lab !== savedTiterForm.lab ||
      titerForm.value !== savedTiterForm.value)
  const flightDirty = isFlight && !flightFormEqual(flightForm, savedFlightForm)
  const advanceDirty = isAdvanceNotification && advanceDate !== savedAdvanceDate
  const vetVisitDirty = isVetVisit && vetVisitDate !== savedVetVisitDate
  const dirty =
    microchipDirty || rabiesDirty || titerDirty || flightDirty || advanceDirty || vetVisitDirty
  // 저장 직후 1.5s 동안 버튼에 '저장됨' 표시. 그 사이 재편집하면 dirty 가 살아나 자동 해제.
  const justSaved = status === 'saved' && !dirty

  // dirty 일 때는 외부 변경(Realtime/admin push) 무시 — 사용자 입력 보존.
  useEffect(() => {
    if (!microchipDirty) setChip(caseRow?.microchip ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.microchip])
  useEffect(() => {
    if (!microchipDirty) setDate(readImplantDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!rabiesDirty) setRabies(readRabiesEntryForm(caseRow?.data, rabiesIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!titerDirty) setTiterForm(readTiterForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!flightDirty) setFlightForm(readFlightForm(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!advanceDirty) setAdvanceDate(readAdvanceDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])
  useEffect(() => {
    if (!vetVisitDirty) setVetVisitDate(readVetVisitDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])

  function handleSave() {
    if (!dirty) return
    if (isMicrochip) {
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
    } else if (isRabies) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateRabiesEntryFields(caseId, rabiesIndex, {
          date: rabies.date || null,
          valid_until: rabies.valid_until || null,
          product: rabies.product || null,
          manufacturer: rabies.manufacturer || null,
          lot: rabies.lot || null,
          expiry: rabies.expiry || null,
        })
        if (res.ok) {
          updateCase(res.value)
          // 서버가 trim·정규화한 값으로 폼을 맞춰 dirty 해제.
          setRabies(readRabiesEntryForm(res.value.data, rabiesIndex))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isTiter) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateTiterFields(caseId, {
          date: titerForm.date || null,
          lab: titerForm.lab || null,
          value: titerForm.value || null,
        })
        if (res.ok) {
          updateCase(res.value)
          setTiterForm(readTiterForm(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isFlight) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateFlightFields(caseId, {
          entry_date: flightForm.entry_date || null,
          entry_departure_airport: flightForm.entry_departure_airport || null,
          entry_airport: flightForm.entry_airport || null,
          entry_flight_number: flightForm.entry_flight_number || null,
          entry_transport: flightForm.entry_transport || null,
          return_date: flightForm.return_date || null,
          return_departure_airport: flightForm.return_departure_airport || null,
          return_arrival_airport: flightForm.return_arrival_airport || null,
          return_flight_number: flightForm.return_flight_number || null,
          return_transport: flightForm.return_transport || null,
        })
        if (res.ok) {
          updateCase(res.value)
          setFlightForm(readFlightForm(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isAdvanceNotification) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateAdvanceNotificationDate(caseId, advanceDate || null)
        if (res.ok) {
          updateCase(res.value)
          setAdvanceDate(readAdvanceDate(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    } else if (isVetVisit) {
      setStatus('saving')
      setError(null)
      startTransition(async () => {
        const res = await updateVetVisitDate(caseId, vetVisitDate || null)
        if (res.ok) {
          updateCase(res.value)
          setVetVisitDate(readVetVisitDate(res.value.data))
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } else {
          setStatus('error')
          setError(res.error)
        }
      })
    }
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
    info: '#6B6457',
    infoBg: 'rgba(42,38,32,0.05)',
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

  // ok=false 체크를 톤별로 분리 — '주의'(blocker/warning) vs '안내'(info).
  const failed = checkResults.filter((c) => !c.result.ok && c.check.severity !== 'info')
  const notices = checkResults.filter((c) => !c.result.ok && c.check.severity === 'info')
  const stepDocuments = readCaseDocuments(caseRow?.data).filter((d) => d.stepId === step.id)

  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        // 인터랙티브 step 일 때 하단 sticky 저장 바 + bottom-nav 공간을 더 확보.
        paddingBottom: isInteractive ? 132 : 32,
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
          {/* description 의 모든 비어있지 않은 줄을 bullet 항목으로 표시.
              \n\n 으로 구분된 단락의 경계는 marginTop 으로 단락 간 간격을 살짝 줌. */}
          {(() => {
            const lines = step.description.split('\n')
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
          {step.id === 'vet-visit' && (
            <Link
              href={`/cases/${caseId}/docs`}
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
              서류 체크리스트
              <span style={{ color: C.ink3 }}>→</span>
            </Link>
          )}
          {step.link && (
            <a
              href={step.link.url}
              target="_blank"
              rel="noopener noreferrer"
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
              {step.link.label}
              <span style={{ color: C.ink3 }}>↗</span>
            </a>
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
              주의 {failed.length}건
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failed.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{check.title}</div>
                  {result.message && (
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                  )}
                  {result.fixHint && (
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: result.message ? 4 : 2, lineHeight: 1.5 }}>↳ {result.fixHint}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 안내 — 오류는 아니지만 미리 알려둘 사항. 주의보다 차분한 중립 톤. */}
        {notices.length > 0 && (
          <section
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 16,
              background: C.infoBg,
              border: `.5px solid ${C.info}26`,
            }}
          >
            <div style={{ ...monoCap, color: C.info, fontWeight: 700, marginBottom: 8 }}>
              안내 {notices.length}건
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notices.map(({ check, result }) => (
                <li key={check.id}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{check.title}</div>
                  {result.message && (
                    <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{result.message}</div>
                  )}
                  {result.fixHint && (
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: result.message ? 4 : 2, lineHeight: 1.5 }}>↳ {result.fixHint}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Inputs — 마이크로칩·광견병1·2차 step 은 인터랙티브, 그 외는 read-only 스키마 미리보기. */}
        {isMicrochip && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <MicrochipInputs chip={chip} date={date} onChipChange={setChip} onDateChange={setDate} />
          </section>
        )}
        {isRabies && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <RabiesEntryInputs
              value={rabies}
              onChange={(key, next) => setRabies((prev) => ({ ...prev, [key]: next }))}
            />
          </section>
        )}
        {isTiter && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <TiterInputs
              form={titerForm}
              onChange={(key, next) => setTiterForm((prev) => ({ ...prev, [key]: next }))}
            />
          </section>
        )}
        {isFlight && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <FlightInputs
              value={flightForm}
              onChange={(key, next) => setFlightForm((prev) => ({ ...prev, [key]: next }))}
              showReturn={tripType === 'round'}
            />
          </section>
        )}
        {isAdvanceNotification && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <AdvanceNotificationInputs date={advanceDate} onChange={setAdvanceDate} />
          </section>
        )}
        {isVetVisit && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>입력</h3>
            <VetVisitInputs date={vetVisitDate} onChange={setVetVisitDate} />
          </section>
        )}
        {!isInteractive && step.inputs && step.inputs.length > 0 && (
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
                const value = caseRow ? resolveInputValue(field.key, caseRow) : null
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
                    {value ? (
                      <div style={{ fontSize: 14, color: C.ink, marginTop: 2 }}>{value}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                        {fieldTypeLabel(field.type)}
                        {field.helpText && ` · ${field.helpText}`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <p style={{ marginTop: 10, fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
              입력 기능은 곧 추가됩니다. 현재는 펫무브워크에서 담당 수의사가 입력합니다.
            </p>
          </section>
        )}

        {/* Attachments */}
        {step.allowAttachments && (
          <section style={{ marginTop: 22 }}>
            <h3 style={{ ...serif, fontSize: 20, margin: '0 0 10px' }}>첨부</h3>
            <StepAttachments
              caseId={caseId}
              stepId={step.id}
              documents={stepDocuments}
              hint={step.attachmentHint}
            />
          </section>
        )}
      </div>

      {/* 하단 sticky 저장 바 — 인터랙티브 step 한정. 한국 모바일 앱 패턴 (토스/카카오/당근).
          dirty 일 때 accent 활성, 아니면 muted disabled. BottomNav(z40) 아래 layer
          이지만 컨텐츠는 BottomNav 위쪽에만 배치돼 시각 겹침 없음. */}
      {isInteractive && (
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
          {status === 'error' && (
            <div
              role="alert"
              style={{
                pointerEvents: 'auto',
                marginBottom: 8,
                padding: '9px 12px',
                borderRadius: 10,
                // 불투명 배경 — 뒤 콘텐츠(첨부 영역)가 비쳐 겹쳐 보이지 않도록.
                background: C.surface,
                border: `.5px solid ${C.warn}55`,
                color: C.warn,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {error ?? '저장 실패'}
            </div>
          )}
          {/* 저장 중·저장됨은 별도 줄 대신 버튼 라벨로 — 첨부 영역과 겹치지 않음. */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || status === 'saving'}
            aria-live="polite"
            style={{
              pointerEvents: 'auto',
              width: '100%',
              padding: '14px 0',
              borderRadius: 14,
              border: 0,
              background: justSaved
                ? C.sage
                : dirty && status !== 'saving'
                  ? C.accent
                  : 'rgba(42,38,32,.10)',
              color: justSaved || (dirty && status !== 'saving') ? '#fff' : C.ink3,
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.005em',
              cursor: dirty && status !== 'saving' ? 'pointer' : 'not-allowed',
              transition: 'background .15s, color .15s',
            }}
          >
            {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
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

/**
 * step input 의 현재 저장된 값을 caseRow 에서 끌어와 화면에 표시할 문자열로 반환.
 *
 * catalog 의 input.key 는 portal 의 미래 입력 폼 스키마라 storage 키와 직접 매칭되지
 * 않는 경우가 있음 (예: rabies_1_date → data.rabies_dates[0].date). 여기서 brigde.
 * 매칭이 없거나 값이 비어있으면 null — 호출부가 placeholder 표시.
 */
function resolveInputValue(
  fieldKey: string,
  caseRow: { microchip: string | null; data?: Record<string, unknown> | null },
): string | null {
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // 마이크로칩 — top-level 컬럼 + data
  if (fieldKey === 'microchip') return caseRow.microchip || null
  if (fieldKey === 'microchip_implant_date') {
    const v = data['microchip_implant_date']
    return typeof v === 'string' && v ? v : null
  }

  // rabies_1_*, rabies_2_* → data.rabies_dates[0|1].(date|valid_until)
  const rabiesMatch = fieldKey.match(/^rabies_(\d+)_(date|valid_until)$/)
  if (rabiesMatch) {
    const idx = Number(rabiesMatch[1]) - 1
    const sub = rabiesMatch[2] as 'date' | 'valid_until'
    const arr = data['rabies_dates']
    if (!Array.isArray(arr)) return null
    const entry = arr[idx]
    if (!entry || typeof entry !== 'object') return null
    const v = (entry as Record<string, unknown>)[sub]
    return typeof v === 'string' && v ? v : null
  }

  // 날짜 배열류 (rabies_titer_records, general_vaccine_dates, civ_dates,
  // infectious_disease_records, external_parasite_dates, ...) — 첫 항목 date 만.
  if (
    fieldKey === 'rabies_titer_records' ||
    fieldKey === 'general_vaccine_dates' ||
    fieldKey === 'civ_dates' ||
    fieldKey === 'infectious_disease_records' ||
    fieldKey === 'external_parasite_dates' ||
    fieldKey === 'internal_parasite_dates'
  ) {
    const arr = data[fieldKey]
    if (!Array.isArray(arr) || arr.length === 0) return null
    // 배열 길이 표시 — n건 형태가 type 'date_array' 와 어울림.
    const dates = arr
      .map((e) => (typeof e === 'string' ? e : (e as { date?: string } | null)?.date))
      .filter((d): d is string => typeof d === 'string' && d.length >= 10)
    if (dates.length === 0) return null
    if (dates.length === 1) return dates[0]
    return `${dates[0]} 외 ${dates.length - 1}건`
  }

  // 그 외 — caseRow.data[fieldKey] 단순 조회
  const v = data[fieldKey]
  if (typeof v === 'string' && v) return v
  if (typeof v === 'number') return String(v)
  return null
}

function readImplantDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['microchip_implant_date']
  return typeof v === 'string' ? v : ''
}

/**
 * 광견병 폼 값을 caseRow.data.rabies_dates[index] 에서 읽어온다 (1차=0, 2차=1).
 * 항목·키가 없으면 빈 문자열 — 입력 컴포넌트는 controlled 라 빈 값이 필요.
 */
function readRabiesEntryForm(
  data: Record<string, unknown> | null | undefined,
  index: number,
): RabiesEntryForm {
  const empty: RabiesEntryForm = {
    date: '', valid_until: '', product: '', manufacturer: '', lot: '', expiry: '',
  }
  if (!data) return empty
  const arr = data['rabies_dates']
  if (!Array.isArray(arr) || index >= arr.length) return empty
  const entry = arr[index]
  if (!entry || typeof entry !== 'object') return empty
  const r = entry as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    date: str(r.date),
    valid_until: str(r.valid_until),
    product: str(r.product),
    manufacturer: str(r.manufacturer),
    lot: str(r.lot),
    expiry: str(r.expiry),
  }
}

function rabiesFormEqual(a: RabiesEntryForm, b: RabiesEntryForm): boolean {
  return (
    a.date === b.date &&
    a.valid_until === b.valid_until &&
    a.product === b.product &&
    a.manufacturer === b.manufacturer &&
    a.lot === b.lot &&
    a.expiry === b.expiry
  )
}

/** 채혈일·검사기관·검사결과 — caseRow.data.rabies_titer_records[0] 의 date / lab / value. */
function readTiterForm(data: Record<string, unknown> | null | undefined): TiterForm {
  const empty: TiterForm = { date: '', lab: '', value: '' }
  if (!data) return empty
  const arr = data['rabies_titer_records']
  if (!Array.isArray(arr) || arr.length === 0) return empty
  const entry = arr[0]
  if (!entry || typeof entry !== 'object') return empty
  const r = entry as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return { date: str(r.date), lab: str(r.lab), value: str(r.value) }
}

/** 항공권 폼 값을 caseRow.data 의 entry_* / return_* 평탄 키에서 읽어온다 (정보 탭과 동일 키). */
function readFlightForm(data: Record<string, unknown> | null | undefined): FlightForm {
  const str = (key: string) => {
    const v = data?.[key]
    return typeof v === 'string' ? v : ''
  }
  return {
    entry_date: str('entry_date'),
    entry_departure_airport: str('entry_departure_airport'),
    entry_airport: str('entry_airport'),
    entry_flight_number: str('entry_flight_number'),
    entry_transport: str('entry_transport'),
    return_date: str('return_date'),
    return_departure_airport: str('return_departure_airport'),
    return_arrival_airport: str('return_arrival_airport'),
    return_flight_number: str('return_flight_number'),
    return_transport: str('return_transport'),
  }
}

function flightFormEqual(a: FlightForm, b: FlightForm): boolean {
  return (
    a.entry_date === b.entry_date &&
    a.entry_departure_airport === b.entry_departure_airport &&
    a.entry_airport === b.entry_airport &&
    a.entry_flight_number === b.entry_flight_number &&
    a.entry_transport === b.entry_transport &&
    a.return_date === b.return_date &&
    a.return_departure_airport === b.return_departure_airport &&
    a.return_arrival_airport === b.return_arrival_airport &&
    a.return_flight_number === b.return_flight_number &&
    a.return_transport === b.return_transport
  )
}

/** 사전 신고 신청일 — caseRow.data.advance_notification_date. */
function readAdvanceDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['advance_notification_date']
  return typeof v === 'string' ? v : ''
}

/** 내원·임상검진 검진일 — caseRow.data.vet_visit_date. */
function readVetVisitDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['vet_visit_date']
  return typeof v === 'string' ? v : ''
}
