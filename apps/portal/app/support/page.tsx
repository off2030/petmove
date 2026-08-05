import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { LegalBackBar } from '@/components/legal-back-bar'
import { C } from '@/lib/palette'

/**
 * 고객지원 (/support) — 앱스토어 지원 URL. 시작 가이드와 같은 앱 톤(카드형)으로 렌더.
 * 옛 legal-prose 마크다운(docs/legal/support.md) 방식은 폐기 — 고객 첫인상 페이지라
 * 도움말·문의 채널을 탭 가능한 행 카드로 보여준다.
 */

export const metadata: Metadata = {
  title: '고객지원 — 펫무브',
  description: '펫무브 고객지원 · 문의 안내',
}

const SUPPORT_EMAIL = 'petmove@naver.com'
const KAKAO_URL = 'https://pf.kakao.com/_zDDxhj'

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: C.ink3,
  letterSpacing: '0.03em',
  margin: '0 4px 8px',
}

const card: CSSProperties = {
  background: C.surface,
  border: `.5px solid ${C.line}`,
  borderRadius: 18,
  padding: '2px 18px',
}

const chevron = <span style={{ fontSize: 15, color: C.ink3, flexShrink: 0 }}>›</span>

function rowStyle(last?: boolean): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 0',
    borderBottom: last ? 'none' : `.5px solid ${C.line}`,
    textDecoration: 'none',
    color: 'inherit',
  }
}

function RowInner({ title, value }: { title: string; value?: string }) {
  return (
    <>
      <span style={{ fontSize: 14, color: C.ink }}>{title}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {value && (
          <span
            style={{
              fontSize: 13,
              color: C.ink3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {value}
          </span>
        )}
        {chevron}
      </span>
    </>
  )
}

function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 24 }}>
      <div style={label}>{title}</div>
      <div style={card}>{children}</div>
    </div>
  )
}

export default function SupportPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100dvh' }}>
      <LegalBackBar title="고객지원" />
      <main style={{ maxWidth: '42rem', margin: '0 auto', padding: '20px 20px 56px' }}>
        <p style={{ margin: '0 4px 22px', fontSize: 14, lineHeight: 1.7, color: C.ink2 }}>
          펫무브를 이용하면서 궁금한 점이나 도움이 필요하시면 아래로 문의해 주세요. 확인 후
          순차적으로 답변드립니다.
        </p>

        <Section title="도움말" first>
          <Link href="/help/start" style={rowStyle()}>
            <RowInner title="펫무브 시작 가이드" />
          </Link>
          <Link href="/help/faq" style={rowStyle(true)}>
            <RowInner title="자주 묻는 질문" />
          </Link>
        </Section>

        <Section title="문의 채널">
          <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer" style={rowStyle()}>
            <RowInner title="카카오톡 채널" value="pf.kakao.com/_zDDxhj" />
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={rowStyle(true)}>
            <RowInner title="이메일" value={SUPPORT_EMAIL} />
          </a>
        </Section>

        <div style={{ margin: '26px 4px 0', fontSize: 12, lineHeight: 1.7, color: C.ink3 }}>
          <div>운영 주체: 로잔동물의료센터 (사업자등록번호 124-18-42859)</div>
          <div style={{ marginTop: 6 }}>
            For support, please contact us at {SUPPORT_EMAIL} or through our KakaoTalk channel
            above.
          </div>
        </div>
      </main>
    </div>
  )
}
