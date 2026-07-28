'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { validateJpEntryDate, validateTwEntryDate, type CaseRow } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseInfoFields, type CaseInfoInput } from '@/lib/actions/cases'
import { readForm, eqForm } from '@/lib/cases/info-form'
import { showConflictNotice } from '@/lib/cases/conflict-notice'

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
  const confirm = useConfirm()
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
      setError('15자리 숫자를 입력하세요.')
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
      setError('귀국일은 출국일 이후여야 해요.')
      return
    }
    if (form.weight.trim()) {
      const n = Number(form.weight)
      if (!Number.isFinite(n) || n < 0) {
        setStatus('error')
        setError('몸무게 형식이 올바르지 않아요.')
        return
      }
    }
    // 전화번호 — 입력 시 010 + 8자리 (총 11자리 숫자) 강제. mask='phone' 으로
    // 이미 숫자만 들어오므로 길이·prefix 만 확인.
    if (form.phone && !/^010\d{8}$/.test(form.phone)) {
      setStatus('error')
      setError('전화번호는 010-XXXX-XXXX 형식으로 입력하세요.')
      return
    }
    // 이메일 — 빈 값 OK, 입력 시 단순 형식 검증 (sub@domain.tld).
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setStatus('error')
      setError('이메일 형식이 올바르지 않아요.')
      return
    }
    // 일본 입국일 — 광견병 항체 검사 + 180일 이내면 server 가 거부할 입력. 즉시 차단해
    // 빨간 박스로 분명히 보이게 (server 결과만 의지하면 토스트가 짧게 사라질 수 있음).
    //
    // 단, 사용자가 출국일·목적지·생년월일을 **실제로 바꾼 경우에만** 검증한다. 이 폼 hook 은
    // 보호자·동물·여행 sub-page 가 공유하므로, 그 칸들을 안 건드린 화면(예: 보호자 연락처)에서
    // 이미 저장돼 있던 출국일의 기존 위반으로 무관한 저장이 막히면 안 된다. (출국일을 바꾸는
    // 여행 화면에선 그대로 차단.) server updateCaseInfoFields 도 동일 조건(base 비교)으로 검증.
    const entryInputsChanged =
      form.departure_date !== base.departure_date ||
      form.destination !== base.destination ||
      form.birth_date !== base.birth_date
    if (entryInputsChanged) {
      const entryRuleCtx = {
        data: (caseRow.data ?? {}) as Record<string, unknown>,
        destination: form.destination,
        departureDate: caseRow.departure_date ?? null,
      }
      // 일본·대만 — 항체 검사 채혈 + 180일 대기(회복 불가 위반) client 즉시 차단.
      // server(updateCaseInfoFields)가 전 목적지 backstop.
      const entryErr =
        validateJpEntryDate(form.departure_date.trim(), entryRuleCtx) ??
        validateTwEntryDate(form.departure_date.trim(), entryRuleCtx)
      if (entryErr) {
        setStatus('error')
        setError(entryErr)
        return
      }
    }
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await updateCaseInfoFields(caseId, form, base)
      if (res.ok) {
        const fresh = readForm(res.value)
        setForm(fresh)
        setBase(fresh)
        updateCase(res.value)
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 1500)
      } else if ('conflict' in res && res.conflict) {
        // 같은 칸을 그 사이 다른 곳에서 바꿈 — 저장 안 됨. 안내 후 최신 내용 불러오기.
        setStatus('idle')
        await showConflictNotice(confirm)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

  return { form, set, dirty, status, error, handleSave }
}
