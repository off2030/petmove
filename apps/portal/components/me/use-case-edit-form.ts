'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { validateJpEntryDate, type CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseInfoFields, type CaseInfoInput } from '@/lib/actions/cases'
import { readForm, eqForm } from '@/lib/cases/info-form'

/**
 * 설정 sub-page 들이 공통으로 쓰는 폼 hook.
 * form/base/dirty/status/error + handleSave 를 한 곳에서 관리.
 * 원본 패턴: components/cases/info-view.tsx 의 useState 세트.
 */

export type EditFormStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseCaseEditForm {
  form: CaseInfoInput
  set: <K extends keyof CaseInfoInput>(key: K, value: CaseInfoInput[K]) => void
  dirty: boolean
  status: EditFormStatus
  error: string | null
  handleSave: () => void
}

export function useCaseEditForm(caseRow: CaseRow, caseId: string): UseCaseEditForm {
  const { updateCase } = useCases()
  const [form, setForm] = useState<CaseInfoInput>(() => readForm(caseRow))
  const [base, setBase] = useState<CaseInfoInput>(() => readForm(caseRow))
  const [status, setStatus] = useState<EditFormStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 외부(Realtime/admin) 변경 동기화 — 사용자 미편집(form==base) 시에만 새 값 채택.
  useEffect(() => {
    const next = readForm(caseRow)
    setForm((prev) => (eqForm(prev, base) ? next : prev))
    setBase(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow])

  const dirty = useMemo(() => !eqForm(form, base), [form, base])

  function set<K extends keyof CaseInfoInput>(key: K, value: CaseInfoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (status === 'error') setStatus('idle')
  }

  function handleSave() {
    if (!dirty || status === 'saving') return
    if (form.microchip && form.microchip.length !== 15) {
      setStatus('error')
      setError('15자리 숫자를 입력해주세요.')
      return
    }
    // 왕복 + 귀국일 < 출국일 — server updateCaseInfoFields 와 동일 검증을 client 에서도
    // 선행. server 결과만 의지하면 토스트가 form 변경 useEffect 로 짧게 사라져 "저장됐다"고
    // 오인할 수 있음.
    if (
      form.trip_type === 'round' &&
      form.departure_date &&
      form.return_date &&
      form.return_date < form.departure_date
    ) {
      setStatus('error')
      setError('귀국일은 출국일 이후여야 합니다.')
      return
    }
    if (form.weight.trim()) {
      const n = Number(form.weight)
      if (!Number.isFinite(n) || n < 0) {
        setStatus('error')
        setError('몸무게 형식이 올바르지 않습니다.')
        return
      }
    }
    // 전화번호 — 입력 시 010 + 8자리 (총 11자리 숫자) 강제. mask='phone' 으로
    // 이미 숫자만 들어오므로 길이·prefix 만 확인.
    if (form.phone && !/^010\d{8}$/.test(form.phone)) {
      setStatus('error')
      setError('전화번호는 010-XXXX-XXXX 형식으로 입력해 주세요.')
      return
    }
    // 이메일 — 빈 값 OK, 입력 시 단순 형식 검증 (sub@domain.tld).
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setStatus('error')
      setError('이메일 형식이 올바르지 않습니다.')
      return
    }
    // 일본 입국일 — 광견병 항체 검사 + 180일 이내면 server 가 거부할 입력. 즉시 차단해
    // 빨간 박스로 분명히 보이게 (server 결과만 의지하면 토스트가 짧게 사라질 수 있음).
    const jpEntryErr = validateJpEntryDate(form.departure_date.trim(), {
      data: (caseRow.data ?? {}) as Record<string, unknown>,
      destination: form.destination,
      departureDate: caseRow.departure_date ?? null,
    })
    if (jpEntryErr) {
      setStatus('error')
      setError(jpEntryErr)
      return
    }
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await updateCaseInfoFields(caseId, form)
      if (res.ok) {
        const fresh = readForm(res.value)
        setForm(fresh)
        setBase(fresh)
        updateCase(res.value)
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

  return { form, set, dirty, status, error, handleSave }
}
