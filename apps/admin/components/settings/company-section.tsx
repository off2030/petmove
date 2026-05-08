'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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
  getUserContactInfo,
  updateUserContactInfo,
} from '@/lib/actions/user-contact-info'
import {
  getActiveOrgDmVisibility,
  updateActiveOrgDmVisibility,
} from '@/lib/actions/chat'
import type { CustomField, VetInfo, VetInfoKey } from '@/lib/vet-info'
import type { UserContactInfo, UserContactKey } from '@/lib/user-contact'
import {
  SettingsShell,
  SettingsSection,
  SettingsFooter,
  SettingsField,
  SettingsSubsectionTitle as SectionLabel,
} from './settings-layout'
import { CompanyAddressSearch, type CompanyAddressResult } from './company-address-search'
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

const GROUP_LABELS: Record<string, string> = {
  Clinic: '병원',
  Veterinarian: '수의사',
  Company: '회사',
}

// org-level (모든 멤버 공유) 필드만 — 개인 담당자 정보(이름·휴대폰·면허) 는 user-level
// 로 분리되어 "내 담당자 정보" 섹션에서 별도 편집.
const HOSPITAL_FIELDS: FieldDef[] = [
  { key: 'clinic_ko', label: '병원명', group: 'Clinic' },
  { key: 'clinic_en', label: '영문 병원명', group: 'Clinic' },
  { key: 'address_ko', label: '주소', group: 'Clinic', type: 'textarea' },
  { key: 'address_en', label: '영문 주소', group: 'Clinic', type: 'textarea' },
  { key: 'postal_code', label: '우편번호', group: 'Clinic' },
  { key: 'phone', label: '전화', group: 'Clinic' },
  { key: 'email', label: '이메일', group: 'Clinic' },
]

const TRANSPORT_FIELDS: FieldDef[] = [
  { key: 'transport_company_ko', label: '회사명', group: 'Company' },
  { key: 'transport_company_en', label: '영문 회사명', group: 'Company' },
  { key: 'transport_address_ko', label: '주소', group: 'Company', type: 'textarea' },
  { key: 'transport_address_en', label: '영문 주소', group: 'Company', type: 'textarea' },
  { key: 'transport_postal_code', label: '우편번호', group: 'Company' },
]

/** First/Last 분리 영문명 키 → 합성된 단일 키 매핑. handleSave 가 같이 갱신. */
const SPLIT_NAME_PARENT: Record<string, { first: VetInfoKey; last: VetInfoKey; combined: VetInfoKey }> = {
  name_first_en:                { first: 'name_first_en',                last: 'name_last_en',                combined: 'name_en' },
  name_last_en:                 { first: 'name_first_en',                last: 'name_last_en',                combined: 'name_en' },
  transport_contact_first_en:   { first: 'transport_contact_first_en',   last: 'transport_contact_last_en',   combined: 'transport_contact_en' },
  transport_contact_last_en:    { first: 'transport_contact_first_en',   last: 'transport_contact_last_en',   combined: 'transport_contact_en' },
}


/**
 * 한국 전화번호 자동 포맷 — phone / mobile_phone / transport_mobile_phone 입력에 적용.
 *  - 11 digits "01012345678" → "010-1234-5678"
 *  - 10 digits "0212345678" (서울) → "02-1234-5678"
 *  - 10 digits "0311234567" (지역) → "031-123-4567"
 *  -  9 digits "028727588" (서울) → "02-872-7588"
 *  - 매칭 실패 시 원본 그대로 (사용자 임의 형식 보존).
 */
