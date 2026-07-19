// www 사이트 데이터 단일 출처 — 구 프로토타입 생성기(scripts/make_www_prototype.py ·
// make_www_subpages.py)의 데이터를 이식. 글 목록·인기 가이드를 바꿀 땐 여기만 수정.

export type PostKind = 'docs' | 'blog'

export interface PostRef {
  title: string
  kind: PostKind
  slug: string
}

export const postPath = (p: { kind: PostKind; slug: string }) => `/${p.kind}/${p.slug}/`

// ── 인기 가이드(랜딩 아님, 가이드 허브 상단) — 인기 여행지 3 (2026-07-15 사용자 확정) ──
export interface FeaturedGuide extends PostRef {
  excerpt: string
  image: string
}

export const FEATURED: FeaturedGuide[] = [
  {
    title: '일본 입국 준비 총정리',
    excerpt: '마이크로칩부터 항체검사 180일 대기까지, 준비 순서와 기간을 한눈에 정리했어요',
    kind: 'docs',
    slug: 'japan-pet-travel-guide',
    image: '/content/images/2026/01/japan-pet-travel-cover.webp',
  },
  {
    title: '싱가포르 입국 준비 총정리',
    excerpt: '수입허가 등 챙길 서류가 많은 여행지예요. 절차를 단계별로 정리했어요',
    kind: 'docs',
    slug: 'singapore-pet-travel-guide',
    image: '/content/images/2026/03/Gemini_Generated_Image_m9o5ipm9o5ipm9o5.png',
  },
  {
    title: '호주 입국 준비 총정리',
    excerpt: '준비 기간이 가장 긴 여행지 중 하나예요. 무엇부터 시작할지 순서대로 정리했어요',
    kind: 'docs',
    slug: 'australia-pet-travel-guide',
    image: '/content/images/2026/03/Gemini_Generated_Image_3prrqm3prrqm3prr.png',
  },
]

// ── 나라별 가이드 34개국 — 5그룹(2026-07-15 재편: 괌=오세아니아, 중동·아프리카 신설) ──
export interface Country {
  ko: string
  slug: string
  region: string
}

export const REGIONS = ['아시아', '유럽', '미주', '오세아니아', '중동·아프리카'] as const

export const COUNTRIES: Country[] = [
  // 아시아
  { ko: '일본', slug: 'japan', region: '아시아' },
  { ko: '중국', slug: 'china', region: '아시아' },
  { ko: '대만', slug: 'taiwan', region: '아시아' },
  { ko: '홍콩', slug: 'hongkong', region: '아시아' },
  { ko: '태국', slug: 'thailand', region: '아시아' },
  { ko: '필리핀', slug: 'philippines', region: '아시아' },
  { ko: '싱가포르', slug: 'singapore', region: '아시아' },
  { ko: '말레이시아', slug: 'malaysia', region: '아시아' },
  { ko: '인도네시아', slug: 'indonesia', region: '아시아' },
  { ko: '베트남', slug: 'vietnam', region: '아시아' },
  { ko: '캄보디아', slug: 'cambodia', region: '아시아' },
  { ko: '몽골', slug: 'mongolia', region: '아시아' },
  { ko: '인도', slug: 'india', region: '아시아' },
  { ko: '카자흐스탄', slug: 'kazakhstan', region: '아시아' },
  { ko: '우즈베키스탄', slug: 'uzbekistan', region: '아시아' },
  // 유럽
  { ko: '유럽(EU)', slug: 'eu', region: '유럽' },
  { ko: '영국', slug: 'uk', region: '유럽' },
  { ko: '스위스', slug: 'switzerland', region: '유럽' },
  { ko: '아일랜드', slug: 'ireland', region: '유럽' },
  { ko: '우크라이나', slug: 'ukraine', region: '유럽' },
  { ko: '러시아', slug: 'russia', region: '유럽' },
  // 미주
  { ko: '미국', slug: 'usa', region: '미주' },
  { ko: '캐나다', slug: 'canada', region: '미주' },
  { ko: '멕시코', slug: 'mexico', region: '미주' },
  { ko: '브라질', slug: 'brazil', region: '미주' },
  { ko: '아르헨티나', slug: 'argentina', region: '미주' },
  // 오세아니아
  { ko: '호주', slug: 'australia', region: '오세아니아' },
  { ko: '뉴질랜드', slug: 'newzealand', region: '오세아니아' },
  { ko: '괌', slug: 'guam', region: '오세아니아' },
  { ko: '하와이', slug: 'hawaii', region: '오세아니아' },
  // 중동·아프리카
  { ko: '이스라엘', slug: 'israel', region: '중동·아프리카' },
  { ko: '아랍에미리트', slug: 'uae', region: '중동·아프리카' },
  { ko: '튀르키예', slug: 'turkey', region: '중동·아프리카' },
  { ko: '모로코', slug: 'morocco', region: '중동·아프리카' },
]

