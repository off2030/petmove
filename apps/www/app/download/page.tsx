import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DownloadRedirect } from '@/components/download-redirect'

/**
 * /download — 어디에 뿌려도 되는 앱 설치 단축 주소.
 *
 * 랜딩의 앱 버튼은 AppLink(스마트 링크)라 기기별 스토어로 직행하지만, 그건 컴포넌트라
 * 외부에 붙여넣을 수가 없다. 네이버 블로그·카톡·인스타처럼 **주소만 넣을 수 있는 곳**에
 * `/#download` 를 쓰면 모바일에서도 하단 섹션에 내려앉아 배지를 한 번 더 눌러야 했다.
 * 이 페이지가 그 한 단계를 없앤다 — 주소 하나로 아이폰·안드로이드·아이패드 모두 처리.
 *
 * noindex: 랜딩이 이미 다운로드 키워드를 가져간다. 리디렉트용 페이지가 검색에서 경쟁하면
 * 손해라 색인에서 뺀다(follow 는 유지 — 헤더·푸터 링크는 타고 가게).
 */
export const metadata: Metadata = {
  title: '앱 다운로드 · 펫무브',
  description: '펫무브 앱 설치 - 반려동물 해외 출국 준비 일정을 자동으로 계산해드립니다.',
  robots: { index: false, follow: true },
}

export default function DownloadPage() {
  return (
    <div className="pg pg-hub">
      <SiteHeader />
      <DownloadRedirect />
      <SiteFooter />
    </div>
  )
}
