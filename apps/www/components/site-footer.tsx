// 공통 푸터 — 3벌(랜딩·가이드·문의·글) 동일. 약관류는 app.petmove.co.kr 한 곳만 관리.
// '문의'는 홈페이지 문의 페이지(/contact)로 — 앱의 /support 는 앱스토어 지원 URL 용이다.
// 주소·전화는 두지 않는다(2026-10-05). 제휴 메일도 푸터엔 두지 않는다 — 문의 페이지의
// '제휴·업무 문의' 칸이 그 자리다.
//
// 구성(2026-10-05 사용자 확정): 로고 → 상단 메뉴와 같은 3링크 → 네이버 블로그 → 약관
// → 구분선 아래 사업자번호·저작권. PC·모바일 같은 한 줄기(스타일 = site.css .sf-*).
import { LogoMark } from '@/components/logo-mark'

export function SiteFooter() {
  return (
    <footer className="sf">
      <div className="container">
        <a href="/" className="sf-logo">
          <LogoMark size={24} />
          <span>펫무브</span>
        </a>
        <nav className="sf-row sf-nav" aria-label="푸터">
          <a href="/#service">서비스</a>
          <a href="/guide/">가이드</a>
          <a href="/contact/">문의</a>
        </nav>
        <div className="sf-row">
          <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" className="sf-blog">
            <span className="nlogo">N</span>네이버 블로그
          </a>
        </div>
        <div className="sf-row sf-legal">
          <a href="https://app.petmove.co.kr/terms">이용약관</a>
          <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a>
        </div>
        <div className="sf-bottom">
          <span>사업자등록번호 124-18-42859</span>
          <span>© 2026 펫무브 · 콘텐츠의 무단 전재·복제·배포를 금합니다</span>
        </div>
      </div>
    </footer>
  )
}
