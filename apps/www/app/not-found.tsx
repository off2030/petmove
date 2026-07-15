import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export default function NotFound() {
  return (
    <div className="pg pg-hub">
      <SiteHeader />
      <div className="phead">
        <div className="container">
          <h1>페이지를 찾을 수 없어요</h1>
          <p className="lead">주소가 바뀌었거나 없는 페이지예요. 가이드에서 찾아보세요.</p>
          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <a
              href="/guide/"
              style={{
                display: 'inline-block',
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 14,
                padding: '13px 26px',
                fontSize: 14.5,
              }}
            >
              가이드 보러 가기
            </a>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