function formatPhoneForSave(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('02')) {
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`
  }
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return trimmed
}

/**
 * 한국 전화번호 → 국제표기 자동 변환. 매칭 실패 시 원본 보존.
 *   "02-872-7588"  → "+82-2-872-7588"
 *   "010-1234-5678" → "+82-10-1234-5678"
 *   "031-123-4567" → "+82-31-123-4567"
 * 매칭 키: 첫 area code 가 0 으로 시작 → 0 제거 + "+82-" prefix.
 */
function derivePhoneIntl(raw: string): string {
  const formatted = formatPhoneForSave(raw)
  if (!formatted) return ''
  // 이미 +82 / + 로 시작하면 그대로.
  if (/^\+/.test(formatted)) return formatted
  const m = formatted.match(/^0(\d{1,2})-(.+)$/)
  if (!m) return formatted
  return `+82-${m[1]}-${m[2]}`
}

const PHONE_KEYS: Set<VetInfoKey> = new Set([
  'phone',
  'mobile_phone',
  'transport_mobile_phone',
])

/** 영문만 남기고 한글 자모/완성형 제거. 케이스 상세의 customer-name-row 와 동일. */
function filterKorean(str: string): string {
  return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
}
/** 단어 첫 글자 대문자화. "john doe" → "John Doe". */
function capitalizeWords(str: string): string {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

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
  // user-level (본인 담당자) 정보 — org_type 무관하게 로그인 사용자 자신의 이름·휴대폰·면허.
  const [myInfo, setMyInfo] = useState<UserContactInfo | null>(null)
  const [myDrafts, setMyDrafts] = useState<Partial<Record<UserContactKey, string>>>({})
  const [savingMyKey, setSavingMyKey] = useState<UserContactKey | null>(null)

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

  // user-level 본인 담당자 정보 로드 — admin 여부와 무관하게 항상 본인 row 만 read/write 가능.
  useEffect(() => {
    let alive = true
    getUserContactInfo().then((v) => { if (alive) setMyInfo(v) })
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
    const raw = info?.[key] ?? ''
    // 전화 필드는 표시 시점에도 포맷 — DB 에 저장된 기존 값(예: "02-8727588")도
    // 사용자가 화면에서는 항상 정규 형식("02-872-7588")으로 보이게.
    if (PHONE_KEYS.has(key)) return formatPhoneForSave(raw)
    return raw
  }

  function handleChange(key: VetInfoKey, v: string) {
    setDrafts((d) => ({ ...d, [key]: v }))
  }

  function handleSave(key: VetInfoKey) {
    if (!info) return
    const draftVal = drafts[key]
    if (draftVal === undefined || draftVal === info[key]) {
      setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
      return
    }
    // 전화번호 키는 자동 포맷 ("02-8727588" → "02-872-7588" 등). 매칭 실패 시 원본 보존.
    const next = PHONE_KEYS.has(key) ? formatPhoneForSave(draftVal) : draftVal
    // 영문 First/Last split — 한쪽 변경 시 합성된 base 키도 함께 저장.
    // (PDF 매핑이 합성 결과를 읽으므로 sync 필수.)
    const patch: Partial<VetInfo> = { [key]: next }
    const split = SPLIT_NAME_PARENT[key]
    if (split) {
      const first = (key === split.first ? next : (info[split.first] as string) ?? '').trim()
      const last = (key === split.last ? next : (info[split.last] as string) ?? '').trim()
      patch[split.combined] = [first, last].filter(Boolean).join(' ')
    }
    // phone 저장 시 phone_intl 도 자동 파생 ("02-872-7588" → "+82-2-872-7588").
    // 별지25 hospital_phone, OVD/AnnexIII clinic phone 등 PDF 매핑이 vet:phone_intl 를
    // 직접 read 하므로 sync 필수.
    if (key === 'phone') {
      patch.phone_intl = derivePhoneIntl(next)
    }
    setSavingKey(key)
    setError(null)
    startTransition(async () => {
      const r = await updateCompanyInfo(patch)
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

  // ────────────────────────────────────────────────────────────────────
  // user-level 핸들러 — 본인 담당자 정보 (이름·휴대폰·면허)
  // ────────────────────────────────────────────────────────────────────

  function myValueOf(key: UserContactKey): string {
    if (myDrafts[key] !== undefined) return myDrafts[key] ?? ''
    const raw = myInfo?.[key] ?? ''
    if (key === 'mobile_phone') return formatPhoneForSave(raw)
    return raw
  }

  function handleMyChange(key: UserContactKey, v: string) {
    setMyDrafts((d) => ({ ...d, [key]: v }))
  }

  function handleMySave(key: UserContactKey) {
    if (!myInfo) return
    const draftVal = myDrafts[key]
    if (draftVal === undefined || draftVal === myInfo[key]) {
      setMyDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
      return
    }
    const next = key === 'mobile_phone' ? formatPhoneForSave(draftVal) : draftVal
    // 영문 First/Last split — 한쪽 변경 시 합성된 name_en 도 함께 저장.
    const patch: Partial<UserContactInfo> = { [key]: next }
    if (key === 'name_first_en' || key === 'name_last_en') {
      const first = (key === 'name_first_en' ? next : myInfo.name_first_en ?? '').trim()
      const last = (key === 'name_last_en' ? next : myInfo.name_last_en ?? '').trim()
      patch.name_en = [first, last].filter(Boolean).join(' ')
    }
    setSavingMyKey(key)
    setError(null)
    startTransition(async () => {
      const r = await updateUserContactInfo(patch)
      setSavingMyKey(null)
      if (r.ok) {
        setMyInfo(r.info)
        setMyDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
        setLastSaved(new Date())
      } else {
        setError(r.error)
      }
    })
  }

  function cancelMyDraft(key: UserContactKey) {
    setMyDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
  }

  /**
   * Daum Postcode 검색 결과를 한국주소/영문주소/우편번호 한 번에 저장.
   * org_type 별로 저장 키 다름:
   *   hospital  → address_ko / address_en / postal_code
   *   transport → transport_address_ko / transport_address_en / transport_postal_code
   */
  function handleAddressSelected(result: CompanyAddressResult) {
    if (!info) return
    setError(null)
    const isTransport = orgType === 'transport'
    const krKey: VetInfoKey = isTransport ? 'transport_address_ko' : 'address_ko'
    const enKey: VetInfoKey = isTransport ? 'transport_address_en' : 'address_en'
    const zipKey: VetInfoKey = isTransport ? 'transport_postal_code' : 'postal_code'
    // draft 비우기 — 검색 결과로 즉시 덮어쓸 거라 사용자 편집 중인 draft 와 충돌 방지.
    setDrafts((d) => {
      const next = { ...d }
      delete next[krKey]
      delete next[enKey]
      delete next[zipKey]
      return next
    })
    const patch: Partial<VetInfo> = {
      [krKey]: result.address_ko,
      [enKey]: result.address_en,
      [zipKey]: result.postal_code,
    }
    startTransition(async () => {
      const r = await updateCompanyInfo(patch)
      if (r.ok) {
        setInfo(r.info)
        setLastSaved(new Date())
      } else {
        setError(r.error)
      }
    })
  }

  /**
   * 추가 정보 키 — active org_type 별로 독립 저장.
   * hospital → custom_fields (legacy 호환)
   * transport → transport_custom_fields
   */
  const customFieldsKey: 'custom_fields' | 'transport_custom_fields' =
    orgType === 'transport' ? 'transport_custom_fields' : 'custom_fields'

  function getCustomFields(source: VetInfo | null): CustomField[] {
    if (!source) return []
    return source[customFieldsKey] ?? []
  }

  /** custom_fields 통째로 교체 저장. 각 row 의 label/value blur 마다 호출. */
  function saveCustomFields(next: CustomField[]) {
    if (!info) return
    setError(null)
    startTransition(async () => {
      const r = await updateCompanyInfo({ [customFieldsKey]: next } as Partial<VetInfo>)
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
    const next = [...getCustomFields(info), { id, label: '', value: '' }]
    setInfo({ ...info, [customFieldsKey]: next })
  }

  function updateCustomField(id: string, patch: Partial<CustomField>) {
    if (!info) return
    const next = getCustomFields(info).map((f) => f.id === id ? { ...f, ...patch } : f)
    setInfo({ ...info, [customFieldsKey]: next })
  }

  function removeCustomField(id: string) {
    if (!info) return
    const next = getCustomFields(info).filter((f) => f.id !== id)
    setInfo({ ...info, [customFieldsKey]: next })
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
            <SectionLabel className="mb-2">조직</SectionLabel>
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
            <SectionLabel className="mb-2">{GROUP_LABELS[group] ?? group}</SectionLabel>
            <div className="border-t border-border/80">
              {fields.filter((f) => f.group === group).map((f) => {
                const saving = savingKey === f.key
                // 한국주소 행에 한정해 우측에 "주소검색" 버튼 노출 — 검색 결과로
                // 한국/영문/우편번호 세 필드를 한 번에 저장 (handleAddressSelected).
                // hospital → address_ko, transport → transport_address_ko.
                const showAddressSearch = isAdmin && (f.key === 'address_ko' || f.key === 'transport_address_ko')

                // 영문 First/Last 한 줄 합성 행 — name_first_en / transport_contact_first_en
                // 만났을 때 두 input 을 한 행에 같이 그리고, 짝(name_last_en/...) 은 skip.
                const split = SPLIT_NAME_PARENT[f.key]
                if (split && f.key === split.first) {
                  return (
                    <EnglishNameSplitRow
                      key={f.key}
                      firstKey={split.first}
                      lastKey={split.last}
                      firstValue={valueOf(split.first)}
                      lastValue={valueOf(split.last)}
                      isAdmin={isAdmin}
                      saving={savingKey === split.first || savingKey === split.last}
                      onChange={handleChange}
                      onCommit={handleSave}
                      onCancel={(k) => setDrafts((d) => { const { [k]: _, ...rest } = d; return rest })}
                    />
                  )
                }
                if (split && f.key === split.last) return null  // 짝꿍이 already rendered

                return (
                  <SettingsField key={f.key} label={f.label}>
                    <div className="flex items-start gap-sm">
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
                            'flex-1 min-w-0 bg-transparent font-serif text-[15px] leading-snug text-foreground resize-y border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
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
                            'flex-1 min-w-0 bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 transition-colors placeholder:text-muted-foreground/30',
                            saving && 'opacity-60',
                            !isAdmin && 'cursor-default',
                          )}
                        />
                      )}
                      {showAddressSearch && (
                        <CompanyAddressSearch
                          onSelected={handleAddressSelected}
                          className="shrink-0 mt-0.5 inline-flex h-7 items-center rounded border px-2 font-serif text-[12px] border-border/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors disabled:opacity-50"
                        />
                      )}
                    </div>
                  </SettingsField>
                )
              })}
            </div>
          </section>
        ))}

        {/* 발급자 본인 정보 — 동물병원이면 "수의사", 운송회사면 "담당자" 그룹으로 노출.
            로그인 사용자 본인 (profiles.contact_info) 만 보이고 편집됨. 한 조직에 멤버
            여럿일 때 각자 본인 명의로 cert 발급되도록 — PDF 매핑(vet:name_en 등) 은
            org_type 에 따라 hospital 측 vet 키 / transport 측 transport_contact 키로
            overlay. 다른 멤버에게는 영향 없음. */}
        <section className="mb-xl">
          <SectionLabel className="mb-2">{isTransport ? '담당자' : '수의사'}</SectionLabel>
          <p className="mb-2 font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed max-w-md">
            로그인 본인 정보만 표시·편집. cert 발급 시 본인 이름/휴대폰{isTransport ? '' : '/면허번호'}이 채워집니다.
          </p>
          <div className="border-t border-border/80">
            {!myInfo ? (
              <p className="py-3 font-serif italic text-[12px] text-muted-foreground/60">
                불러오는 중...
              </p>
            ) : (
              <>
                <SettingsField label="한글 이름">
                  <input
                    type="text"
                    value={myValueOf('name_ko')}
                    onChange={(e) => handleMyChange('name_ko', e.target.value)}
                    onBlur={() => handleMySave('name_ko')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') cancelMyDraft('name_ko')
                    }}
                    placeholder="—"
                    className={cn(
                      'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
                      savingMyKey === 'name_ko' && 'opacity-60',
                    )}
                  />
                </SettingsField>
                <EnglishNameSplitRow<UserContactKey>
                  firstKey="name_first_en"
                  lastKey="name_last_en"
                  firstValue={myValueOf('name_first_en')}
                  lastValue={myValueOf('name_last_en')}
                  isAdmin={true}
                  saving={savingMyKey === 'name_first_en' || savingMyKey === 'name_last_en'}
                  onChange={handleMyChange}
                  onCommit={handleMySave}
                  onCancel={cancelMyDraft}
                />
                <SettingsField label="휴대폰">
                  <input
                    type="text"
                    value={myValueOf('mobile_phone')}
                    onChange={(e) => handleMyChange('mobile_phone', e.target.value)}
                    onBlur={() => handleMySave('mobile_phone')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') cancelMyDraft('mobile_phone')
                    }}
                    placeholder="—"
                    className={cn(
                      'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
                      savingMyKey === 'mobile_phone' && 'opacity-60',
                    )}
                  />
                </SettingsField>
                {!isTransport && (
                  <SettingsField label="면허번호">
                    <input
                      type="text"
                      value={myValueOf('license_no')}
                      onChange={(e) => handleMyChange('license_no', e.target.value)}
                      onBlur={() => handleMySave('license_no')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') cancelMyDraft('license_no')
                      }}
                      placeholder="—"
                      className={cn(
                        'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
                        savingMyKey === 'license_no' && 'opacity-60',
                      )}
                    />
                  </SettingsField>
                )}
              </>
            )}
          </div>
        </section>


        {/* 사용자 정의 추가 필드 — 라벨/값 자유 입력 */}
        <section className="mb-xl">
          <SectionLabel className="mb-2">추가 정보</SectionLabel>
          <div className="border-t border-border/80">
            {getCustomFields(info).map((f) => (
              <CustomFieldRow
                key={f.id}
                field={f}
                isAdmin={isAdmin}
                onChange={(patch) => updateCustomField(f.id, patch)}
                onCommit={() => saveCustomFields(getCustomFields(info))}
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
            {!isAdmin && getCustomFields(info).length === 0 && (
              <p className="py-3 font-serif italic text-[12px] text-muted-foreground/60">
                추가 정보가 없습니다.
              </p>
            )}
          </div>
        </section>

        {/* DM 노출 — admin 만 변경 */}
        {isAdmin && (
          <section className="mb-xl">
            <SectionLabel className="mb-2">메시지</SectionLabel>
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

/**
 * 영문명 First/Last 합성 행 — 케이스 상세의 customer-name-row 와 동일 패턴 (이름은 단일 행).
 * IME 입력 중에는 한글 자모 통과시키고 composition end 시점에 필터·대문자화 후 commit.
 */
function EnglishNameSplitRow<K extends string>({
  label = '영문명',
  firstKey,
  lastKey,
  firstValue,
  lastValue,
  isAdmin,
  saving,
  onChange,
  onCommit,
  onCancel,
}: {
  label?: string
  firstKey: K
  lastKey: K
  firstValue: string
  lastValue: string
  isAdmin: boolean
  saving: boolean
  onChange: (key: K, v: string) => void
  onCommit: (key: K) => void
  onCancel: (key: K) => void
}) {
  const firstComposing = useRef(false)
  const lastComposing = useRef(false)

  function handleFirstChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (firstComposing.current) {
      onChange(firstKey, e.target.value)
      return
    }
    onChange(firstKey, capitalizeWords(filterKorean(e.target.value)))
  }
  function handleLastChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (lastComposing.current) {
      onChange(lastKey, e.target.value)
      return
    }
    onChange(lastKey, capitalizeWords(filterKorean(e.target.value)))
  }
  function handleFirstCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    firstComposing.current = false
    const raw = (e.target as HTMLInputElement).value
    onChange(firstKey, capitalizeWords(filterKorean(raw)))
  }
  function handleLastCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    lastComposing.current = false
    const raw = (e.target as HTMLInputElement).value
    onChange(lastKey, capitalizeWords(filterKorean(raw)))
  }
  function makeKeyDown(key: K) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      if (e.key === 'Escape') onCancel(key)
    }
  }

  const inputCls = cn(
    'flex-1 min-w-0 bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
    saving && 'opacity-60',
    !isAdmin && 'cursor-default',
  )

  return (
    <SettingsField label={label}>
      <div className="flex items-baseline gap-md">
        <input
          type="text"
          value={firstValue}
          onChange={handleFirstChange}
          onCompositionStart={() => { firstComposing.current = true }}
          onCompositionEnd={handleFirstCompositionEnd}
          onBlur={() => onCommit(firstKey)}
          onKeyDown={makeKeyDown(firstKey)}
          placeholder={isAdmin ? 'First (이름)' : ''}
          readOnly={!isAdmin}
          className={inputCls}
        />
        <span className="text-muted-foreground/30 select-none shrink-0">·</span>
        <input
          type="text"
          value={lastValue}
          onChange={handleLastChange}
          onCompositionStart={() => { lastComposing.current = true }}
          onCompositionEnd={handleLastCompositionEnd}
          onBlur={() => onCommit(lastKey)}
          onKeyDown={makeKeyDown(lastKey)}
          placeholder={isAdmin ? 'Last (성)' : ''}
          readOnly={!isAdmin}
          className={inputCls}
        />
      </div>
    </SettingsField>
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
    <SettingsField label="검색 노출">
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
    </SettingsField>
  )
}
