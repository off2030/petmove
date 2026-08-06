'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import type { OrgType } from '@/lib/actions/company-info'
import type { CustomField, VetInfo, VetInfoKey } from '@/lib/vet-info'
import {
  SettingsActionButton,
  SettingsField,
  SettingsFooter,
  SettingsSubsectionTitle as SectionLabel,
  formatSavedAgo,
} from './settings-layout'
import { EnglishNameSplitRow } from './english-name-split-row'
import { CompanyAddressSearch, type CompanyAddressResult } from './company-address-search'
import { Avatar, avatarInitial } from '@/components/ui/avatar'
import { resizeSquareJpeg } from '@/lib/image/resize-avatar'
import { useConfirm } from '@petmove/ui'
import { cn } from '@/lib/utils'

const AVATAR_MAX_BYTES = 20 * 1024 * 1024
const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

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
  { key: 'address_detail_ko', label: '상세주소', group: 'Clinic' },
  { key: 'address_en', label: '영문 주소', group: 'Clinic', type: 'textarea' },
  { key: 'address_detail_en', label: '영문 상세주소', group: 'Clinic' },
  { key: 'postal_code', label: '우편번호', group: 'Clinic' },
  { key: 'phone', label: '전화', group: 'Clinic' },
  { key: 'email', label: '이메일', group: 'Clinic' },
  { key: 'naver_booking_url', label: '네이버예약 링크', group: 'Clinic' },
  { key: 'kakao_chat_url', label: '카카오톡 채널 링크', group: 'Clinic' },
]

const TRANSPORT_FIELDS: FieldDef[] = [
  { key: 'transport_company_ko', label: '회사명', group: 'Company' },
  { key: 'transport_company_en', label: '영문 회사명', group: 'Company' },
  { key: 'transport_address_ko', label: '주소', group: 'Company', type: 'textarea' },
  { key: 'transport_address_detail_ko', label: '상세주소', group: 'Company' },
  { key: 'transport_address_en', label: '영문 주소', group: 'Company', type: 'textarea' },
  { key: 'transport_address_detail_en', label: '영문 상세주소', group: 'Company' },
  { key: 'transport_postal_code', label: '우편번호', group: 'Company' },
]

/**
 * 상세주소(층·호·건물명) 키 → 합쳐 보관할 전체주소 키.
 * 입력은 별도 칸이지만 저장은 전체주소에 "도로명, 상세"로 합쳐 넣는다
 * (PDF·펫무브 표시가 전체주소 한 필드를 읽으므로). 상세만 따로도 저장돼 재검색에 보존됨.
 */
const ADDRESS_DETAIL_PARENT: Partial<Record<VetInfoKey, VetInfoKey>> = {
  address_detail_ko: 'address_ko',
  address_detail_en: 'address_en',
  transport_address_detail_ko: 'transport_address_ko',
  transport_address_detail_en: 'transport_address_en',
}

/** 도로명(base) + 상세(detail) 를 "base, detail" 한 줄로. 한쪽이 비면 다른 쪽만. */
function combineAddress(base: string, detail: string): string {
  const b = base.trim()
  const d = detail.trim()
  if (!b) return d
  if (!d) return b
  return `${b}, ${d}`
}

/** 전체주소에서 알고 있는 상세 접미사를 떼어 도로명만 복원. 못 찾으면 원본 유지. */
function stripAddressDetail(full: string, detail: string): string {
  const f = full.trim()
  const d = detail.trim()
  if (!d) return f
  if (f.endsWith(`, ${d}`)) return f.slice(0, f.length - d.length - 2).trim()
  if (f.endsWith(d)) return f.slice(0, f.length - d.length).replace(/[,\s]+$/, '').trim()
  return f
}

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

const ORG_TYPE_TABS: { value: OrgType; label: string }[] = [
  { value: 'hospital', label: '동물병원' },
  { value: 'transport', label: '운송회사' },
  { value: 'both', label: '둘 다' },
]

