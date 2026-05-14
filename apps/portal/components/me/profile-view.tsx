import type { CaseRow } from '@petmove/domain'
import { PetAvatarPicker } from '@/components/me/pet-avatar-picker'
import { signOut } from '@/lib/actions/profile'
import type { GuardianBlock, PartnerBlock, PetBlock, ProfileViewData } from '@/lib/profile/catalog'

/**
 * 보호자 프로필 화면 (/me). Stone 팔레트 / Fraunces serif — TimelineCalm 과 동일 톤.
 *
 * 시각 소스: docs/portal-preview/app.jsx 의 `Profile` — 4 영역:
 *   1) Guardian + Pet hero (case 1건 이상일 때만 pet 줄)
 *   2) 동물병원 PartnerCard
 *   3) 에이전시 PartnerCard
 *   4) 계정 (알림 placeholder + 로그아웃 form)
 *
 * partner 정보는 admin organization 영역이라 Phase 1 에서 null → dashed placeholder card.
 */
export function ProfileView({
  data,
  primaryCase,
}: {
  data: ProfileViewData
  primaryCase: CaseRow | null
}) {
  const C = {
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    soft: '#E8DCC4',
    sage: '#8FA68C',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }
  const num: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 24,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>프로필</h1>

        <HeroCard
          guardian={data.guardian}
          pet={data.pet}
          primaryCase={primaryCase}
          C={C}
          serif={serif}
          num={num}
        />

        <PartnerCard
          cap="동물병원"
          partner={data.clinic}
          placeholder="담당 동물병원 정보가 등록되면 표시됩니다."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11H5a2 2 0 0 0-2 2v7h18v-7a2 2 0 0 0-2-2h-4M12 11V3M9 7h6" />
            </svg>
          }
          C={C}
          serif={serif}
          num={num}
          monoCap={monoCap}
        />

        <PartnerCard
          cap="에이전시"
          partner={data.transport}
          placeholder="출국 운송을 맡은 에이전시 정보가 등록되면 표시됩니다."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
            </svg>
          }
          C={C}
          serif={serif}
          num={num}
          monoCap={monoCap}
        />

        <AccountSection account={data.account} C={C} monoCap={monoCap} />
      </div>
    </div>
  )
}

interface Palette {
  bg: string
  surface: string
  ink: string
  ink2: string
  ink3: string
  line: string
  accent: string
  soft: string
  sage: string
}

// ── Hero (Guardian + Pet) ───────────────────────────────────────────────

function HeroCard({
  guardian,
  pet,
  primaryCase,
  C,
  serif,
  num,
}: {
  guardian: GuardianBlock
  pet: PetBlock | null
  primaryCase: CaseRow | null
  C: Palette
  serif: React.CSSProperties
  num: React.CSSProperties
}) {
  return (
    <div
      style={{
        marginTop: 22,
        padding: 18,
        borderRadius: 18,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            flexShrink: 0,
            background: C.soft,
            color: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...num,
            fontSize: 20,
            fontWeight: 500,
          }}
        >
          {guardian.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...serif, fontSize: 20, color: C.ink }}>{guardian.name ?? '이름 미설정'}</span>
            {guardian.nameEn && (
              <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>
                {guardian.nameEn}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>{guardian.relation}</div>
        </div>
      </div>

      {pet && primaryCase && (
        <>
          <div style={{ height: 0.5, background: C.line }} />
          <PetAvatarPicker case_={primaryCase} pet={pet} />
        </>
      )}
    </div>
  )
}

// ── Partner card ────────────────────────────────────────────────────────

function PartnerCard({
  cap,
  partner,
  placeholder,
  icon,
  C,
  serif,
  num,
  monoCap,
}: {
  cap: string
  partner: PartnerBlock | null
  placeholder: string
  icon: React.ReactNode
  C: Palette
  serif: React.CSSProperties
  num: React.CSSProperties
  monoCap: React.CSSProperties
}) {
  if (!partner) {
    return (
      <div
        style={{
          marginTop: 14,
          padding: 18,
          borderRadius: 18,
          background: C.surface,
          border: `.5px dashed ${C.line}`,
        }}
      >
        <div style={monoCap}>{cap}</div>
        <div style={{ marginTop: 10, fontSize: 13, color: C.ink3, lineHeight: 1.55 }}>{placeholder}</div>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 18,
        borderRadius: 18,
        background: C.surface,
        border: `.5px solid ${C.line}`,
      }}
    >
      <div style={monoCap}>{cap}</div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            flexShrink: 0,
            background: C.soft,
            color: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...serif, fontSize: 17, color: C.ink, lineHeight: 1.2 }}>{partner.name}</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 3 }}>
            {[partner.role, partner.subtitle].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `.5px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={monoCap}>연락처</span>
        <span style={{ ...num, fontSize: 13, color: C.ink }}>{partner.phone ?? '—'}</span>
      </div>
    </div>
  )
}

// ── Account ─────────────────────────────────────────────────────────────

function AccountSection({
  account,
  C,
  monoCap,
}: {
  account: ProfileViewData['account']
  C: Palette
  monoCap: React.CSSProperties
}) {
  return (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>계정</div>
      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 18,
          padding: '4px 16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '13px 0',
            borderBottom: `.5px solid ${C.line}`,
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: C.ink2 }}>이메일</span>
          <span
            style={{
              fontSize: 15,
              color: C.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {account.email ?? '—'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '13px 0',
            borderBottom: `.5px solid ${C.line}`,
          }}
        >
          <span style={{ fontSize: 13, color: C.ink2 }}>알림</span>
          <span style={{ fontSize: 15, color: C.ink3 }}>{account.notificationLabel}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '13px 0',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13, color: C.ink2 }}>로그아웃</span>
            <span style={{ fontSize: 15, color: C.ink3 }}>›</span>
          </button>
        </form>
      </div>
    </>
  )
}