export const countryGuideSlug = (c: Country) => `${c.slug}-pet-travel-guide`

// ── 글 2개+ 여행지 = 칩 클릭 시 목록 패널. 총정리(docs) 첫 줄 고정, 제목 = 라이브 og:title ──
export const COUNTRY_POSTS: Record<string, PostRef[]> = {
  japan: [
    { title: '일본 입국 준비 총정리', kind: 'docs', slug: 'japan-pet-travel-guide' },
    { title: '강아지 일본 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'japan-pet-import-process' },
    { title: '강아지 동반 일본여행', kind: 'blog', slug: 'dog-travel-to-japan' },
    { title: '강아지·고양이 일본 입국 일정 계산기', kind: 'blog', slug: 'japan-pet-entry-scheduler' },
    { title: '강아지·고양이 일본 입국 준비 일정 확인', kind: 'blog', slug: 'japan-pet-entry-self-check' },
    { title: '반려동물과 함께하는 일본 여행, 더 쉽게!', kind: 'blog', slug: 'rabies-titer-test-japan-korea' },
    { title: '강아지를 데리고 한국과 일본을 여러번 왕복해야 하는 경우', kind: 'blog', slug: 'repeated-dog-travel-korea-japan' },
    { title: '강아지 심장수술을 위한 일본 입국 준비 안내', kind: 'blog', slug: 'japan-entry-for-dog-heart-surgery' },
    { title: '일본 반려동물 수출동물검역', kind: 'blog', slug: 'japan-pet-export-inspection' },
    { title: '일본 수입동물검역 방법, 일본 주요 공항 동물검역소 위치', kind: 'blog', slug: 'japan-pet-import-inspection' },
    { title: '일본 동물검역소 연락처', kind: 'blog', slug: 'japan-pet-quarantine-office' },
  ],
  usa: [
    { title: '미국 입국 준비 총정리', kind: 'docs', slug: 'usa-pet-travel-guide' },
    { title: '2026 강아지 미국여행 완벽 가이드', kind: 'blog', slug: 'dog-travel-to-usa-august-2024-update' },
    { title: '2024년 8월부터 적용되는 새로운 강아지 미국 입국 요건', kind: 'blog', slug: 'dog-travel-to-usa' },
    { title: '고양이 미국 입국 준비 절차, 기간 비용', kind: 'blog', slug: 'cat-travel-to-usa' },
    { title: '강아지 미국 입국 준비절차, 기간, 비용 (2024년 7월까지)', kind: 'blog', slug: 'dog-travel-to-usa-2024-rule' },
  ],
  eu: [
    { title: '유럽(EU) 입국 준비 총정리', kind: 'docs', slug: 'eu-pet-travel-guide' },
    { title: '[2026] 반려동물 유럽 입국, 광견병항체검사 기관 변경 안내', kind: 'blog', slug: 'eu-pet-rabies-test' },
    { title: '강아지 프랑스 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'dog-travel-to-france' },
  ],
  thailand: [
    { title: '태국 입국 준비 총정리', kind: 'docs', slug: 'thailand-pet-travel-guide' },
    { title: '강아지 태국 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'dog-travel-to-thailand' },
  ],
  philippines: [
    { title: '필리핀 입국 준비 총정리', kind: 'docs', slug: 'philippines-pet-travel-guide' },
    { title: '강아지 필리핀 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'dog-travel-to-philippines' },
  ],
  china: [
    { title: '중국 입국 준비 총정리', kind: 'docs', slug: 'china-pet-travel-guide' },
    { title: '강아지 중국 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'dog-travel-to-china' },
  ],
  hawaii: [
    { title: '하와이 입국 준비 총정리', kind: 'docs', slug: 'hawaii-pet-travel-guide' },
    { title: '강아지 하와이 입국 준비절차, 기간, 비용', kind: 'blog', slug: 'dog-travel-to-hawaii' },
  ],
  australia: [
    { title: '호주 입국 준비 총정리', kind: 'docs', slug: 'australia-pet-travel-guide' },
    { title: '고양이 호주 입국 준비 총정리', kind: 'blog', slug: 'australia-cat-travel-guide' },
  ],
  singapore: [
    { title: '싱가포르 입국 준비 총정리', kind: 'docs', slug: 'singapore-pet-travel-guide' },
    { title: '2024년 7월부터 달라진 싱가포르 반려동물 입국 규정', kind: 'blog', slug: 'singapore-pet-import-rule-change' },
  ],
  uk: [
    { title: '영국 입국 준비 총정리', kind: 'docs', slug: 'uk-pet-travel-guide' },
    { title: '반려동물과 프랑스를 경유하여 영국으로 가는 방법', kind: 'blog', slug: 'travel-to-uk-with-pet-via-france' },
  ],
}

// ── 주제별 가이드 — 3그룹, 여행지별과 같은 칩→패널 문법 ──
export const OTHER_GROUPS: Array<{ label: string; items: PostRef[] }> = [
  {
    label: '검역',
    items: [
      { title: '강아지, 고양이 동물검역', kind: 'blog', slug: 'pet-quarantine-guide' },
      { title: '수출동물검역', kind: 'docs', slug: 'pet-export-inspection' },
      { title: '동물검역소 위치', kind: 'docs', slug: 'pet-quarantine-station' },
      { title: '수출동물검역 예약', kind: 'docs', slug: 'pet-quarantine-reservation' },
    ],
  },
  {
    label: '항공·운송',
    items: [
      { title: '반려동물 비행기 탑승 준비', kind: 'docs', slug: 'dog-flight-preparation' },
      { title: '반려동물 기내반입 기준', kind: 'docs', slug: 'airline-pet-cabin-policy' },
      { title: '반려동물 운송요금', kind: 'docs', slug: 'airline-pet-cabin-fees' },
      { title: '반려동물 비행기 스트레스의 원인과 예방', kind: 'blog', slug: 'dog-flight-medication' },
    ],
  },
  {
    label: '기타',
    items: [
      { title: '해외 광견병 비발생국가/지역', kind: 'blog', slug: 'rabies-free-countries' },
      { title: '반려동물 마이크로칩 삽입, 안전할까?', kind: 'blog', slug: 'pet-microchip-safety' },
      { title: '강아지 동반 해외여행 방법', kind: 'blog', slug: 'dog-international-travel' },
      { title: '반려동물을 한국으로 데리고 오는 방법', kind: 'blog', slug: 'bring-dog-to-korea' },
    ],
  },
]

// ── 검색 인덱스(가이드 허브) — 전체 69글: 제목·태그(여행지/그룹)·경로 ──
export interface SearchEntry {
  t: string // 표시 제목
  g: string // 태그 (여행지명 또는 주제 그룹)
  u: string // 경로
}

export function buildSearchIndex(): SearchEntry[] {
  const idx: SearchEntry[] = []
  const seen = new Set<string>()
  for (const c of COUNTRIES) {
    const posts = COUNTRY_POSTS[c.slug] ?? [
      { title: `${c.ko} 입국 준비 총정리`, kind: 'docs' as const, slug: countryGuideSlug(c) },
    ]
    for (const p of posts) {
      if (seen.has(p.slug)) continue
      seen.add(p.slug)
      idx.push({ t: p.title, g: c.ko, u: postPath(p) })
    }
  }
  for (const grp of OTHER_GROUPS) {
    for (const p of grp.items) {
      if (seen.has(p.slug)) continue
      seen.add(p.slug)
      idx.push({ t: p.title, g: grp.label, u: postPath(p) })
    }
  }
  return idx
}

// ── 랜딩 데이터 ──
export const APP_FEATURES = [
  { icon: 'ti-route', title: '단계별 가이드', desc: '언제 무엇을 해야 할지 알려드려요' },
  { icon: 'ti-shield-check', title: '실수 예방', desc: '입력 정보가 규정에 맞지 않으면 알려드려요' },
  { icon: 'ti-bell', title: '일정 알림', desc: '예정일·만료일·마감일을 놓치지 않게 알려드려요' },
  { icon: 'ti-clipboard-check', title: '서류 체크리스트', desc: '준비할 서류를 한눈에 보고 관리할 수 있어요' },
  { icon: 'ti-folder', title: '보관함', desc: '백신 라벨·수첩·각종 서류 사본을 보관할 수 있어요' },
]

export const SERVICE_CARDS = [
  { icon: 'ti-heart-plus', title: '로잔동물의료센터', desc: '수의사가 직접 준비해 믿고 맡길 수 있어요' },
  { icon: 'ti-device-mobile', title: '펫무브 앱 연동', desc: '앱으로 진행 상황을 쉽게 확인할 수 있어요' },
  { icon: 'ti-adjustments-horizontal', title: '전체 대행 · 부분 의뢰', desc: '전 과정을 맡기거나, 필요한 단계만 도움받을 수 있어요' },
]

// 앱 지원 여행지(랜딩) — 접힘 5 + 더보기, 펼침 = 아시아 6 + 유럽 30 (총 36개국, 앱 화이트리스트와 동일).
// 유럽 30 = EU 회원국 + 영국·노르웨이·스위스(비EU). 웹 방문자에겐 'EU 묶음/개별 카드국' 구분이
// 무의미해 유럽 한 그룹으로 묶고 가나다순 정렬(2026-07-17: 영국·핀란드·아일랜드·몰타·노르웨이·스위스 추가,
// 2026-07-18: 대만 추가, 2026-07-19: 베트남 추가).
//
// 동기화 확인법: domain DESTINATION_OVERRIDES 의 appSupported 목록과 대조한다. 단 EU 24개국은
// domain 에서 '유럽연합' 한 묶음이고 여기선 개별 국가로 펼치므로, 아시아 목록만 1:1 대응한다.
export const APP_DEST_PREVIEW = ['일본', '태국', '필리핀', '프랑스', '독일']
export const APP_DEST_ASIA = ['일본', '중국', '대만', '베트남', '태국', '필리핀']
export const APP_DEST_EU = [
  '그리스', '네덜란드', '노르웨이', '덴마크', '독일', '라트비아', '루마니아', '룩셈부르크',
  '리투아니아', '몰타', '벨기에', '불가리아', '스웨덴', '스위스', '스페인', '슬로바키아',
  '슬로베니아', '아일랜드', '에스토니아', '영국', '오스트리아', '이탈리아', '체코', '크로아티아',
  '키프로스', '포르투갈', '폴란드', '프랑스', '핀란드', '헝가리',
]
export const APP_DEST_SOON = ['하와이', '싱가포르', '미국', '캐나다', '인도네시아', '말레이시아', '호주', '뉴질랜드']

export const REVIEWS = [
  {
    initial: '모',
    name: '최○지님',
    meta: '모짜·렐라 · 일본',
    text: '안녕하세요. 모짜와 렐라 보호자입니다. 이사하고 이것저것 준비할 게 많아서 인사가 늦었네요. 원장님 덕분에 애들 무사히 일본에 도착했습니다. 여러 가지로 신경 써주셔서 정말 정말 감사합니다!',
  },
  {
    initial: '보',
    name: '김○수님',
    meta: '보리 · 태국',
    text: '원장님 안녕하세요! 방콕으로 이주하면서 보리 입국 서류 때문에 막막했는데, 원장님 덕분에 무사히 잘 도착했습니다. 수입허가서 발급이랑 접종 스케줄 짜는 건 저 혼자선 도저히 엄두가 안났었는데, 덕분에 마음이 든든했습니다. 진심으로 감사드려요!',
  },
  {
    initial: '루',
    name: '최○진님',
    meta: '루나 · 필리핀',
    text: '원장님 안녕하세요~ 루나 데리고 세부에 입국해서 짐 정리하다가 이제야 인사 드려요. 루나가 워낙 예민한 고양이라 병원 갈 때부터 걱정이 많았는데, 검진 조심스럽게 잘 해주시고 안심시켜 주셔서 너무 감사했어요. 광견병이랑 예방접종 증명서를 깐깐하게 본다고 들었는데, 챙겨주신 서류 그대로 검역소에 내니까 질문 하나 없이 패스였어요! 감사해요!',
  },
]

// 연락처 (확정값 — HANDOFF 2026-07-04)
export const CONTACT = {
  kakao: 'https://pf.kakao.com/_zDDxhj/chat',
  naverBooking: 'https://naver.me/GUwSYQ9h',
  tel: '02-872-7588',
  email: 'petmove@naver.com',
  hours: '평일 10:00–18:00 · 주말·공휴일 휴진',
}
