/**
 * 탭/페이지 전환 로딩 스켈레톤.
 *
 * portal 의 탭 페이지는 모두 client 컴포넌트로 CaseDataProvider Context 에서 데이터를
 * 읽지만, (authed) 레이아웃이 force-dynamic 이라 동적 [id] 세그먼트 진입은 RSC payload
 * 서버 왕복을 동반한다. staleTimes(120s) 캐시가 더운 동안은 즉시 전환이지만, 세션 첫
 * 방문·idle 후엔 캐시 미스 → 왕복. loading.tsx 가 없으면 그 사이 이전 화면이 얼어붙은
 * 채 멈춘 것처럼 보인다(특히 모바일 WebView). 이 스켈레톤이 그 공백을 채워 "멈춤"
 * 체감을 없앤다.
 *
 * 디자인 freeze 규칙(CLAUDE.md §5) 준수 — 새 색·간격·타이포를 만들지 않고 기존 --pm-*
 * 토큰과 실제 페이지(timeline-calm·docs-view)의 패딩(24/24, '0 24px')만 따른다.
 */

function Bar({ w, h = 16 }: { w: string | number; h?: number }) {
  return <div className="pm-skeleton" style={{ width: w, height: h }} />
}

function Card() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 16,
        background: 'var(--pm-surface)',
        border: '1px solid var(--pm-line)',
      }}
    >
      <div className="pm-skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
        <Bar w="62%" />
        <Bar w="88%" h={12} />
      </div>
    </div>
  )
}

export function TabSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Bar w="44%" h={24} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <Card key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
