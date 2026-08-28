'use client'

import { useEffect, useState } from 'react'
import {
  getCompanyInfo,
  updateCompanyInfo,
  getOrgType,
  updateOrgType,
  getOrgAvatar,
  uploadOrgAvatar,
  removeOrgAvatar,
  type OrgType,
} from '@/lib/actions/company-info'
import type { VetInfo } from '@/lib/vet-info'
import {
  SettingsControlGroup,
  SettingsShell,
  SettingsSection,
  SettingsToggleButton,
} from './settings-layout'
import { OrgInfoForm } from './org-info-form'

export function CompanySection({
  initialInfo = null,
  initialOrgType = null,
  initialAvatarUrl = null,
  isAdmin = false,
}: {
  initialInfo?: VetInfo | null
  initialOrgType?: OrgType | null
  /** bootstrap 에서 실어온 조직 로고 — 없으면 마운트 후 자체 fetch. */
  initialAvatarUrl?: string | null
  isAdmin?: boolean
} = {}) {
  const [info, setInfo] = useState<VetInfo | null>(initialInfo)
  const [orgType, setOrgType] = useState<OrgType | null>(initialOrgType)
  // 동물병원/운송회사 보기 전환. 단일 유형이면 orgType 을 따라가고, 'both' 일 때만
  // 사용자가 토글로 오간다. OrgInfoForm 의 viewTab 을 이 값으로 제어한다.
  const [issuerTab, setIssuerTab] = useState<'hospital' | 'transport'>(
    initialOrgType === 'transport' ? 'transport' : 'hospital',
  )
  const [orgAvatarUrl, setOrgAvatarUrl] = useState<string | null>(initialAvatarUrl)

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

  // 보기 탭을 유형에 맞춰 정렬 — 단일 유형이면 그 쪽으로. 'both' 면 사용자가 토글로
  // 자유 전환하므로 강제하지 않음.
  useEffect(() => {
    if (orgType === 'transport') setIssuerTab('transport')
    else if (orgType === 'hospital') setIssuerTab('hospital')
  }, [orgType])

  // 조직 로고(organizations.avatar_url) — org-level. 펫무브 보호자 화면에 표시됨.
  // 보통 bootstrap 이 실어주므로 여기선 안 부른다. 없을 때만(직접 마운트 등) 보충 —
  // 매번 부르면 로고가 빈 칸으로 떴다가 채워진다(2026-08-06).
  useEffect(() => {
    if (initialAvatarUrl !== null) return
    let alive = true
    getOrgAvatar().then((u) => { if (alive) setOrgAvatarUrl(u) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!info || !orgType) {
    return (
      <SettingsShell>
        <p className="font-serif text-sm text-muted-foreground">불러오는 중...</p>
      </SettingsShell>
    )
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
          viewTab={issuerTab}
          onViewTabChange={setIssuerTab}
        />
        </div>
      </SettingsSection>
    </SettingsShell>
  )
}


