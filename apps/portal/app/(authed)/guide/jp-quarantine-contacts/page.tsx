'use client'

import { useRouter } from 'next/navigation'
import {
  JP_QUARANTINE_CONTACTS,
  type ContactRow,
  type ContactSection,
  type ContactSubsection,
} from '@/lib/jp-quarantine-contacts'

/**
 * 일본 동물검역소 연락처 — '사전 신고' / '일본 수출검역 신청' step 에서 진입하는
 * 내부 leaf 페이지. 4탭에 추가하지 않고 step 링크로만 진입. Stone/Calm 톤.
 *
 * 본 흐름(나리타·하네다·간사이) vs 그 외 지역 두 섹션. 본 흐름은 절차 단계별로
 * 담당 부서가 다르기 때문에 subsection 둘로 분기 — 신청·여행 문의(도쿄 본부) vs
 * 사전 신고 승인 후·예약(각 공항 지부).
 */

const C = {
  bg: '#F5EFE8',
  surface: '#FBF7F1',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)',
  accent: '#B89968',
} as const

const serif: React.CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

const monoCap: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.ink3,
  fontWeight: 500,
}

export default function JpQuarantineContactsPage() {
  const router = useRouter()
  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        paddingBottom: 32,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 0,
            padding: '6px 0',
            fontFamily: 'inherit',
            fontSize: 13,
            color: C.ink2,
            cursor: 'pointer',
          }}
        >
          ← 뒤로
        </button>

        <h1 style={{ ...serif, fontSize: 26, lineHeight: 1.15, margin: '8px 0 0', color: C.ink }}>
          일본 동물검역소 연락처
        </h1>

        {JP_QUARANTINE_CONTACTS.map((section, si) => (
          <Section key={section.title} section={section} first={si === 0} />
        ))}
      </div>
    </div>
  )
}

function Section({ section, first }: { section: ContactSection; first: boolean }) {
  return (
    <div style={{ marginTop: first ? 26 : 32 }}>
      <h2 style={{ ...serif, fontSize: 19, margin: 0, color: C.ink, lineHeight: 1.3 }}>
        {section.title}
      </h2>
      {section.subtitle && (
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 4, lineHeight: 1.5 }}>
          {section.subtitle}
        </div>
      )}
      {section.subsections ? (
        section.subsections.map((sub, i) => (
          <Subsection key={sub.title} sub={sub} sectionTitle={section.title} first={i === 0} />
        ))
      ) : section.rows ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {section.rows.map((row) => (
            <ContactCard key={`${section.title}-${row.name}`} row={row} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Subsection({
  sub,
  sectionTitle,
  first,
}: {
  sub: ContactSubsection
  sectionTitle: string
  first: boolean
}) {
  return (
    <div style={{ marginTop: first ? 18 : 22 }}>
      <div style={{ ...monoCap, color: C.ink2, marginBottom: 10, padding: '0 4px' }}>
        {sub.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sub.rows.map((row) => (
          <ContactCard key={`${sectionTitle}-${sub.title}-${row.name}`} row={row} />
        ))}
      </div>
    </div>
  )
}

function ContactCard({ row }: { row: ContactRow }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 14,
        padding: '13px 16px',
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
        {row.name}
      </div>
      {row.location && (
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 3, lineHeight: 1.45 }}>
          {row.location}
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {row.phones.map((p) => (
          <PhoneLink key={p} phone={p} />
        ))}
        {row.faxes.map((f) => (
          <FaxLine key={f} fax={f} />
        ))}
        {row.emails.map((e) => (
          <EmailLink key={`${e.label ?? ''}-${e.address}`} email={e} />
        ))}
      </div>
    </div>
  )
}

/** 전화 — tel: 링크. 표시는 원문 그대로, dial 은 숫자·'+'만. */
function PhoneLink({ phone }: { phone: string }) {
  const dial = phone.replace(/[^0-9+]/g, '')
  return (
    <a
      href={`tel:${dial}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: C.accent,
        textDecoration: 'none',
        lineHeight: 1.5,
      }}
    >
      <IconPhone />
      <span>{phone}</span>
    </a>
  )
}

/** 팩스 — tel 링크 없음 (대부분 모바일에서 팩스 발신 불가). */
function FaxLine({ fax }: { fax: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: C.ink2,
        lineHeight: 1.5,
      }}
    >
      <IconFax />
      <span>{fax}</span>
    </div>
  )
}

/** 이메일 — mailto 링크. 라벨이 있으면 '라벨 · 주소' 로 노출. */
function EmailLink({ email }: { email: { label?: string; address: string } }) {
  return (
    <a
      href={`mailto:${email.address}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: C.accent,
        textDecoration: 'none',
        lineHeight: 1.5,
        wordBreak: 'break-all',
      }}
    >
      <IconMail />
      <span>
        {email.label ? <span style={{ color: C.ink2 }}>{email.label} · </span> : null}
        {email.address}
      </span>
    </a>
  )
}

function IconPhone() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconFax() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}
