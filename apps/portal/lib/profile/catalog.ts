import type { CaseRow } from '@petmove/domain'
import type { CustomerProfileRow } from '@/lib/actions/profile'

/**
 * Portal 프로필(/me) 데이터 모델.
 *
 * 시각 소스: docs/portal-preview/app.jsx 의 `Profile` — Guardian+Pet hero + 동물병원 + 에이전시 + 계정.
 * `/me` 는 case-외 페이지라 primary case (가장 최근 업데이트된 케이스) 의 정보로 hero 와
 * partner 카드를 채운다. 케이스 0건이면 hero pet 줄 / partner 카드 모두 null.
 *
 * 동물병원·에이전시 정보의 출처가 admin 전용이라 portal MVP 에서는 일단 null →
 * placeholder 카드. 추후 admin 의 organization 정보를 portal RLS 가 읽을 수 있게 되면
 * 빌더 인자만 추가하면 됨.
 */

export interface ProfileViewData {
  guardian: GuardianBlock
  pet: PetBlock | null
  clinic: PartnerBlock | null
  transport: PartnerBlock | null
  account: AccountBlock
}

export interface GuardianBlock {
  name: string | null
  nameEn: string | null
  relation: string
  phone: string | null
  email: string | null
  /** Avatar 안 텍스트 (한글 이름의 끝 2자 또는 영문 이니셜). */
  initials: string
}

export interface PetBlock {
  name: string | null
  nameEn: string | null
  breed: string | null
  ageLabel: string | null
  weight: string | null
}

export interface PartnerBlock {
  name: string
  role: string
  subtitle: string | null
  phone: string | null
}

export interface AccountBlock {
  email: string | null
  preferredLanguage: string
  marketingOptIn: boolean
  notificationLabel: string
}

interface BuildArgs {
  userEmail: string | null
  customerProfile: CustomerProfileRow | null
  primaryCase: CaseRow | null
}

export function buildProfileView({
  userEmail,
  customerProfile,
  primaryCase,
}: BuildArgs): ProfileViewData {
  const data = (primaryCase?.data ?? {}) as Record<string, unknown>

  const customerNameKo = primaryCase?.customer_name || customerProfile?.display_name || null
  const customerNameEn = primaryCase?.customer_name_en || null

  const guardian: GuardianBlock = {
    name: customerNameKo,
    nameEn: customerNameEn,
    relation: '보호자',
    phone: pickString(data, 'phone') ?? customerProfile?.phone ?? null,
    email: userEmail ?? pickString(data, 'email'),
    initials: deriveInitials(customerNameKo, customerNameEn, userEmail),
  }

  const pet: PetBlock | null = primaryCase
    ? {
        name: primaryCase.pet_name,
        nameEn: primaryCase.pet_name_en,
        breed: pickString(data, 'breed'),
        ageLabel: ageLabel(pickString(data, 'birth_date')),
        weight: pickString(data, 'weight'),
      }
    : null

  // 동물병원·에이전시 정보는 admin 의 organization 영역. portal RLS 통과 X — Phase 11.1 후속.
  // 시안의 카드 모양을 유지하면서 데이터는 null → 컴포넌트에서 placeholder 렌더.
  const clinic: PartnerBlock | null = null
  const transport: PartnerBlock | null = null

  const account: AccountBlock = {
    email: userEmail,
    preferredLanguage: customerProfile?.preferred_language ?? 'ko',
    marketingOptIn: customerProfile?.marketing_opt_in ?? false,
    notificationLabel: '준비 중',
  }

  return { guardian, pet, clinic, transport, account }
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function pickString(data: Record<string, unknown>, key: string): string | null {
  const v = data[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function deriveInitials(ko: string | null, en: string | null, email: string | null): string {
  if (ko && ko.length >= 1) return ko.slice(-2)
  if (en) {
    const parts = en.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return '—'
}

function ageLabel(birth: string | null): string | null {
  if (!birth) return null
  const b = new Date(birth + 'T00:00:00Z')
  const t = new Date()
  if (isNaN(b.getTime())) return null
  let years = t.getUTCFullYear() - b.getUTCFullYear()
  let months = t.getUTCMonth() - b.getUTCMonth()
  if (t.getUTCDate() < b.getUTCDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years <= 0 && months <= 0) return null
  if (years <= 0) return `${months}M`
  return `${years}Y ${months}M`
}

