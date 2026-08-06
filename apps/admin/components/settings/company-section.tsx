'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  getCompanyInfo,
  updateCompanyInfo,
  resetCompanyInfo,
  getOrgType,
  updateOrgType,
  hasCompanyInfoDefault,
  getOrgAvatar,
  uploadOrgAvatar,
  removeOrgAvatar,
  type OrgType,
} from '@/lib/actions/company-info'
import {
  getUserContactInfo,
  updateUserContactInfo,
} from '@/lib/actions/user-contact-info'
import type { VetInfo } from '@/lib/vet-info'
import type { UserContactInfo, UserContactKey } from '@/lib/user-contact'
import {
  SettingsCard,
  SettingsControlGroup,
  SettingsShell,
  SettingsSection,
  SettingsField,
  SettingsFooter,
  SettingsSubsectionTitle as SectionLabel,
  SettingsToggleButton,
  formatSavedAgo,
} from './settings-layout'
import { EnglishNameSplitRow } from './english-name-split-row'
import { OrgInfoForm } from './org-info-form'
import { cn } from '@/lib/utils'

/** user-contact 발급자 영문명 split → 합성 키. 수의사/담당자 독립 저장. */
const USER_SPLIT_NAME: Partial<Record<UserContactKey, { first: UserContactKey; last: UserContactKey; combined: UserContactKey }>> = {
  name_first_en:           { first: 'name_first_en',           last: 'name_last_en',           combined: 'name_en' },
  name_last_en:            { first: 'name_first_en',           last: 'name_last_en',           combined: 'name_en' },
  transport_name_first_en: { first: 'transport_name_first_en', last: 'transport_name_last_en', combined: 'transport_name_en' },
  transport_name_last_en:  { first: 'transport_name_first_en', last: 'transport_name_last_en', combined: 'transport_name_en' },
}

