import type { Metadata } from 'next'

// /lab/ — 비공개 시안 목록. 새 시안을 만들면 여기에 한 줄 추가한다.
export const metadata: Metadata = {
  title: '시안 · 펫무브',
  robots: { index: false, follow: false },
}

const DRAFTS = [{ href: '/lab/home/', title: '플랫폼형 홈', note: '검색·바로 답 중심 첫 화면' }]

export default function LabIndex() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 18px' }}>
      <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>비공개 시안</h1>
      <p style={{ color: 'var(--ink2)', margin: '0 0 24px', fontSize: 14 }}>
        비밀번호로 보호된 페이지예요. 검색엔진에 노출되지 않아요.
      </p>
      {DRAFTS.map((d) => (
        <a
          key={d.href}
          href={d.href}
          style={{ display: 'block', background: '#fff', border: '0.5px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 10 }}
        >
          <b style={{ display: 'block', fontSize: 16 }}>{d.title}</b>
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{d.note}</span>
        </a>
      ))}
    </main>
  )
}
