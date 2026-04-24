'use server'

import { getCompanyInfo, getOrgType, type OrgType } from './company-info'
import { listMembers, listInvites, type MemberRow, type InviteRow } from './invites'
import { listOrgVaccineProducts, type OrgVaccineProduct } from './org-vaccine-products'
import { listOrgAutoFillRules, type AutoFillRule } from './org-auto-fill-rules'
import { getMyProfile, type MyProfile } from './profile'
import { getMyOrgRole, type MyOrgRole } from './my-role'
import type { VetInfo } from '@/lib/vet-info'

export interface SettingsBootstrap {
  companyInfo: VetInfo
  orgType: OrgType
  members: MemberRow[]
  invites: InviteRow[]
  vaccineProducts: OrgVaccineProduct[]
  autoFillRules: AutoFillRule[]
  myProfile: MyProfile | null
  myRole: MyOrgRole
  /** 부분 실패가 있으면 섹션별 에러 메시지 — 섹션이 자체 fetch 로 재시도 가능. */
  errors: Partial<Record<'members' | 'invites' | 'vaccineProducts' | 'autoFillRules', string>>
}

/**
 * 설정 페이지 최초 진입 시 모든 섹션 데이터를 한 번에 병렬 fetch.
 * 각 호출이 같은 요청 scope 이므로 getActiveOrgId() 는 React cache() 에 의해 한 번만 실행.
 */
export async function getSettingsBootstrap(): Promise<SettingsBootstrap> {
  const [companyInfo, orgType, membersRes, invitesRes, vaccineRes, autoFillRes, myProfile, myRole] = await Promise.all([
    getCompanyInfo(),
    getOrgType(),
    listMembers(),
    listInvites(),
    listOrgVaccineProducts(),
    listOrgAutoFillRules(),
    getMyProfile(),
    getMyOrgRole(),
  ])

  const errors: SettingsBootstrap['errors'] = {}
  const members = membersRes.ok ? membersRes.value : []
  if (!membersRes.ok) errors.members = membersRes.error
  const invites = invitesRes.ok ? invitesRes.value : []
  if (!invitesRes.ok) errors.invites = invitesRes.error
  const vaccineProducts = vaccineRes.ok ? vaccineRes.value : []
  if (!vaccineRes.ok) errors.vaccineProducts = vaccineRes.error
  const autoFillRules = autoFillRes.ok ? autoFillRes.value : []
  if (!autoFillRes.ok) errors.autoFillRules = autoFillRes.error

  return { companyInfo, orgType, members, invites, vaccineProducts, autoFillRules, myProfile, myRole, errors }
}
