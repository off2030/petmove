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
    '반려동물을 항공 화물로 보낼 때 비용이 어떻게 정해지는지, 견적 받을 때 무엇을 알려줘야 하는지 정리했습니다. 운송을 대행하는 업체 연락처도 함께 확인하세요.',
  alternates: { canonical: '/docs/pet-transport-quote/' },
  openGraph: {
    type: 'article',
    url: '/docs/pet-transport-quote/',
    title: '반려동물 항공 운송업체 견적 받는 방법 · 펫무브',
    description:
      '항공 화물 운임은 이동장을 포함한 부피와 노선으로 정해집니다. 견적 받는 방법과 운송 대행 업체 연락처를 안내합니다.',
  },
}

/** 가는 방법 3갈래 — 어떤 경우에 업체가 필요한지 가르는 기준. */
const WAYS: { label: string; body: string }[] = [
  {
    label: '기내 동반',
    body: '작은 반려동물을 보호자 좌석 발밑에 두고 갑니다. 항공사마다 무게와 이동장 규격 기준이 있고, 요금도 정해져 있습니다.',
  },
  {
    label: '위탁 수하물',
    body: '같은 비행기 화물칸에 보호자의 수하물로 부칩니다. 이것도 항공사가 공지한 요금표가 있습니다.',
  },
  {
    label: '항공 화물',
    body: '보호자와 따로, 정식 화물로 보냅니다. 호주·뉴질랜드처럼 이 방법으로만 갈 수 있는 나라도 있습니다. 요금이 정해져 있지 않아 견적이 필요합니다.',
  },
]

/** 견적 요청할 때 업체가 묻는 것들 — 미리 챙기면 한 번에 끝난다. */
const QUOTE_INPUTS: string[] = [
  '반려동물 종류·품종·몸무게',
  '이동장(케이지) 크기 — 가로·세로·높이',
  '출발 공항과 도착 도시',
  '희망 출국일 (또는 대략적인 시기)',
  '편도인지 왕복인지',
  '마이크로칩·광견병 백신 등 준비 상황',
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
          <h1>반려동물 항공 운송업체 견적 받는 방법</h1>
          <div className="art-meta">마지막 업데이트 2026.08.26 · 읽는 데 약 3분</div>
        </div>

        {/* 순서 = 클릭 의도 우선. '운송업체'를 눌러 들어온 사람에게 설명부터 들이밀지 않는다 —
            연락처를 먼저 주고, 왜 견적이 필요한지는 그 아래에서 설명한다(2026-08-26 사용자 지적). */}
        <div className="prose">
          <p>
            반려동물을 <strong>항공 화물</strong>로 보낼 때는 운송업체를 통해 예약합니다. 화물
            운임은 정해진 표가 없어 아이 기준으로 견적을 받아야 합니다. 객실이나 수하물로 함께
            갈 수 있다면 항공사가 공지한 요금표대로입니다.
          </p>

          <h2 id="partners">운송을 대행하는 업체</h2>
          <p>
            펫무브와 계약 관계가 있는 업체는 아니며, 공개된 대표 연락처를 안내해 드립니다.
            비용과 조건은 업체에 직접 확인해 주세요.
          </p>
          <TransportPartners />

          <h2 id="quote-inputs">연락하기 전에 챙길 것</h2>
          <p>아래 정보를 미리 정리해서 전달하면 견적이 한 번에 나옵니다.</p>
          <ul>
            {QUOTE_INPUTS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>

          <h2 id="why-quote">화물은 왜 정해진 요금이 없나</h2>
          <p>
            항공 화물 운임은 <strong>이동장을 포함한 부피</strong>와 <strong>노선</strong>이 거의
            다 정합니다. 같은 나라로 가더라도 아이의 몸집과 이동장 크기가 다르면 금액이 크게
            달라집니다. 여기에 시기(성수기)와 경유 여부가 얹혀 조금씩 더 차이가 납니다.
          </p>
          <p>
            그래서 항공사 요금표처럼 미리 정리해 둘 수가 없습니다. 우리 아이 기준으로 견적을
            받아보셔야 정확한 금액을 알 수 있습니다.
          </p>

          <h2 id="ways">가는 방법 세 가지</h2>
          <ul>
            {WAYS.map((w) => (
              <li key={w.label}>
                <strong>{w.label}</strong> — {w.body}
              </li>
            ))}
          </ul>

          <h2 id="airline-fees">기내·수하물로 갈 때의 요금은</h2>
          <p>
            기내 동반과 위탁 수하물은 항공사가 요금을 공지합니다. 항공사별 요금과 기내반입
            기준은 <a href="/docs/airline-pet-cabin-fees/">반려동물 운송요금</a> 에서 확인하세요.
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
