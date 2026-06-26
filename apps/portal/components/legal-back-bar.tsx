'use client'

import { useRouter } from 'next/navigation'

/**
 * 약관·개인정보처리방침(/terms, /privacy)용 상단 뒤로가기 바.
 *
 * 이 페이지들은 (authed) 셸 밖이라 상단바·하단탭이 없다 → 네이티브 앱에선 들어오면
 * 문서만 꽉 차고 돌아갈 방법이 없어 갇힌다(브라우저 뒤로 버튼 없음). 이 바로 복귀 경로 제공.
 * router.back() — 설정에서 왔으면 설정으로, 로그인 푸터에서 왔으면 로그인으로 자연 복귀.
 */
export function LegalBackBar({ title }: { title: string }) {
  const router = useRouter()
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'hsl(var(--background) / 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '0.5px solid hsl(var(--border))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 48,
          padding: '0 12px',
          maxWidth: '42rem',
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            background: 'transparent',
            border: 0,
            color: 'hsl(var(--muted-foreground))',
            fontSize: 14,
            cursor: 'pointer',
            padding: '8px 4px',
            fontFamily: 'inherit',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          뒤로
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</span>
      </div>
    </div>
  )
}
