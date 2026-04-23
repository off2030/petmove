'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  getCompanyInfo,
  updateCompanyInfo,
  resetCompanyInfo,
  getOrgType,
  updateOrgType,
  hasCompanyInfoDefault,
  type OrgType,
} from '@/lib/actions/company-info'
import type { VetInfo, VetInfoKey } from '@/lib/vet-info'
import { cn } from '@/lib/utils'

interface FieldDef {
  key: VetInfoKey
  label: string
  group: string
  type?: 'text' | 'textarea'
}

/**
 * org_type 별 필드 그룹 구성.
 * hospital: 병원 + 수의사. transport: 회사 정보만.
 */
const HOSPITAL_GROUPS = ['Clinic', 'Veterinarian'] as const
const TRANSPORT_GROUPS = ['Company'] as const

const HOSPITAL_FIELDS: FieldDef[] = [
  { key: 'clinic_ko', label: '병원명', group: 'Clinic' },
  { key: 'clinic_en', label: '영문 병원명', group: 'Clinic' },
  { key: 'address_ko', label: '주소', group: 'Clinic', type: 'textarea' },
  { key: 'address_en', label: '영문 주소', group: 'Clinic', type: 'textarea' },
  { key: 'phone', label: '전화', group: 'Clinic' },
  { key: 'email', label: '이메일', group: 'Clinic' },

  { key: 'name_ko', label: '수의사', group: 'Veterinarian' },
  { key: 'name_en', label: '영문명', group: 'Veterinarian' },
  { key: 'license_no', label: '면허번호', group: 'Veterinarian' },
]

const TRANSPORT_FIELDS: FieldDef[] = [
  { key: 'transport_company_ko', label: '회사명', group: 'Company' },
  { key: 'transport_company_en', label: '영문 회사명', group: 'Company' },
  { key: 'transport_contact_ko', label: '담당자', group: 'Company' },
  { key: 'transport_contact_en', label: '영문명', group: 'Company' },
]

