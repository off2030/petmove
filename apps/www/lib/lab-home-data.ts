// /lab/home 시안 전용 데이터 — 플랫폼형 홈의 '바로 답' 카드·준비 기간 묶음·규정 변경 소식.
//
// ⚠️ 시안 단계라 손으로 옮겨 적었다. 출처는 두 곳뿐이다:
//   · packages/domain destination-config.ts 프로파일(접종 횟수·항체 필요·대기·수입허가·편도)
//   · content/docs 각 나라 총정리의 description(수의사 감수 문구)
// 실제 홈으로 승격할 때는 이 표를 프로파일 파생으로 바꿔야 한다 — 손으로 적은 규정은
// 앱과 어긋나는 순간 플랫폼 신뢰가 깨진다(docs/destination-architecture-design.md).

export type Species = 'dog' | 'cat'
export type PrepTier = 'long' | 'mid' | 'short'

export interface FactRow {
  label: string
  value: string
  /** 특정 종에만 해당하는 줄. 생략 = 둘 다. */
  species?: Species
}

export interface QuickFact {
  /** site-data COUNTRIES 의 slug — 총정리 링크(/docs/<slug>-pet-travel-guide/)의 뿌리. */
  slug: string
  ko: string
  /** 검색어 매칭용 별칭(소문자). ko 는 자동 포함. */
  aliases: string[]
  tier: PrepTier
  /**
   * 아무 준비도 안 된 상태에서 시작할 때 최소 준비 기간(일, 대략).
   * 출국 가능일 계산의 근거 — 이미 접종·검사를 마쳤다면 더 짧아진다는 안내를 항상 붙인다.
   */
  prepDays: number
  prepLabel: string
  rows: FactRow[]
  oneWayOnly?: boolean
}

export const TIER_LABEL: Record<PrepTier, { title: string; sub: string }> = {
  long: { title: '6개월 이상', sub: '항체검사 후 오래 기다려요' },
  mid: { title: '3~4개월', sub: '항체검사 후 3개월 안팎' },
  short: { title: '1개월 안팎', sub: '접종·서류 위주로 준비해요' },
}

export const QUICK_FACTS: QuickFact[] = [
  {
    slug: 'japan', ko: '일본', aliases: ['japan', '재팬'], tier: 'long', prepDays: 210, prepLabel: '약 7개월',
    rows: [
      { label: '광견병 접종', value: '2회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈일부터 180일' },
      { label: '사전 절차', value: '입국 40일 전 사전신고' },
      { label: '도착 후', value: '요건을 갖추면 계류 없음' },
    ],
  },
  {
    slug: 'australia', ko: '호주', aliases: ['australia'], tier: 'long', prepDays: 210, prepLabel: '7개월 이상', oneWayOnly: true,
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '검체 접수일부터 180일' },
      { label: '사전 절차', value: '수입 허가증 · 계류 시설 예약' },
      { label: '도착 후', value: '멕크넘 계류 시설 의무 계류' },
    ],
  },
  {
    slug: 'newzealand', ko: '뉴질랜드', aliases: ['new zealand', 'newzealand', 'nz'], tier: 'long', prepDays: 210, prepLabel: '7개월 이상', oneWayOnly: true,
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈 후 3개월' },
      { label: '도착 후', value: '10일 이상 계류' },
    ],
  },
  {
    slug: 'taiwan', ko: '대만', aliases: ['taiwan'], tier: 'long', prepDays: 210, prepLabel: '약 7개월',
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈일부터 180일' },
      { label: '사전 절차', value: '수입 허가 출국 20일 전까지' },
      { label: '도착 후', value: '요건을 갖추면 계류 없음' },
    ],
  },
  {
    slug: 'eu', ko: '유럽', aliases: ['eu', '유럽연합', 'europe'], tier: 'mid', prepDays: 120, prepLabel: '약 4개월',
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈 후 3개월' },
      { label: '나라별 차이', value: '촌충 치료 · 사전 통지' },
      { label: '도착 후', value: '계류 없음' },
    ],
  },
  {
    slug: 'uk', ko: '영국', aliases: ['uk', 'england', '잉글랜드'], tier: 'mid', prepDays: 120, prepLabel: '약 4개월',
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈 후 3개월' },
      { label: '촌충 치료', value: '도착 전 필수', species: 'dog' },
      { label: '운송', value: '화물 운송만 가능' },
    ],
  },
  {
    slug: 'singapore', ko: '싱가포르', aliases: ['singapore'], tier: 'mid', prepDays: 120, prepLabel: '약 4개월', oneWayOnly: true,
    rows: [
      { label: '광견병 접종', value: '1회' },
      { label: '항체검사', value: '입국에 필수' },
      { label: '대기 기간', value: '채혈 후 90일' },
      { label: '사전 절차', value: '수입 허가' },
    ],
  },
  {
    slug: 'hawaii', ko: '하와이', aliases: ['hawaii'], tier: 'mid', prepDays: 90, prepLabel: '약 3개월',
    rows: [
      { label: '광견병 접종', value: '2회 (31일 이상 간격)' },
      { label: '항체검사', value: '입국에 필수 (FAVN)' },
      { label: '대기 기간', value: '검체 접수일부터 30일' },
      { label: '주의', value: '미국 본토와 규정이 달라요' },
    ],
  },
  {
    slug: 'usa', ko: '미국', aliases: ['usa', 'us', 'america', '아메리카'], tier: 'short', prepDays: 30, prepLabel: '약 1개월',
    rows: [
      { label: '사전 절차', value: 'CDC 반려견 입국 신고서', species: 'dog' },
      { label: '나이', value: '생후 6개월 이상', species: 'dog' },
      { label: 'CDC 신고', value: '고양이는 대상 아님', species: 'cat' },
      { label: '항체검사', value: '한국 귀국용 (왕복)' },
    ],
  },
  {
    slug: 'thailand', ko: '태국', aliases: ['thailand', '타이'], tier: 'short', prepDays: 30, prepLabel: '약 1개월',
    rows: [
      { label: '사전 절차', value: '수입 허가증 사전 신청' },
      { label: '접종 기한', value: '광견병·종합백신 입국 21일 전까지' },
      { label: '항체검사', value: '한국 귀국용 (왕복)' },
    ],
  },
  {
    slug: 'philippines', ko: '필리핀', aliases: ['philippines'], tier: 'short', prepDays: 30, prepLabel: '약 1개월',
    rows: [
      { label: '사전 절차', value: '수입 허가증 (SPSIC)' },
      { label: '광견병 접종', value: '1회 (1년 백신만 인정)' },
      { label: '마릿수', value: '1인 최대 3마리' },
      { label: '항체검사', value: '한국 귀국용 (왕복)' },
    ],
  },
  {
    slug: 'vietnam', ko: '베트남', aliases: ['vietnam'], tier: 'short', prepDays: 30, prepLabel: '약 1개월',
    rows: [
      { label: '사전 절차', value: '수입 허가 · 사전 신고 없음' },
      { label: '도착 후', value: '요건을 갖추면 계류 없음' },
      { label: '규정', value: '2026년 1월 새 검역 규칙 시행' },
    ],
  },
  {
    slug: 'canada', ko: '캐나다', aliases: ['canada'], tier: 'short', prepDays: 30, prepLabel: '약 1개월',
    rows: [
      { label: '제출 서류', value: '광견병 접종증명서 한 장' },
      { label: '불필요', value: '건강증명서 · 정부 배서 · 수입 허가' },
    ],
  },
]

