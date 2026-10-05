// 공통 푸터 — 3벌(랜딩·가이드·문의·글) 동일. 약관류는 app.petmove.co.kr 한 곳만 관리.
// 고객지원은 홈페이지 문의 페이지(/contact)로 — 앱의 /support 는 앱스토어 지원 URL 용이다.
// 주소·전화는 두지 않는다(2026-10-05) — 고객 문의는 /contact, 업체 연락은 제휴 문의 메일로만.
//
// 구성(2026-10-05): 왼쪽 브랜드(로고·한 줄 소개) / 오른쪽 링크 묶음(바로가기·안내·제휴)
// → 맨 아래 한 줄에 사업자번호·저작권. 모바일은 위에서 아래로 쌓인다(스타일 = site.css .sf-*).
import { LogoMark } from '@/components/logo-mark'
import { CONTACT } from '@/lib/site-data'

export function SiteFooter() {
  return (
    <footer className="sf">
      <div className="container">
        <div className="sf-top">
          <div className="sf-brand">
            <a href="/" className="sf-logo">
              <LogoMark size={24} />
              <span>펫무브</span>
            </a>
            <p className="sf-tag">반려동물 해외여행·검역 준비</p>
          </div>
          <nav className="sf-cols" aria-label="푸터">
            <div className="sf-col">
              <div className="sf-h">바로가기</div>
              <a href="/#service">서비스</a>
              <a href="/guide/">가이드</a>
              <a href="/contact/">고객지원</a>
            </div>
            <div className="sf-col">
              <div className="sf-h">안내</div>
              <a href="https://app.petmove.co.kr/terms">이용약관</a>
              <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a>
            </div>
            <div className="sf-col">
              <div className="sf-h">제휴 문의</div>
              <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" className="sf-blog">
                <span className="nlogo">N</span>네이버 블로그
              </a>
            </div>
          </nav>
        </div>
        <div className="sf-bottom">
          <span>사업자등록번호 124-18-42859</span>
          <span>© 2026 펫무브 · 콘텐츠의 무단 전재·복제·배포를 금합니다</span>
        </div>
      </div>
    </footer>
  )
}
