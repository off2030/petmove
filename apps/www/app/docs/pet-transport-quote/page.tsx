import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AppLink } from '@/components/app-link'
import { TransportPartners } from '@/components/transport-partners'

/**
 * 반려동물 항공 운송업체 견적 — /docs/[slug](콘텐츠 JSON)와 달리 **React 페이지**다.
 * 업체 목록을 @petmove/domain 에서 가져와 고객앱과 같은 출처를 쓰고, 연락 클릭을
 * 기록해야 하기 때문(정적 HTML로는 둘 다 안 된다).
 *
 * 이 자리를 따로 두는 이유: 업체를 안내할 자리가 여러 곳(가이드 글·앱 여정 카드)인데
 * 정보를 곳곳에 박아두면 업체가 바뀔 때마다 흩어진 곳을 다 고쳐야 한다. 링크는 전부
 * 여기를 가리킨다.
 *
 * 내용의 축 = "화물은 왜 정해진 요금이 없나". 이동장을 포함한 부피와 노선이 운임을 거의
 * 다 정하고 시기·경유가 얹히기 때문에 표로 만들 수가 없다. 억지 요금표는 부정확해서
 * 신뢰만 깎으므로 넣지 않는다 — 대신 견적이 필요한 이유를 설명하고 업체로 잇는다.
 *
 * 표기: 계약 관계가 아니므로 '제휴·파트너·추천'을 쓰지 않고, 평가·순위·가격도 넣지 않는다.
 */

export const metadata: Metadata = {
  title: '반려동물 항공 운송업체 견적 받는 방법 · 펫무브',
  description:
    '반려동물을 항공 화물로 보낼 때 비용이 어떻게 정해지는지, 문의할 때 무엇을 알려줘야 하는지 정리했습니다. 운송업체 연락처도 함께 확인하세요.',
  alternates: { canonical: '/docs/pet-transport-quote/' },
  openGraph: {
    type: 'article',
    url: '/docs/pet-transport-quote/',
    title: '반려동물 항공 운송업체 견적 받는 방법 · 펫무브',
    description:
      '비용은 여행지·동물의 크기·서비스 범위에 따라 달라집니다. 문의할 때 필요한 정보와 운송업체 연락처를 안내합니다.',
  },
}

/** 견적 요청할 때 업체가 묻는 것들 — 미리 챙기면 한 번에 끝난다. */
const QUOTE_INPUTS: string[] = [
  '반려동물 종·품종',
  '반려동물 나이·성별',
  '반려동물 체중·크기(가로·세로·높이)',
  '여행지·출발 예정일',
]

export default function TransportQuotePage() {
  return (
    <div className="pg pg-article">
      <SiteHeader active="guide" />
      <article className="article">
        <div className="crumb">
          <a href="/guide/">가이드</a>
          <span className="sep">›</span>
          <a href="/guide/">항공·운송</a>
        </div>
        <div className="art-head">
          <span className="art-cat">항공·운송</span>
          <h1>반려동물 항공 운송업체 문의</h1>
          <div className="art-meta">마지막 업데이트 2026.08.26 · 읽는 데 약 3분</div>
        </div>

        {/* 검색 유입용이 아니라 링크 목적지다 — 분량을 위한 분량을 두지 않는다. 여기 오는
            사람은 "화물로 보내야 한다"를 이미 읽고 눌러 온 사람이라, 운송 방식 3갈래 설명은
            아는 걸 되풀이하는 것이었다(2026-08-26 삭제). 연락처 · 연락 전 준비물 · 왜 견적이
            필요한지 한 문장만 남긴다. */}
        <div className="prose">
          <p>
            반려동물을 <strong>항공 화물</strong>로 보낼 때는 운송업체를 통해 비행기를 예약합니다.
            계류시설 예약, 수입 허가 신청 등도 함께 의뢰할 수 있습니다. 비용은 여행지, 동물의
            크기, 서비스 범위에 따라 달라집니다. 우리 아이 상황에 맞게 견적을 받아보세요.
          </p>

          <h2 id="partners">문의처</h2>
          <TransportPartners />

          <h2 id="quote-inputs">문의할 때 필요한 정보</h2>
          <p>문의 전에 다음 정보를 확인해두시면 좋습니다.</p>
          <ul>
            {QUOTE_INPUTS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>

          <h2 id="notes">참고 사항</h2>
          {/* ⚠️ 링크 목적지는 임시다 — 항공·운송 글 몇 편을 합친 새 문서가 나오면 그쪽으로
              바꾼다(2026-08-27 사용자 계획). 그때까지 가장 가까운 기존 문서로 보낸다. */}
          <p>
            반려동물을 직접 데리고 가시는 경우는 운송업체가 아니고 항공사에 예약하셔야 합니다.{' '}
            <a href="/docs/airline-pet-cabin-fees/">반려동물 운송요금·기내반입 기준</a>에서 확인하세요.
          </p>
        </div>

        <hr className="cta-sep" />
        <div className="cta2">
          <a className="svc" href="/contact/">
            <i className="ti ti-message-circle" />
            전문가에게 맡기기
          </a>
          <AppLink className="app">
            <i className="ti ti-download" />
            무료 앱으로 시작하기
          </AppLink>
        </div>
      </article>
      <SiteFooter />
    </div>
  )
}
