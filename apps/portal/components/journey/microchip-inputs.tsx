'use client'

import { useEffect, useState, useTransition } from 'react'
import { DateTextField } from '@petmove/ui'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { updateMicrochipFields } from '@/lib/actions/cases'

/**
 * 마이크로칩 step 인터랙티브 폼.
 *
 * - 칩 번호: store 는 raw 15-digit, display 는 3자리 공백 구분. apply/page.tsx 의 mask 와 동일.
 *   onBlur 시점에 server action 호출(자동 저장) — 보호자가 명시 저장 버튼 없이 입력하다 화면을 떠도 보존.
 * - 시술일: @petmove/ui 의 DateTextField (apply 와 동일 컴포넌트). onChange 가 commit 한 값을 즉시 저장.
 *
 * 저장 결과 CaseRow 는 case-data Context 로 push — TopBar / 일정 화면이 같은 컨텍스트를 본다.
 * 검증 실패(15자리 아님)는 인라인 메시지로 표시, 서버 호출 안 함.
 */
export function MicrochipInputs({ caseId }: { caseId: string }) {
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()

  const initialChip = caseRow?.microchip ?? ''
  const initialDate = readImplantDate(caseRow?.data)

  const [chip, setChip] = useState(initialChip)
  const [date, setDate] = useState(initialDate)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 외부에서(예: admin push, Realtime) case 가 갱신되면 입력값도 따라가도록 sync.
  // 단, 사용자가 입력 중인 동안(focus) sync 하면 글자 사라짐 — onBlur 후에만 동기화.
  useEffect(() => {
    setChip(caseRow?.microchip ?? '')
  }, [caseRow?.microchip])
  useEffect(() => {
    setDate(readImplantDate(caseRow?.data))
  }, [caseRow?.data])

  function commit(nextChip: string, nextDate: string) {
    // 변경 없으면 no-op
    const prevChip = caseRow?.microchip ?? ''
    const prevDate = readImplantDate(caseRow?.data)
    if (nextChip === prevChip && nextDate === prevDate) return

    // 칩 번호는 비우거나(해제) 15자리만 허용 — 그 외는 클라 검증 실패로 저장 안 함.
    if (nextChip !== '' && nextChip.length !== 15) {
      setStatus('error')
      setError('마이크로칩 번호는 15자리여야 합니다.')
      return
    }

    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await updateMicrochipFields(caseId, nextChip || null, nextDate || null)
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

  const chipDisplay = chip.replace(/(\d{3})(?=\d)/g, '$1 ')

  const C = {
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    sage: '#8FA68C',
    warn: '#C26A4A',
  } as const

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const helpStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: C.ink3,
    marginTop: 2,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={labelStyle}>
          마이크로칩 번호 <span style={{ color: C.warn }}>*</span>
        </div>
        <div style={helpStyle}>000 000 000 000 000 형식 (3자리씩 공백 구분)</div>
        <input
          type="text"
          inputMode="numeric"
          value={chipDisplay}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 15)
            setChip(digits)
          }}
          onBlur={() => commit(chip, date)}
          placeholder="000 000 000 000 000"
          maxLength={19}
          style={inputStyle}
        />
      </div>
      <div>
        <div style={labelStyle}>시술일</div>
        <div style={helpStyle}>달력에서 선택하거나 YYYY-MM-DD 로 입력하세요.</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={date}
            onChange={(v) => {
              setDate(v)
              // DateTextField 는 commit 된 값을 onChange 로 전달 — 즉시 저장.
              commit(chip, v)
            }}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: 11.5,
          color: status === 'error' ? C.warn : status === 'saved' ? C.sage : C.ink3,
          minHeight: 16,
        }}
      >
        {status === 'saving' && '저장 중…'}
        {status === 'saved' && '✓ 저장됨'}
        {status === 'error' && (error ?? '저장 실패')}
      </div>
    </div>
  )
}

function readImplantDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['microchip_implant_date']
  return typeof v === 'string' ? v : ''
}