/**
 * 조직정보 폼 — 아바타 + 동물병원/운송 필드그룹 + 추가정보 + 기본값 복원.
 *
 * 멤버용 설정화면(company-section)과 슈퍼어드민 조직 상세(super-admin-app)가 공유한다.
 * 실제 저장은 props 콜백(onSaveFields / onSetOrgType / onAvatar* / onReset)으로 위임하고,
 * 내부에서는 drafts·phone-format·split-name·custom_fields·아바타 상태만 처리한다.
 *
 * - canEditOrgType=true: 유형 선택(병원/운송/둘다) UI 노출 — 슈퍼어드민 전용.
 *   canEditOrgType=false: 기존 보기 전환 탭(viewTab)만 — 멤버는 유형 변경 불가.
 * - isAdmin=false: 읽기 전용.
 */
export function OrgInfoForm({
  info: initialInfo,
  orgType: initialOrgType,
  isAdmin,
  canEditOrgType,
  onSaveFields,
  onSetOrgType,
  avatarUrl: initialAvatarUrl,
  onAvatarUpload,
  onAvatarRemove,
  onReset,
  hasDefault = false,
}: {
  info: VetInfo
  orgType: OrgType
  isAdmin: boolean
  canEditOrgType: boolean
  onSaveFields: (patch: Partial<VetInfo>) => Promise<{ ok: boolean; error?: string; info?: VetInfo }>
  onSetOrgType: (t: OrgType) => Promise<{ ok: boolean; error?: string }>
  avatarUrl: string | null
  onAvatarUpload: (fd: FormData) => Promise<{ ok: boolean; error?: string; avatar_url?: string }>
  onAvatarRemove: () => Promise<{ ok: boolean; error?: string }>
  onReset?: () => Promise<{ ok: boolean; error?: string; info?: VetInfo }>
  hasDefault?: boolean
}) {
  const confirm = useConfirm()
  const [info, setInfo] = useState<VetInfo>(initialInfo)
  const [orgType, setOrgType] = useState<OrgType>(initialOrgType)
  // 동물병원/운송회사 탭 — 유형 '선택'이 아니라 보기·입력 전환(둘 다 입력 가능).
  // canEditOrgType=false 일 때만 사용. 어느 쪽 필드를 보여줄지만 결정.
  const [viewTab, setViewTab] = useState<'hospital' | 'transport'>(
    initialOrgType === 'transport' ? 'transport' : 'hospital',
  )
  const [drafts, setDrafts] = useState<Partial<Record<VetInfoKey, string>>>({})
  const [savingKey, setSavingKey] = useState<VetInfoKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [orgAvatarUrl, setOrgAvatarUrl] = useState<string | null>(initialAvatarUrl)
  const [settingType, setSettingType] = useState(false)
  const [, setTick] = useState(0)
  const [, startTransition] = useTransition()

  // props 가 바뀌면 내부 상태 동기화 — 슈퍼어드민이 다른 조직(selected)으로 전환할 때
  // info/orgType/avatarUrl 이 새 값으로 들어온다. drafts 는 비워 이전 조직 편집분 누수 방지.
  useEffect(() => {
    setInfo(initialInfo)
    setDrafts({})
  }, [initialInfo])
  useEffect(() => {
    setOrgType(initialOrgType)
    setViewTab(initialOrgType === 'transport' ? 'transport' : 'hospital')
  }, [initialOrgType])
  useEffect(() => {
    setOrgAvatarUrl(initialAvatarUrl)
  }, [initialAvatarUrl])

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
    if (PHONE_KEYS.has(key)) return formatPhoneForSave(raw as string)
    return raw as string
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
    // 상세주소 키 저장 시 — 전체주소(address_ko 등)도 "도로명, 상세"로 합쳐 함께 저장.
    // 기존 전체주소에서 이전 상세(info[key])를 떼어낸 도로명에 새 상세를 붙인다.
    const addrParent = ADDRESS_DETAIL_PARENT[key]
    if (addrParent) {
      const base = stripAddressDetail((info[addrParent] as string) ?? '', (info[key] as string) ?? '')
      patch[addrParent] = combineAddress(base, next)
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
      const r = await onSaveFields(patch)
      setSavingKey(null)
      if (r.ok) {
        if (r.info) setInfo(r.info)
        setDrafts((d) => { const { [key]: _, ...rest } = d; return rest })
        setLastSaved(new Date())
      } else {
        setError(r.error ?? '저장에 실패했습니다.')
      }
    })
  }

  /**
   * Daum Postcode 검색 결과를 한국주소/영문주소/우편번호 한 번에 저장.
   * org_type 별로 저장 키 다름:
   *   hospital  → address_ko / address_en / postal_code
   *   transport → transport_address_ko / transport_address_en / transport_postal_code
   */
  function handleAddressSelected(
    result: CompanyAddressResult,
    addressKey: 'address_ko' | 'transport_address_ko' = 'address_ko',
  ) {
    if (!info) return
    setError(null)
    // 'both' 는 병원·운송 주소가 둘 다 있으므로, 전역 org_type 이 아니라 검색을 띄운
    // 주소 필드(addressKey)로 어느 쪽 키에 저장할지 결정.
    const isTransport = addressKey === 'transport_address_ko'
    const krKey: VetInfoKey = isTransport ? 'transport_address_ko' : 'address_ko'
    const enKey: VetInfoKey = isTransport ? 'transport_address_en' : 'address_en'
    const zipKey: VetInfoKey = isTransport ? 'transport_postal_code' : 'postal_code'
    const detailKrKey: VetInfoKey = isTransport ? 'transport_address_detail_ko' : 'address_detail_ko'
    const detailEnKey: VetInfoKey = isTransport ? 'transport_address_detail_en' : 'address_detail_en'
    // draft 비우기 — 검색 결과로 즉시 덮어쓸 거라 사용자 편집 중인 draft 와 충돌 방지.
    setDrafts((d) => {
      const next = { ...d }
      delete next[krKey]
      delete next[enKey]
      delete next[zipKey]
      return next
    })
    // 이미 입력된 상세주소는 새 도로명 뒤에 다시 붙여 보존 — 검색을 다시 눌러도 안 지워짐.
    const detailKo = (info[detailKrKey] as string) ?? ''
    const detailEn = (info[detailEnKey] as string) ?? ''
    const patch: Partial<VetInfo> = {
      [krKey]: combineAddress(result.address_ko, detailKo),
      [enKey]: combineAddress(result.address_en, detailEn),
      [zipKey]: result.postal_code,
    }
    startTransition(async () => {
      const r = await onSaveFields(patch)
      if (r.ok) {
        if (r.info) setInfo(r.info)
        setLastSaved(new Date())
      } else {
        setError(r.error ?? '저장에 실패했습니다.')
      }
    })
  }

  /**
   * 추가 정보 키 — active 보기(viewTab) 별로 독립 저장.
   * hospital → custom_fields (legacy 호환)
   * transport → transport_custom_fields
   */
  const customFieldsKey: 'custom_fields' | 'transport_custom_fields' =
    viewTab === 'transport' ? 'transport_custom_fields' : 'custom_fields'

  function getCustomFields(source: VetInfo | null): CustomField[] {
    if (!source) return []
    return source[customFieldsKey] ?? []
  }

  /** custom_fields 통째로 교체 저장. 각 row 의 label/value blur 마다 호출. */
  function saveCustomFields(next: CustomField[]) {
    if (!info) return
    setError(null)
    startTransition(async () => {
      const r = await onSaveFields({ [customFieldsKey]: next } as Partial<VetInfo>)
      if (r.ok) {
        if (r.info) setInfo(r.info)
        setLastSaved(new Date())
      } else {
        setError(r.error ?? '저장에 실패했습니다.')
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

  async function handleReset() {
    if (!onReset) return
    if (!await confirm({ message: '회사 정보를 기본값으로 되돌릴까요?', okLabel: '되돌리기' })) return
    setError(null)
    const r = await onReset()
    if (r.ok) {
      if (r.info) setInfo(r.info)
      setDrafts({})
      setLastSaved(new Date())
    } else {
      setError(r.error ?? '되돌리기에 실패했습니다.')
    }
  }

  async function handleSetOrgType(next: OrgType) {
    if (next === orgType) return
    setSettingType(true)
    setError(null)
    const r = await onSetOrgType(next)
    setSettingType(false)
    if (r.ok) {
      setOrgType(next)
      // 보기 탭도 새 유형에 맞춰 정렬(운송 전용이면 운송 탭으로).
      setViewTab(next === 'transport' ? 'transport' : 'hospital')
      setLastSaved(new Date())
    } else {
      setError(r.error ?? '유형 변경에 실패했습니다.')
    }
  }

  const isTransport = viewTab === 'transport'
  const groups: readonly string[] = isTransport ? TRANSPORT_GROUPS : HOSPITAL_GROUPS
  const fields: FieldDef[] = isTransport ? TRANSPORT_FIELDS : HOSPITAL_FIELDS

  return (
    <div>
      {/* 조직 아바타 — org-level(병원·운송 공용). 펫무브 보호자 [내 정보] 의
          담당 동물병원·운송업체 카드에 이 이미지가 표시됨. */}
      <section className="mb-lg">
        <SectionLabel className="mb-2">아바타</SectionLabel>
        <div className="border-t border-border/80">
          <OrgAvatarRow
            url={orgAvatarUrl}
            isAdmin={isAdmin}
            fallbackLabel={info.clinic_ko || info.transport_company_ko || ''}
            onUpload={onAvatarUpload}
            onRemove={onAvatarRemove}
            onChange={setOrgAvatarUrl}
            onSaved={() => setLastSaved(new Date())}
            onError={setError}
          />
        </div>
      </section>

      {canEditOrgType ? (
        /* 유형 선택 — 슈퍼어드민 전용. organizations.org_type 직접 변경(병원/운송/둘다). */
        <section className="mb-lg">
          <SectionLabel className="mb-2">유형</SectionLabel>
          <div className="flex items-center gap-xs">
            {ORG_TYPE_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleSetOrgType(t.value)}
                disabled={!isAdmin || settingType}
                className={cn(
                  'h-8 px-lg font-serif text-[14px] rounded-full border transition-colors',
                  orgType === t.value
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  (!isAdmin || settingType) && 'opacity-60',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {orgType === 'both' && (
            <p className="mt-2 font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
              아래 동물병원·운송회사 탭에서 양쪽 정보를 각각 입력할 수 있습니다.
            </p>
          )}
        </section>
      ) : null}

      {/* 동물병원/운송회사 — 보기·입력 전환 탭.
          canEditOrgType=true 면 'both' 일 때 양쪽 입력용으로, 그 외엔 보기 전환용.
          유형 '선택' 아님(유형은 위 유형 섹션 또는 슈퍼어드민이 결정). */}
      <section className="mb-lg">
        <div className="flex items-center gap-xs">
          {(['hospital', 'transport'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setViewTab(t)}
              className={cn(
                'h-8 px-lg font-serif text-[14px] rounded-full border transition-colors',
                viewTab === t
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {t === 'hospital' ? '동물병원' : '운송회사'}
            </button>
          ))}
        </div>
      </section>

      {!isAdmin && (
        <p className="mb-xl font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed">
          조직 정보는 관리자만 수정할 수 있습니다. 변경이 필요하면 조직 관리자에게 요청해 주세요.
        </p>
      )}

      {/* Field groups */}
      {groups.map((group) => {
        const groupFields = fields.filter((f) => f.group === group)
        // org-level 필드가 없는 그룹(예: 수의사 — 본인 정보는 발급자 섹션) 은 빈 헤더만
        // 뜨므로 건너뛴다. (동물병원에 '수의사'가 두 번 보이던 문제.)
        if (groupFields.length === 0) return null
        return (
        <section key={group} className="mb-xl">
          <SectionLabel className="mb-2">{GROUP_LABELS[group] ?? group}</SectionLabel>
          <div className="border-t border-border/80">
            {groupFields.map((f) => {
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
                        onSelected={(result) => handleAddressSelected(result, f.key as 'address_ko' | 'transport_address_ko')}
                        className="shrink-0 mt-0.5 inline-flex h-7 items-center rounded border px-2 font-serif text-[12px] border-border/80 text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors disabled:opacity-50"
                      />
                    )}
                  </div>
                </SettingsField>
              )
            })}
          </div>
        </section>
        )
      })}

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

      {error && (
        <p className="font-serif text-[13px] text-destructive mb-md">{error}</p>
      )}

      {/* 기본값 복원 + 저장시각 풋터 — onReset 이 주입된 경우(멤버 설정)에만 reset 노출. */}
      <SettingsFooter className="justify-between gap-sm">
        {isAdmin && onReset && hasDefault ? (
          <SettingsActionButton onClick={handleReset}>
            기본값으로 되돌리기
          </SettingsActionButton>
        ) : (
          <span />
        )}
        <span className="font-serif italic text-[12px] text-muted-foreground/60">
          {formatSavedAgo(lastSaved)}
        </span>
      </SettingsFooter>
    </div>
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

/**
 * 조직 아바타 업로드/제거 행. profile-section 의 AvatarRow 와 동일 패턴(클라 리사이즈 →
 * 서버액션 업로드)이되, 대상이 organizations.avatar_url 이고 권한이 조직 관리자라는 점만 다름.
 * 비관리자는 읽기 전용(이미지 + 안내문).
 *
 * 업로드/제거 자체는 props 콜백(onUpload/onRemove)으로 위임 — 멤버 설정은 활성조직
 * 액션을, 슈퍼어드민은 orgId 지정 액션을 주입한다.
 */
function OrgAvatarRow({
  url,
  isAdmin,
  fallbackLabel,
  onUpload,
  onRemove,
  onChange,
  onSaved,
  onError,
}: {
  url: string | null
  isAdmin: boolean
  fallbackLabel: string
  onUpload: (fd: FormData) => Promise<{ ok: boolean; error?: string; avatar_url?: string }>
  onRemove: () => Promise<{ ok: boolean; error?: string }>
  onChange: (url: string | null) => void
  onSaved: () => void
  onError: (msg: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  const label = avatarInitial(fallbackLabel || '조직')

  function pickFile() {
    fileInputRef.current?.click()
  }

  async function handleFile(file: File) {
    if (file.size > AVATAR_MAX_BYTES) {
      onError(`파일이 너무 큽니다 (최대 20MB). 현재 ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return
    }
    setBusy(true)
    onError(null)
    try {
      let blob: Blob
      try {
        blob = await resizeSquareJpeg(file)
      } catch (e) {
        onError(`이미지 처리 실패: ${e instanceof Error ? e.message : String(e)}`)
        return
      }
      const fd = new FormData()
      fd.append('file', blob, 'avatar.jpg')
      const r = await onUpload(fd)
      if (!r.ok) {
        onError(r.error ?? '업로드에 실패했습니다.')
        return
      }
      onChange(r.avatar_url ?? null)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  function handleRemove() {
    if (!url) return
    setBusy(true)
    onError(null)
    startTransition(async () => {
      const r = await onRemove()
      setBusy(false)
      if (!r.ok) {
        onError(r.error ?? '제거에 실패했습니다.')
        return
      }
      onChange(null)
      onSaved()
    })
  }

  return (
    <SettingsField label="조직 아바타" align="center">
      <div className="flex items-center gap-md">
        <Avatar label={label} imageUrl={url} size="md" />
        {isAdmin ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={pickFile}
              disabled={busy}
              className={cn(
                'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
                'border-border/80 text-foreground hover:bg-muted/40',
                busy && 'opacity-60',
              )}
            >
              {url ? '이미지 변경' : '이미지 업로드'}
            </button>
            {url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className={cn(
                  'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
                  'border-border/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40',
                  busy && 'opacity-60',
                )}
              >
                제거
              </button>
            )}
            <span className="font-serif italic text-[12px] text-muted-foreground/70">
              PNG · JPG · WebP · GIF · 자동 512px · 펫무브 보호자 화면에 표시
            </span>
          </>
        ) : (
          <span className="font-serif italic text-[12px] text-muted-foreground/70">
            {url ? '조직 관리자만 변경할 수 있습니다.' : '설정된 조직 아바타가 없습니다.'}
          </span>
        )}
      </div>
    </SettingsField>
  )
}
