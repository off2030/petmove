'use server'

import { getCompanyInfo, getOrgType, type OrgType } from './company-info'
import { listMembers, listInvites, listSuperAdmins, type MemberRow, type InviteRow, type SuperAdminRow } from './invites'
import { listOrgVaccineProducts, type OrgVaccineProduct } from './org-vaccine-products'
import { listOrgAutoFillRules, type AutoFillRule } from './org-auto-fill-rules'
import { getMyProfile, type MyProfile } from './profile'
import { getMyOrgRole, type MyOrgRole } from './my-role'
import { getDetailViewSettings } from './detail-view-settings'
import { getCaseAssigneeEnabled } from './transfer-settings'
import { listSharePresets } from './share-presets'
import { loadDestinationOverrides } from '@/lib/destination-overrides-config'
import { loadTodoColumnsConfig, type TodoColumnsConfig } from '@/lib/todo-columns-config'
import type { DetailViewSettings } from '@/lib/detail-view-settings-types'
import type { VetInfo } from '@/lib/vet-info'
import type { DestinationOverridesConfig } from '@petmove/domain'
import type { SharePreset } from '@/lib/share-presets-types'

export interface SettingsBootstrap {
  companyInfo: VetInfo
  orgType: OrgType
  members: MemberRow[]
  invites: InviteRow[]
  superAdmins: SuperAdminRow[]
  vaccineProducts: OrgVaccineProduct[]
  autoFillRules: AutoFillRule[]
  myProfile: MyProfile | null
  myRole: MyOrgRole
  detailViewSettings: DetailViewSettings
  destinationOverrides: DestinationOverridesConfig
  caseAssigneeEnabled: boolean
  sharePresets: SharePreset[]
  todoColumnsConfig: TodoColumnsConfig
  /** 부분 실패가 있으면 섹션별 에러 메시지 — 섹션이 자체 fetch 로 재시도 가능. */
  errors: Partial<Record<'members' | 'invites' | 'superAdmins' | 'vaccineProducts' | 'autoFillRules', string>>
}

/**
 * 설정 페이지 최초 진입 시 모든 섹션 데이터를 한 번에 병렬 fetch.
 * 각 호출이 같은 요청 scope 이므로 getActiveOrgId() 는 React cache() 에 의해 한 번만 실행.
 */
export async function getSettingsBootstrap(): Promise<SettingsBootstrap> {
  const [companyInfo, orgType, membersRes, invitesRes, superAdminsRes, vaccineRes, autoFillRes, myProfile, myRole, detailViewSettings, destinationOverrides, assigneeRes, presetsRes, todoColumnsConfig] = await Promise.all([
    getCompanyInfo(),
    getOrgType(),
    listMembers(),
    listInvites(),
    listSuperAdmins(),
    listOrgVaccineProducts(),
    listOrgAutoFillRules(),
    getMyProfile(),
    getMyOrgRole(),
    getDetailViewSettings(),
    loadDestinationOverrides(),
    getCaseAssigneeEnabled(),
    listSharePresets(),
    loadTodoColumnsConfig(),
  ])

  const errors: SettingsBootstrap['errors'] = {}
  const members = membersRes.ok ? membersRes.value : []
  if (!membersRes.ok) errors.members = membersRes.error
  const invites = invitesRes.ok ? invitesRes.value : []
  if (!invitesRes.ok) errors.invites = invitesRes.error
  const superAdmins = superAdminsRes.ok ? superAdminsRes.value : []
  if (!superAdminsRes.ok) errors.superAdmins = superAdminsRes.error
  const vaccineProducts = vaccineRes.ok ? vaccineRes.value : []
  if (!vaccineRes.ok) errors.vaccineProducts = vaccineRes.error
  const autoFillRules = autoFillRes.ok ? autoFillRes.value : []
  if (!autoFillRes.ok) errors.autoFillRules = autoFillRes.error

  const caseAssigneeEnabled = assigneeRes.ok ? assigneeRes.value : false
  const sharePresets = presetsRes.ok ? presetsRes.value : []

  return { companyInfo, orgType, members, invites, superAdmins, vaccineProducts, autoFillRules, myProfile, myRole, detailViewSettings, destinationOverrides, caseAssigneeEnabled, sharePresets, todoColumnsConfig, errors }
}
