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
export function ProfileView({ data }: { data: ProfileViewData }) {
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
    fontFamily: "'Fraunces', 'Pretendard Variable', serif",
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }
  const num: React.CSSProperties = {
    fontFamily: "'Fraunces', 'Inter', serif",
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 10.5,
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
        <h1 style={{ ...serif, fontSize: 30, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>프로필</h1>

        <HeroCard guardian={data.guardian} pet={data.pet} C={C} serif={serif} num={num} />

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
  C,
  serif,
  num,
}: {
  guardian: GuardianBlock
  pet: PetBlock | null
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
            fontSize: 18,
            fontWeight: 500,
          }}
        >
          {guardian.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...serif, fontSize: 18, color: C.ink }}>{guardian.name ?? '이름 미설정'}</span>
            {guardian.nameEn && (
              <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>
                {guardian.nameEn}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>{guardian.relation}</div>
        </div>
      </div>

      {pet && (
        <>
          <div style={{ height: 0.5, background: C.line }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PetAvatar size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...serif, fontSize: 18, color: C.ink }}>{pet.name ?? '이름 미정'}</span>
                {pet.nameEn && (
                  <span style={{ ...serif, fontStyle: 'italic', fontSize: 13, color: C.ink3, fontWeight: 400 }}>
                    {pet.nameEn}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
                {[pet.breed, pet.ageLabel, pet.weight].filter(Boolean).join(' · ') || '추가 정보 미입력'}
              </div>
            </div>
          </div>
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
        <div style={{ ...monoCap, fontSize: 9.5 }}>{cap}</div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.ink3, lineHeight: 1.55 }}>{placeholder}</div>
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
      <div style={{ ...monoCap, fontSize: 9.5 }}>{cap}</div>
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
          <div style={{ ...serif, fontSize: 16, color: C.ink, lineHeight: 1.2 }}>{partner.name}</div>
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
        <span style={{ ...monoCap, fontSize: 9 }}>연락처</span>
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
          <span style={{ fontSize: 12.5, color: C.ink2 }}>이메일</span>
          <span
            style={{
              fontSize: 13.5,
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
          <span style={{ fontSize: 12.5, color: C.ink2 }}>알림</span>
          <span style={{ fontSize: 13.5, color: C.ink3 }}>{account.notificationLabel}</span>
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
            <span style={{ fontSize: 12.5, color: C.ink2 }}>로그아웃</span>
            <span style={{ fontSize: 13.5, color: C.ink3 }}>›</span>
          </button>
        </form>
      </div>
    </>
  )
}

function PetAvatar({ size = 52 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #F2C9A4 0%, #E5A776 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40">
        <path
          d="M20 8c-7 0-12 4.5-12 11 0 5 3 9 8 10.5 1.2.3 2.6.5 4 .5s2.8-.2 4-.5c5-1.5 8-5.5 8-10.5 0-6.5-5-11-12-11z"
          fill="#FFF6EE"
        />
        <path d="M11 11l3.5 5.5L9 16l2-5z" fill="#C9824D" />
        <path d="M29 11l-3.5 5.5L31 16l-2-5z" fill="#C9824D" />
        <path d="M11.5 12l2.5 4L10.5 16l1-4z" fill="#FFD9B5" />
        <path d="M28.5 12l-2.5 4L29.5 16l-1-4z" fill="#FFD9B5" />
        <path
          d="M14 18c-1 3-1 6 0 8 1 2 3.5 3 6 3s5-1 6-3c1-2 1-5 0-8-2-1-4-1.5-6-1.5s-4 .5-6 1.5z"
          fill="#F5DCC1"
        />
        <circle cx="16" cy="20" r="1.2" fill="#1F1B2E" />
        <circle cx="24" cy="20" r="1.2" fill="#1F1B2E" />
        <ellipse cx="20" cy="24" rx="1.4" ry="1" fill="#1F1B2E" />
        <path
          d="M20 25v1.5M18 27c.5.5 1.2.7 2 .7s1.5-.2 2-.7"
          stroke="#1F1B2E"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
