'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { CaseRow } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateGuardianContact, type CustomerProfileRow, type GuardianContactInput } from '@/lib/actions/profile'
import { readForm } from '@/lib/cases/info-form'

/**
 * /me/guardian 전용 폼 hook — 보호자 연락처는 profile 이 권위 소유.
 *
 * 읽기: profile 우선, 비어 있으면 primary 케이스(readForm)로 폴백 (백필 전 데이터 호환).
 * 저장: updateGuardianContact 가 profile + 연결된 모든 케이스로 전파 → updateProfile +
 *   각 케이스 updateCase 로 클라이언트 즉시 동기화. (옛 useCaseEditForm 은 케이스 1건만
 *   저장해 동물이 여러 마리면 한 마리만 바뀌던 버그가 있었음.)
 */

export type GuardianFormStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface GuardianForm {
  customer_name: string
  customer_first_name_en: string
  customer_last_name_en: string
  phone: string
  email: string
  address_kr: string
  address_detail_kr: string
  address_zipcode: string
  address_en: string
}

function readGuardian(profile: CustomerProfileRow | null, primary: CaseRow | null): GuardianForm {
  // 케이스 폴백값 — 백필 전이거나 profile 칸이 빈 경우.
  const c = primary ? readForm(primary) : null
  const pick = (p: string | null | undefined, fallback: string | undefined): string =>
    (p ?? '').trim() || fallback || ''
  return {
    customer_name: pick(profile?.display_name, primary?.customer_name ?? ''),
    customer_first_name_en: pick(profile?.name_first_en, c?.customer_first_name_en),
    customer_last_name_en: pick(profile?.name_last_en, c?.customer_last_name_en),
    phone: (profile?.phone ?? '').replace(/\D/g, '') || (c?.phone ?? ''),
    email: pick(profile?.contact_email, c?.email),
    address_kr: pick(profile?.address_kr, c?.address_kr),
    address_detail_kr: pick(profile?.address_detail_kr, c?.address_detail_kr),
    address_zipcode: pick(profile?.address_zipcode, c?.address_zipcode),
    address_en: pick(profile?.address_en, c?.address_en),
  }
}

export interface UseGuardianEditForm {
  form: GuardianForm
  set: <K extends keyof GuardianForm>(key: K, value: GuardianForm[K]) => void
  dirty: boolean
  status: GuardianFormStatus
  error: string | null
  handleSave: () => void
}

export function useGuardianEditForm(): UseGuardianEditForm {
  const { cases, profile, updateProfile, updateCase } = useCases()
  const primary = cases[0] ?? null
  const [form, setForm] = useState<GuardianForm>(() => readGuardian(profile, primary))
  const [base, setBase] = useState<GuardianForm>(() => readGuardian(profile, primary))
  const [status, setStatus] = useState<GuardianFormStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 외부(Realtime/다른 화면) 변경 동기화 — 사용자 미편집(form==base) 시에만 새 값 채택.
  useEffect(() => {
    const next = readGuardian(profile, primary)
    setForm((prev) => (eq(prev, base) ? next : prev))
    setBase(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, primary])

  const dirty = useMemo(() => !eq(form, base), [form, base])

  function set<K extends keyof GuardianForm>(key: K, value: GuardianForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (status === 'error') setStatus('idle')
  }

  function handleSave() {
    if (!dirty || status === 'saving') return
    if (form.phone && !/^010\d{8}$/.test(form.phone)) {
      setStatus('error')
      setError('전화번호는 010-XXXX-XXXX 형식으로 입력하세요.')
      return
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setStatus('error')
      setError('이메일 형식이 올바르지 않아요.')
      return
    }
    setStatus('saving')
    setError(null)
    const input: GuardianContactInput = {
      display_name: form.customer_name,
      name_first_en: form.customer_first_name_en,
      name_last_en: form.customer_last_name_en,
      phone: form.phone,
      contact_email: form.email,
      address_kr: form.address_kr,
      address_detail_kr: form.address_detail_kr,
      address_zipcode: form.address_zipcode,
      address_en: form.address_en,
    }
    startTransition(async () => {
      const res = await updateGuardianContact(input)
      if (res.ok) {
        updateProfile(res.value.profile)
        for (const c of res.value.cases) updateCase(c)
        const fresh = readGuardian(res.value.profile, res.value.cases[0] ?? primary)
        setForm(fresh)
        setBase(fresh)
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

function eq(a: GuardianForm, b: GuardianForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
