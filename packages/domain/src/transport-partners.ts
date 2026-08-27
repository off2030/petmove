/**
 * 운송업체 안내 목록 — 여정 '운송 예약 / 항공권 구매' 카드 하단에 뜨는 업체들.
 *
 * ⚠️ 제휴·계약 관계가 아니다. 펫무브가 자주 함께 일하며 공개된 대표 연락처를 안내할 뿐이라,
 * 화면 문구에 '제휴'·'파트너'·'추천' 같은 표현을 쓰지 않는다. 평가·후기·가격도 넣지 않는다
 * (우리가 보증할 수 없는 정보 + 협의 전 표기 리스크).
 *
 * 연락 수단은 전화·메일·견적 문의 폼 세 가지이며, 모든 업체가 같은 구성을 갖춘다.
 * 목록 순서는 케이스마다 회전시켜 위치 편향을 없앤다 —
 * 업체 간 클릭 비교가 실험의 목적이라 첫 자리 프리미엄이 결과를 오염시키면 안 된다.
 */

export interface TransportPartner {
  /** 클릭 로그 키 — outbound_clicks.partner_slug. 바꾸면 과거 데이터와 끊긴다. */
  slug: string
  name: string
  /** tel: 링크용 — 하이픈 표기 그대로 둬도 다이얼러가 처리한다. */
  tel: string
  email: string
  /**
   * 업체가 운영하는 견적 문의 폼. PC 에서 tel:/mailto: 가 먹지 않는 걸 메우는 유일한
   * 연락 수단이라 전화·메일과 같은 비중으로 노출한다.
   * ⚠️ 두 업체 모두 있어야 한다 — 한쪽만 링크가 하나 더 많으면 순서 회전으로 지켜온
   * 중립성이 깨지고 클릭 비교도 오염된다.
   */
  web: string
}

export const TRANSPORT_PARTNERS: readonly TransportPartner[] = [
  {
    slug: 'petairline',
    name: '펫에어라인',
    tel: '02-2667-0112',
    email: 'jeremy@petairline.co.kr',
    web: 'https://petairline.co.kr/%EB%AC%B8%EC%9D%98%ED%95%98%EA%B8%B0-%EA%B5%AD%EA%B0%80%EB%B3%84-%EC%84%B8%EB%B6%80%EC%A0%88%EC%B0%A8-%EB%B0%8F-%EA%B2%AC%EC%A0%81%EB%AC%B8%EC%9D%98/',
  },
  {
    slug: 'worldpettour',
    name: '월드펫투어',
    tel: '02-6264-8288',
    email: 'petdrive@naver.com',
    web: 'https://worldpettour.com/community/request.php',
  },
]

export const TRANSPORT_PARTNER_SLUGS: readonly string[] = TRANSPORT_PARTNERS.map((p) => p.slug)

/**
 * 표시 순서 — seed(케이스 id) 해시로 결정되는 회전. 서버·클라이언트가 같은 값을 내야
 * (hydration mismatch 방지) 해서 Math.random 대신 해시를 쓴다. 케이스가 많아지면 각 업체가
 * 첫 자리에 서는 비율이 자연히 반반으로 수렴한다. 한 고객에게는 순서가 안 흔들린다.
 */
export function orderedTransportPartners(seed: string): readonly TransportPartner[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const shift = Math.abs(h) % TRANSPORT_PARTNERS.length
  return [...TRANSPORT_PARTNERS.slice(shift), ...TRANSPORT_PARTNERS.slice(0, shift)]
}
