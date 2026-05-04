'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import {
  getCompanyInfo,
  updateCompanyInfo,
  resetCompanyInfo,
  getOrgType,
  updateOrgType,
  hasCompanyInfoDefault,
  type OrgType,
} from '@/lib/actions/company-info'
import {
  getActiveOrgDmVisibility,
  updateActiveOrgDmVisibility,
} from '@/lib/actions/chat'
import type { CustomField, VetInfo, VetInfoKey } from '@/lib/vet-info'
import {
  SettingsShell,
  SettingsSection,
  SettingsFooter,
  SettingsSectionLabel as SectionLabel,
} from './settings-layout'
import { useConfirm } from '@/components/ui/confirm-dialog'
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
  { key: 'postal_code', label: '우편번호', group: 'Clinic' },
  { key: 'phone', label: '전화', group: 'Clinic' },
  { key: 'email', label: '이메일', group: 'Clinic' },

  { key: 'name_ko', label: '수의사', group: 'Veterinarian' },
  { key: 'name_en', label: '영문명', group: 'Veterinarian' },
  { key: 'license_no', label: '면허번호', group: 'Veterinarian' },
  { key: 'mobile_phone', label: '휴대폰', group: 'Veterinarian' },
]

const TRANSPORT_FIELDS: FieldDef[] = [
  { key: 'transport_company_ko', label: '회사명', group: 'Company' },
  { key: 'transport_company_en', label: '영문 회사명', group: 'Company' },
  { key: 'transport_contact_ko', label: '담당자', group: 'Company' },
  { key: 'transport_contact_en', label: '영문명', group: 'Company' },
  { key: 'postal_code', label: '우편번호', group: 'Company' },
  { key: 'mobile_phone', label: '휴대폰', group: 'Company' },
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
  const confirm = useConfirm()
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

  /** custom_fields 통째로 교체 저장. 각 row 의 label/value blur 마다 호출. */
  function saveCustomFields(next: CustomField[]) {
    if (!info) return
    setError(null)
    startTransition(async () => {
      const r = await updateCompanyInfo({ custom_fields: next })
      if (r.ok) {
        setInfo(r.info)
        setLastSaved(new Date())
      } else {
        setError(r.error)
      }
    })
  }

  function addCustomField() {
    if (!info || !isAdmin) return
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const next = [...(info.custom_fields ?? []), { id, label: '', value: '' }]
    setInfo({ ...info, custom_fields: next })
  }

  function updateCustomField(id: string, patch: Partial<CustomField>) {
    if (!info) return
    const next = (info.custom_fields ?? []).map((f) => f.id === id ? { ...f, ...patch } : f)
    setInfo({ ...info, custom_fields: next })
  }

  function removeCustomField(id: string) {
    if (!info) return
    const next = (info.custom_fields ?? []).filter((f) => f.id !== id)
    setInfo({ ...info, custom_fields: next })
    saveCustomFields(next)
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
    if (!await confirm({ message: '회사 정보를 기본값으로 되돌릴까요?', okLabel: '되돌리기' })) return
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
      <SettingsShell>
        <p className="font-serif italic text-sm text-muted-foreground">불러오는 중...</p>
      </SettingsShell>
    )
  }

  const isTransport = orgType === 'transport'
  const groups = isTransport ? TRANSPORT_GROUPS : HOSPITAL_GROUPS
  const fields = isTransport ? TRANSPORT_FIELDS : HOSPITAL_FIELDS

  const title = isTransport ? '운송회사 정보' : '병원 정보'

  return (
    <SettingsShell>
      <SettingsSection title={title}>
        {/* Org type — subtle segmented control (admin only) */}
        {isAdmin && (
          <section className="mb-xl">
            <SectionLabel>Organization</SectionLabel>
            <div className="border-t border-border/80 pt-md flex items-center gap-xs">
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
                      : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
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
            <div className="border-t border-border/80">
              {fields.filter((f) => f.group === group).map((f) => {
                const saving = savingKey === f.key
                return (
                  <div
                    key={f.key}
                    className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80"
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

        {/* 사용자 정의 추가 필드 — 라벨/값 자유 입력 */}
        <section className="mb-xl">
          <SectionLabel>Additional</SectionLabel>
          <div className="border-t border-border/80">
            {(info.custom_fields ?? []).map((f) => (
              <CustomFieldRow
                key={f.id}
                field={f}
                isAdmin={isAdmin}
                onChange={(patch) => updateCustomField(f.id, patch)}
                onCommit={() => saveCustomFields(info.custom_fields ?? [])}
                onRemove={() => removeCustomField(f.id)}
              />
            ))}
            {isAdmin && (
              <div className="py-3 border-b border-dotted border-border/80">
                <button
                  type="button"
                  onClick={addCustomField}
                  className="inline-flex items-center gap-xs font-serif text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={14} />
                  <span>정보 추가</span>
                </button>
              </div>
            )}
            {!isAdmin && (info.custom_fields ?? []).length === 0 && (
              <p className="py-3 font-serif italic text-[12px] text-muted-foreground/60">
                추가 정보가 없습니다.
              </p>
            )}
          </div>
        </section>

        {/* DM 노출 — admin 만 변경 */}
        {isAdmin && (
          <section className="mb-xl">
            <SectionLabel>Messaging</SectionLabel>
            <div className="border-t border-border/80">
              <OrgDmVisibilityRow
                onError={setError}
                onSaved={() => setLastSaved(new Date())}
              />
            </div>
          </section>
        )}

        {error && (
          <p className="font-serif text-[13px] text-destructive mb-md">{error}</p>
        )}
      </SettingsSection>

      <SettingsFooter className="justify-between">
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
      </SettingsFooter>
    </SettingsShell>
  )
}

function CustomFieldRow({
  field,
  isAdmin,
  onChange,
  onCommit,
  onRemove,
}: {
  field: CustomField
  isAdmin: boolean
  onChange: (patch: Partial<CustomField>) => void
  onCommit: () => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-[150px_1fr_auto] items-baseline gap-md py-3 border-b border-dotted border-border/80 group">
      <input
        type="text"
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder={isAdmin ? '항목명' : ''}
        readOnly={!isAdmin}
        className={cn(
          'w-full bg-transparent font-serif text-[13px] leading-none text-muted-foreground pt-0.5 border-0 px-0 py-1 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
          !isAdmin && 'cursor-default',
        )}
      />
      <input
        type="text"
        value={field.value}
        onChange={(e) => onChange({ value: e.target.value })}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder={isAdmin ? '—' : ''}
        readOnly={!isAdmin}
        className={cn(
          'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
          !isAdmin && 'cursor-default',
        )}
      />
      {isAdmin && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="항목 삭제"
          title="삭제"
          className="opacity-0 group-hover:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function OrgDmVisibilityRow({
  onError,
  onSaved,
}: {
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [value, setValue] = useState<boolean | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    getActiveOrgDmVisibility().then((r) => {
      if (!alive) return
      if (r.ok) setValue(r.value)
      else onError(r.error)
    })
    return () => { alive = false }
  }, [])

  function toggle() {
    if (value === null) return
    const next = !value
    setValue(next)
    onError(null)
    startTransition(async () => {
      const r = await updateActiveOrgDmVisibility({ visible: next })
      if (!r.ok) {
        setValue(!next)
        onError(r.error)
      } else {
        onSaved()
      }
    })
  }

  return (
    <div className="grid grid-cols-[150px_1fr] items-baseline gap-md py-3 border-b border-dotted border-border/80">
      <label className="font-serif text-[13px] text-muted-foreground pt-0.5 leading-none">
        검색 노출
      </label>
      <div className="flex items-baseline gap-md">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || value === null}
          className={cn(
            'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
            value
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            (pending || value === null) && 'opacity-60',
          )}
        >
          {value === null ? '불러오는 중…' : value ? '검색 노출' : '검색 숨김'}
        </button>
        <span className="font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
          끄면 외부 조직 사용자가 새 대화 만들기에서 우리 조직을 찾을 수 없습니다. 같은 조직 내부 검색은 영향 없음.
        </span>
      </div>
    </div>
  )
}