/**
 * 한국 전화번호 자동 포맷 — mobile_phone / transport_mobile_phone 입력에 적용.
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
  // 발급자(본인) 정보를 수의사/담당자 중 어느 쪽으로 보여줄지. 단일 유형이면 orgType 을
  // 따라가고(병원→수의사, 운송→담당자), 'both' 일 때만 토글을 노출해 전환.
  // 조직정보 폼(OrgInfoForm)은 자체 viewTab 을 들고 있고, 여긴 발급자 섹션 전용.
  const [issuerTab, setIssuerTab] = useState<'hospital' | 'transport'>(
    initialOrgType === 'transport' ? 'transport' : 'hospital',
  )
  const [error, setError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasDefault, setHasDefault] = useState(false)
  const [orgAvatarUrl, setOrgAvatarUrl] = useState<string | null>(null)
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

  // 발급자 보기 탭을 유형에 맞춰 정렬 — 단일 유형(운송)이면 담당자 쪽으로. 'both' 면
  // 사용자가 토글로 자유 전환하므로 강제하지 않음.
  useEffect(() => {
    if (orgType === 'transport') setIssuerTab('transport')
    else if (orgType === 'hospital') setIssuerTab('hospital')
  }, [orgType])

  useEffect(() => {
    let alive = true
    hasCompanyInfoDefault().then((v) => { if (alive) setHasDefault(v) })
    return () => { alive = false }
  }, [])

  // 조직 아바타(organizations.avatar_url) — org-level. 펫무브 보호자 화면에 표시됨.
  // OrgInfoForm 에 초기값으로 넘긴다(폼 내부에서 업로드/제거 후 자체 갱신).
  useEffect(() => {
    let alive = true
    getOrgAvatar().then((u) => { if (alive) setOrgAvatarUrl(u) })
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

  // ────────────────────────────────────────────────────────────────────
  // user-level 핸들러 — 본인 담당자 정보 (이름·휴대폰·면허)
  // ────────────────────────────────────────────────────────────────────

  function myValueOf(key: UserContactKey): string {
    if (myDrafts[key] !== undefined) return myDrafts[key] ?? ''
    const raw = myInfo?.[key] ?? ''
    if (key === 'mobile_phone' || key === 'transport_mobile_phone') return formatPhoneForSave(raw)
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
    const next = (key === 'mobile_phone' || key === 'transport_mobile_phone') ? formatPhoneForSave(draftVal) : draftVal
    // 영문 First/Last split — 한쪽 변경 시 합성된 (name_en | transport_name_en) 도 함께 저장.
    const patch: Partial<UserContactInfo> = { [key]: next }
    const split = USER_SPLIT_NAME[key]
    if (split) {
      const first = (key === split.first ? next : myInfo[split.first] ?? '').trim()
      const last = (key === split.last ? next : myInfo[split.last] ?? '').trim()
      patch[split.combined] = [first, last].filter(Boolean).join(' ')
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

  if (!info || !orgType) {
    return (
      <SettingsShell>
        <p className="font-serif text-sm text-muted-foreground">불러오는 중...</p>
      </SettingsShell>
    )
  }

  const isTransport = issuerTab === 'transport'
  // 발급자(본인) 키 — 수의사(hospital)와 담당자(transport)는 독립 필드(연동 X).
  const issuerKeys = isTransport
    ? { ko: 'transport_name_ko', first: 'transport_name_first_en', last: 'transport_name_last_en', mobile: 'transport_mobile_phone' } as const
    : { ko: 'name_ko', first: 'name_first_en', last: 'name_last_en', mobile: 'mobile_phone' } as const
  // 조직 공용 기본값(org-level) 키 — 본인 정보를 비웠을 때 placeholder 로 보여줄 값.
  // (cert 발급도 동일: 본인 값 비면 이 org 기본값으로 채워짐 — loadEffectiveVetInfo)
  const issuerDefaultKeys = isTransport
    ? { ko: 'transport_contact_ko', first: 'transport_contact_first_en', last: 'transport_contact_last_en', mobile: 'transport_mobile_phone' } as const
    : { ko: 'name_ko', first: 'name_first_en', last: 'name_last_en', mobile: 'mobile_phone' } as const
  const orgDefaultOf = (k: keyof VetInfo): string => {
    const v = info?.[k]
    return typeof v === 'string' ? v : ''
  }

  const title = '조직정보'

  return (
    <SettingsShell>
      <SettingsSection title={title}>
        <div className="space-y-lg">
        {/* 동물병원/운송회사 — 카드 밖. 이 선택이 아래 카드 구성을 바꾼다.
            space-y-lg 안에 두어 아래 카드와 간격을 둔다 (붙어 있으면 카드에 딸린
            탭처럼 보인다 — 2026-08-06). */}
        <SettingsControlGroup size="md" className="gap-xs">
          {(['hospital', 'transport'] as const).map((t) => (
            <SettingsToggleButton
              key={t}
              pressed={issuerTab === t}
              onClick={() => setIssuerTab(t)}
              className="px-lg"
            >
              {t === 'hospital' ? '동물병원' : '운송회사'}
            </SettingsToggleButton>
          ))}
        </SettingsControlGroup>

        {/* 조직정보(병원·회사 필드 + 아바타 / 추가정보 / 기본값 복원) — 슈퍼어드민 화면과 공유.
            멤버는 유형 변경 불가(canEditOrgType=false). 보기 전환은 위 버튼이 소유. */}
        <OrgInfoForm
          info={info}
          orgType={orgType}
          isAdmin={isAdmin}
          canEditOrgType={false}
          onSaveFields={updateCompanyInfo}
          onSetOrgType={updateOrgType}
          avatarUrl={orgAvatarUrl}
          onAvatarUpload={uploadOrgAvatar}
          onAvatarRemove={removeOrgAvatar}
          onReset={resetCompanyInfo}
          hasDefault={hasDefault}
          viewTab={issuerTab}
          onViewTabChange={setIssuerTab}
        >
        {/* 발급자 본인 정보 — 동물병원 화면에서 "수의사" 카드로. 운송회사는 회사 정보만.
            로그인 사용자 본인 (profiles.contact_info) 만 보이고 편집됨. 한 조직에 멤버
            여럿일 때 각자 본인 명의로 cert 발급되도록 — PDF 매핑(vet:name_en 등) 은
            org_type 에 따라 hospital 측 vet 키 / transport 측 transport_contact 키로
            overlay. 다른 멤버에게는 영향 없음. */}
        {!isTransport && (
        <SettingsCard title="수의사">
          <div>
            {!myInfo ? (
              <p className="py-3 font-serif text-[12px] text-muted-foreground/60">
                불러오는 중...
              </p>
            ) : (
              <>
                <SettingsField label="한글 이름">
                  <input
                    type="text"
                    value={myValueOf(issuerKeys.ko)}
                    onChange={(e) => handleMyChange(issuerKeys.ko, e.target.value)}
                    onBlur={() => handleMySave(issuerKeys.ko)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') cancelMyDraft(issuerKeys.ko)
                    }}
                    placeholder={orgDefaultOf(issuerDefaultKeys.ko) || '—'}
                    className={cn(
                      'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
                      savingMyKey === issuerKeys.ko && 'opacity-60',
                    )}
                  />
                </SettingsField>
                <EnglishNameSplitRow<UserContactKey>
                  firstKey={issuerKeys.first}
                  lastKey={issuerKeys.last}
                  firstValue={myValueOf(issuerKeys.first)}
                  lastValue={myValueOf(issuerKeys.last)}
                  isAdmin={true}
                  saving={savingMyKey === issuerKeys.first || savingMyKey === issuerKeys.last}
                  onChange={handleMyChange}
                  onCommit={handleMySave}
                  onCancel={cancelMyDraft}
                  firstPlaceholder={orgDefaultOf(issuerDefaultKeys.first)}
                  lastPlaceholder={orgDefaultOf(issuerDefaultKeys.last)}
                />
                <SettingsField label="휴대폰">
                  <input
                    type="text"
                    value={myValueOf(issuerKeys.mobile)}
                    onChange={(e) => handleMyChange(issuerKeys.mobile, e.target.value)}
                    onBlur={() => handleMySave(issuerKeys.mobile)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') cancelMyDraft(issuerKeys.mobile)
                    }}
                    placeholder={orgDefaultOf(issuerDefaultKeys.mobile) || '—'}
                    className={cn(
                      'w-full bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
                      savingMyKey === issuerKeys.mobile && 'opacity-60',
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
                      placeholder={orgDefaultOf('license_no') || '—'}
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
        </SettingsCard>
        )}
        </OrgInfoForm>
        </div>

        {error && (
          <p className="font-serif text-[13px] text-destructive mt-md">{error}</p>
        )}

        {/* 발급자 저장시각 — 조직정보 자체 풋터는 OrgInfoForm 내부에 있음. */}
        {lastSaved && (
          <SettingsFooter className="border-t-0">
            <span className="font-serif text-[12px] text-muted-foreground/60">
              {formatSavedAgo(lastSaved)}
            </span>
          </SettingsFooter>
        )}
      </SettingsSection>
    </SettingsShell>
  )
}


