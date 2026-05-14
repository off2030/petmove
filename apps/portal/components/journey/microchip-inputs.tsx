'use client'

import { useEffect, useState, useTransition } from 'react'
import { DateTextField } from '@petmove/ui'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { updateMicrochipFields } from '@/lib/actions/cases'

/**
 * 마이크로칩 step 인터랙티브 폼.
 *
 * - 칩 번호: store 는 raw 15-digit, display 는 3자리 공백 구분 (apply/page.tsx 와 동일 mask).
 * - 시술일: @petmove/ui 의 DateTextField (apply 와 동일 컴포넌트).
 * - 저장: 명시 '저장' 버튼 — dirty 여부에 따라 활성/비활성. 펫무브워크 admin 의
 *   상세 페이지 패턴과 동일. (이전엔 onBlur 자동 저장이었으나 사용자가 의도치 않은
 *   저장을 막기 위해 명시 저장으로 변경.)
 * - 저장 응답 CaseRow 는 case-data Context 로 push → TopBar / 일정 화면 즉시 갱신.
 */
export function MicrochipInputs({ caseId }: { caseId: string }) {
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()

  const savedChip = caseRow?.microchip ?? ''
  const savedDate = readImplantDate(caseRow?.data)

  const [chip, setChip] = useState(savedChip)
  const [date, setDate] = useState(savedDate)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const dirty = chip !== savedChip || date !== savedDate

  // 외부에서(admin push / Realtime) caseRow 의 저장된 값이 갱신되면 입력값도 따라가도록 sync.
  // 단, 사용자가 변경 중(dirty) 이면 외부 변경 무시 — 사용자가 입력하던 값 보존.
  useEffect(() => {
    if (!dirty) setChip(caseRow?.microchip ?? '')
    // dirty 일 때 sync 안 함. 사용자가 저장하거나 폐기할 때까지 사용자 입력 유지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.microchip])
  useEffect(() => {
    if (!dirty) setDate(readImplantDate(caseRow?.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow?.data])

  function handleSave() {
    if (!dirty) return

    // 칩 번호는 비우거나(해제) 15자리만 허용 — 그 외는 클라 검증 실패로 저장 안 함.
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

  const chipDisplay = chip.replace(/(\d{3})(?=\d)/g, '$1 ')

  const C = {
    line: 'rgba(42,38,32,.10)',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    accent: '#8A7355',
    sage: '#8FA68C',
    warn: '#C26A4A',
  } as const

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const helpStyle: React.CSSProperties = {
    fontSize: 12,
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
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: '0.04em',
  }
  const saveBtnEnabled = dirty && status !== 'saving'
  const saveBtnStyle: React.CSSProperties = {
    padding: '10px 18px',
    borderRadius: 999,
    border: 0,
    background: saveBtnEnabled ? C.accent : 'rgba(42,38,32,.10)',
    color: saveBtnEnabled ? '#fff' : C.ink3,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '-0.005em',
    cursor: saveBtnEnabled ? 'pointer' : 'not-allowed',
    transition: 'background .15s, color .15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={labelStyle}>마이크로칩 번호</div>
        <div style={helpStyle}>000 000 000 000 000 형식 (3자리씩 공백 구분)</div>
        <input
          type="text"
          inputMode="numeric"
          value={chipDisplay}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 15)
            setChip(digits)
          }}
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
            onChange={(v) => setDate(v)}
            placeholder="YYYY-MM-DD"
          />
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          aria-live="polite"
          style={{
            fontSize: 12,
            color: status === 'error' ? C.warn : status === 'saved' ? C.sage : C.ink3,
            minWidth: 0,
          }}
        >
          {status === 'saving' && '저장 중…'}
          {status === 'saved' && '✓ 저장됨'}
          {status === 'error' && (error ?? '저장 실패')}
          {status === 'idle' && dirty && '변경 사항 있음'}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!saveBtnEnabled}
          style={saveBtnStyle}
        >
          저장
        </button>
      </div>
    </div>
  )
}

function readImplantDate(data: Record<string, unknown> | null | undefined): string {
  if (!data) return ''
  const v = data['microchip_implant_date']
  return typeof v === 'string' ? v : ''
}