/** 준비 기간 묶음 — 바로 답 카드가 없는 나라(괌·스위스 등)도 총정리로 연결된다. */
export const TIER_COUNTRIES: Record<PrepTier, string[]> = {
  long: ['japan', 'australia', 'newzealand', 'taiwan'],
  mid: ['eu', 'uk', 'switzerland', 'singapore', 'hawaii', 'guam', 'turkey'],
  short: ['usa', 'thailand', 'philippines', 'vietnam', 'canada', 'mexico'],
}

export const POPULAR = ['japan', 'usa', 'eu', 'thailand', 'hawaii', 'australia']

/** 규정 변경 소식 — 날짜 = 규정이 바뀐 시점(글 갱신일 아님). 최신순. */
export const RULE_NEWS: Array<{ when: string; country: string; title: string; href: string }> = [
  { when: '2026.07', country: '뉴질랜드', title: '수입위생조건 개정 시행', href: '/docs/newzealand-pet-travel-guide/' },
  { when: '2026.04', country: '유럽', title: '광견병 항체검사 기관 변경', href: '/blog/eu-pet-rabies-test/' },
  { when: '2026.01', country: '베트남', title: '새 검역 규칙 시행', href: '/docs/vietnam-pet-travel-guide/' },
  { when: '2024.08', country: '미국', title: 'CDC 반려견 입국 요건 강화', href: '/docs/usa-pet-travel-guide/' },
  { when: '2024.07', country: '싱가포르', title: '반려동물 입국 요건 변경', href: '/blog/singapore-pet-import-rule-change/' },
  { when: '2024.02', country: '대만', title: '계류 없는 입국 요건 변경', href: '/docs/taiwan-pet-travel-guide/' },
]

/** 업체 찾기 업종 — live 는 지금 있는 페이지, 나머지는 자리만 잡은 시안. */
export const HUB_CATEGORIES: Array<{ title: string; desc: string; href?: string }> = [
  { title: '항공 운송', desc: '화물 운송 견적 문의', href: '/docs/pet-transport-quote/' },
  { title: '현지 에이전시', desc: '도착지 통관·계류 대행' },
  { title: '이동장·용품', desc: '항공사 규격 이동장' },
  { title: '펫 보험', desc: '해외 체류 중 진료' },
]
