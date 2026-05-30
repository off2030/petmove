'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { CaseRow } from '@petmove/domain'
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
      setError('마이크로칩 번호는 15자리여야 합니다.')
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