function formatSavedAgo(date: Date | null): string {
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return '자동 저장됨 · 방금 전'
  if (sec < 60) return `자동 저장됨 · ${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `자동 저장됨 · ${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `자동 저장됨 · ${hour}시간 전`
  return `자동 저장됨 · ${date.toLocaleDateString()}`
}

export function CompanySection({
  initialInfo = null,
  initialOrgType = null,
  isAdmin = false,
}: {
  initialInfo?: VetInfo | null
  initialOrgType?: OrgType | null
  isAdmin?: boolean
} = {}) {
  const [info, setInfo] = useState<VetInfo | null>(initialInfo)
  const [orgType, setOrgType] = useState<OrgType | null>(initialOrgType)
  const [drafts, setDrafts] = useState<Partial<Record<VetInfoKey, string>>>({})
  const [savingKey, setSavingKey] = useState<VetInfoKey | null>(null)
  const [savingOrgType, setSavingOrgType] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasDefault, setHasDefault] = useState(false)
  const [, setTick] = useState(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (initialInfo && !info) setInfo(initialInfo)
    if (initialOrgType && !orgType) setOrgType(initialOrgType)
  }, [initialInfo, initialOrgType])

  useEffect(() => {
    if (info && orgType) return
    if (initialInfo || initialOrgType) return
    let alive = true
    Promise.all([getCompanyInfo(), getOrgType()]).then(([v, t]) => {
      if (alive) {
        setInfo(v)
        setOrgType(t)
      }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    hasCompanyInfoDefault().then((v) => { if (alive) setHasDefault(v) })
    return () => { alive = false }
  }, [])

  // "방금 전 / N분 전" 표시를 10 초마다 다시 렌더.
  useEffect(() => {
    if (!lastSaved) return
    const id = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [lastSaved])

  function valueOf(key: VetInfoKey): string {
    if (drafts[key] !== undefined) return drafts[key] ?? ''
    return info?.[key] ?? ''
  }

  function handleChange(key: VetInfoKey, v: string) {
    setDrafts((d) => ({ ...d, [key]: v }))
  }

  function handleSave(key: VetInfoKey) {
    if (!info) return
    const next = drafts[key]
    if (next === undefined || next === info[key]) {
      setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
      return
    }
    setSavingKey(key)
    setError(null)
    startTransition(async () => {
      const r = await updateCompanyInfo({ [key]: next } as Partial<VetInfo>)
      setSavingKey(null)
      if (r.ok) {
        setInfo(r.info)
        setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
        setLastSaved(new Date())
      } else {
        setError(r.error)
      }
    })
  }

  async function handleOrgTypeChange(next: OrgType) {
    if (next === orgType) return
    setSavingOrgType(true)
    setError(null)
    const r = await updateOrgType(next)
    setSavingOrgType(false)
    if (r.ok) {
      setOrgType(r.org_type)
      setLastSaved(new Date())
    } else {
      setError(r.error)
    }
  }

  async function handleReset() {
    if (!confirm('회사 정보를 기본값으로 되돌릴까요?')) return
    setError(null)
    const r = await resetCompanyInfo()
    if (r.ok) {
      setInfo(r.info)
      setDrafts({})
      setLastSaved(new Date())
    } else {
      setError(r.error)
    }
  }

  if (!info || !orgType) {
    return (
      <div className="max-w-3xl">
        <p className="font-serif italic text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    )
  }

  const isTransport = orgType === 'transport'
  const groups = isTransport ? TRANSPORT_GROUPS : HOSPITAL_GROUPS
  const fields = isTransport ? TRANSPORT_FIELDS : HOSPITAL_FIELDS

  const title = isTransport ? '운송회사 정보' : '병원 정보'

  return (
    <div className="max-w-3xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <h2 className="font-serif text-[28px] leading-tight text-foreground">
          {title}
        </h2>
      </header>

      {/* Org type — subtle segmented control (admin only) */}
      {isAdmin && (
        <section className="mb-xl">
          <SectionLabel>Organization</SectionLabel>
          <div className="border-t border-border/70 pt-md flex items-center gap-xs">
            {(['hospital', 'transport'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleOrgTypeChange(t)}
                disabled={savingOrgType}
                className={cn(
                  'h-8 px-md font-serif text-[14px] rounded-full border transition-colors',
                  orgType === t
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  savingOrgType && 'opacity-60',
                )}
              >
                {t === 'hospital' ? '동물병원' : '운송회사'}
              </button>
            ))}
          </div>
        </section>
      )}

      {!isAdmin && (
        <p className="mb-xl font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
          조직 정보는 관리자만 수정할 수 있습니다. 변경이 필요하면 조직 관리자에게 요청해 주세요.
        </p>
      )}

      {/* Field groups */}
      {groups.map((group) => (
        <section key={group} className="mb-xl">
          <SectionLabel>{group}</SectionLabel>
          <div className="border-t border-border/70">
            {fields.filter((f) => f.group === group).map((f) => {
              const saving = savingKey === f.key
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/60"
                >
                  <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
                    {f.label}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={valueOf(f.key)}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      onBlur={() => handleSave(f.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setDrafts((d) => { const { [f.key]: _, ...rest } = d; return rest })
                        }
                      }}
                      rows={1}
                      placeholder={isAdmin ? '—' : ''}
                      readOnly={!isAdmin}
                      className={cn(
                        'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground resize-y border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
                        saving && 'opacity-60',
                        !isAdmin && 'cursor-default',
                      )}
                    />
                  ) : (
                    <input
                      type="text"
                      value={valueOf(f.key)}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      onBlur={() => handleSave(f.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') {
                          setDrafts((d) => { const { [f.key]: _, ...rest } = d; return rest })
                        }
                      }}
                      placeholder={isAdmin ? '—' : ''}
                      readOnly={!isAdmin}
                      className={cn(
                        'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
                        saving && 'opacity-60',
                        !isAdmin && 'cursor-default',
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {isTransport && (
        <p className="font-serif italic text-[12px] text-muted-foreground/70 -mt-md mb-xl leading-relaxed max-w-md">
          운송회사는 회사 정보만 입력합니다. 병원 정보가 비어 있으면 PDF 의 병원·수의사 필드는 빈 값으로 출력됩니다.
        </p>
      )}

      {error && (
        <p className="font-serif text-[13px] text-destructive mb-md">{error}</p>
      )}

      {/* Footer — reset + save status */}
      <div className="flex items-center justify-between pt-md border-t border-border/60">
        {isAdmin && hasDefault ? (
          <button
            type="button"
            onClick={handleReset}
            className="font-serif text-[12px] text-muted-foreground/60 hover:text-destructive transition-colors"
          >
            기본값으로 되돌리기
          </button>
        ) : (
          <span />
        )}
        <span className="font-serif italic text-[12px] text-muted-foreground/60">
          {formatSavedAgo(lastSaved)}
        </span>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <span className="font-mono text-[11px] tracking-[1.8px] uppercase text-muted-foreground/70">
        {children}
      </span>
    </div>
  )
}
