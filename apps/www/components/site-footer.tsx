// 공통 푸터 — 3벌(랜딩·가이드·문의·글) 동일. 약관류는 app.petmove.co.kr 한 곳만 관리.
export function SiteFooter() {
  return (
    <footer>
      <div className="container">
        <div style={{ color: '#212124', fontWeight: 600, marginBottom: 6 }}>펫무브 · PETMOVE</div>
        로잔동물의료센터 · 사업자등록번호 124-18-42859
        <br />
        서울시 관악구 관악로29길 3 · <a href="tel:02-872-7588">02-872-7588</a>
        <br />
        <a href="https://blog.naver.com/petmove" target="_blank" rel="noopener" className="fsns">
          <span className="nlogo">N</span>네이버 블로그
        </a>
        <br />
        <a href="https://app.petmove.co.kr/terms">이용약관</a> · <a href="https://app.petmove.co.kr/privacy">개인정보처리방침</a> ·{' '}
        <a href="https://app.petmove.co.kr/support">고객지원</a>
        <br />
        <span style={{ color: '#97979C' }}>© 2026 펫무브</span>
      </div>
    </footer>
  )
}
