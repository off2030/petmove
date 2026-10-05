// 공통 푸터 — 3벌(랜딩·가이드·문의·글) 동일. 약관류는 app.petmove.co.kr 한 곳만 관리.
// 고객지원은 홈페이지 문의 페이지(/contact)로 — 앱의 /support 는 앱스토어 지원 URL 용이다.
// 주소·전화는 두지 않는다(2026-10-05) — 고객 문의는 /contact, 업체 연락은 제휴 문의 메일로만.
import { CONTACT } from '@/lib/site-data'

export function SiteFooter() {
  return (
    <footer>
      <div className="container">
        <div style={{ color: '#212124', fontWeight: 600, marginBottom: 6 }}>펫무브 · PETMOVE</div>
        사업자등록번호 124-18-42859
        <br />
        제휴 문의 <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        <br />
        <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" className="fsns">
          <span className="nlogo">N</span>네이버 블로그
        </a>
        <br />
        <a href="https://app.petmove.co.kr/terms">이용약관</a> · <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a> ·{' '}
        <a href="/contact">고객지원</a>
        <br />
        <span style={{ color: '#97979C' }}>© 2026 펫무브 · 콘텐츠의 무단 전재·복제·배포를 금합니다</span>
      </div>
    </footer>
  )
}
