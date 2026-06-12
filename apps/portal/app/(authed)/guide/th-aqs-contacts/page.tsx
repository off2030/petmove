'use client'

import { useRouter } from 'next/navigation'
import type { ContactRow, ContactSection } from '@/lib/th-aqs-contacts'
import { TH_AQS_CONTACTS } from '@/lib/th-aqs-contacts'

/**
 * 태국 동물검역소(AQS) 연락처 — '수입 허가 신청' step 에서 진입하는 내부 leaf 페이지.
 * 4탭에 추가하지 않고 step 링크로만 진입. jp-quarantine-contacts 페이지와 동일 톤(Stone/Calm).
 */

const C = {
  bg: 'var(--pm-bg)',
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  line: 'var(--pm-line)',
  accent: 'var(--pm-accent)',
} as const

const serif: React.CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

export default function ThAqsContactsPage() {
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
          태국 동물검역소(AQS) 연락처
        </h1>

        {TH_AQS_CONTACTS.map((section, si) => (
          <Section key={section.title} section={section} first={si === 0} />
        ))}
      </div>
    </div>
  )
}

function Section({ section, first }: { section: ContactSection; first: boolean }) {
  // 소제목(section.title)·설명(subtitle)은 페이지 h1 과 중복이라 노출하지 않고 카드만 바로 보여준다.
  return (
    <div style={{ marginTop: first ? 18 : 32 }}>
      {section.rows && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {section.rows.map((row) => (
            <ContactCard key={`${section.title}-${row.name}`} row={row} />
          ))}
        </div>
      )}
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
        {row.emails.map((e) => (
          <a
            key={`${e.label ?? ''}-${e.address}`}
            href={`mailto:${e.address}`}
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
              {e.label ? <span style={{ color: C.ink2 }}>{e.label} · </span> : null}
              {e.address}
            </span>
          </a>
        ))}
      </div>
    </div>
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
