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

// ── 나라별 가이드 62개국 — 5그룹(2026-07-15 재편: 괌=오세아니아, 중동·아프리카 신설.
//    2026-07-26 남아프리카공화국 가이드 추가 — 앱 지원 목록(APP_DEST_*)엔 아직 없다.
//    2026-07-31~08-01 노르웨이·핀란드·키프로스·몰타 가이드 신설 — 넷 다 앱은 이미
//    지원 중이라 APP_DEST_EU 엔 이미 있다.
//    2026-08-01 프랑스·독일·스페인·이탈리아·네덜란드 가이드 신설 — 표준 EU 국가
//    개별 가이드(허브-스포크). 고유 축 = 견종·품종 규제 + 귀국 항체 필요/면제 대비.
//    서치콘솔 도메인 속성에서 나라 이름 검색 노출을 관찰해 추가 확장 판단 ──
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
  { ko: '유럽', slug: 'eu', region: '유럽' },
  { ko: '프랑스', slug: 'france', region: '유럽' },
  { ko: '독일', slug: 'germany', region: '유럽' },
  { ko: '스페인', slug: 'spain', region: '유럽' },
  { ko: '이탈리아', slug: 'italy', region: '유럽' },
  { ko: '네덜란드', slug: 'netherlands', region: '유럽' },
  { ko: '영국', slug: 'uk', region: '유럽' },
  { ko: '스위스', slug: 'switzerland', region: '유럽' },
  { ko: '아일랜드', slug: 'ireland', region: '유럽' },
  { ko: '노르웨이', slug: 'norway', region: '유럽' },
  { ko: '핀란드', slug: 'finland', region: '유럽' },
  { ko: '몰타', slug: 'malta', region: '유럽' },
  { ko: '키프로스', slug: 'cyprus', region: '유럽' },
  { ko: '우크라이나', slug: 'ukraine', region: '유럽' },
  { ko: '오스트리아', slug: 'austria', region: '유럽' },
  { ko: '체코', slug: 'czech', region: '유럽' },
  { ko: '포르투갈', slug: 'portugal', region: '유럽' },
  { ko: '폴란드', slug: 'poland', region: '유럽' },
  { ko: '크로아티아', slug: 'croatia', region: '유럽' },
  { ko: '헝가리', slug: 'hungary', region: '유럽' },
  { ko: '벨기에', slug: 'belgium', region: '유럽' },
  { ko: '덴마크', slug: 'denmark', region: '유럽' },
  { ko: '그리스', slug: 'greece', region: '유럽' },
  { ko: '스웨덴', slug: 'sweden', region: '유럽' },
  { ko: '룩셈부르크', slug: 'luxembourg', region: '유럽' },
  { ko: '루마니아', slug: 'romania', region: '유럽' },
  { ko: '리투아니아', slug: 'lithuania', region: '유럽' },
  { ko: '라트비아', slug: 'latvia', region: '유럽' },
  { ko: '에스토니아', slug: 'estonia', region: '유럽' },
  { ko: '슬로바키아', slug: 'slovakia', region: '유럽' },
  { ko: '슬로베니아', slug: 'slovenia', region: '유럽' },
  { ko: '불가리아', slug: 'bulgaria', region: '유럽' },
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
  { ko: '남아프리카공화국', slug: 'southafrica', region: '중동·아프리카' },
]

export const countryGuideSlug = (c: Country) => `${c.slug}-pet-travel-guide`

// ── 글 2개+ 여행지 = 칩 클릭 시 목록 패널. 총정리(docs) 첫 줄 고정, 제목 = 라이브 og:title ──
// ⚠️ 총정리 1개뿐인 나라는 여기 넣지 말 것 — 명단에 없으면 칩이 총정리로 바로 이동한다
//    (2026-07-31: 글 1개인 5개국이 잘못 들어가 '펼침→한 줄' 이중 클릭이 생겨 제거).
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
    { title: '유럽 입국 준비 총정리', kind: 'docs', slug: 'eu-pet-travel-guide' },
    { title: '[2026] 반려동물 유럽 입국, 광견병항체검사 기관 변경 안내', kind: 'blog', slug: 'eu-pet-rabies-test' },
  ],
  // 프랑스 글은 EU 패널에서 이동(2026-08-01 프랑스 칩 신설과 함께).
  france: [
    { title: '프랑스 입국 준비 총정리', kind: 'docs', slug: 'france-pet-travel-guide' },
    { title: '강아지 프랑스 입국 준비기간·비용·왕복 유효기간', kind: 'blog', slug: 'dog-travel-to-france' },
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
      { title: '강아지·고양이 비행기 탑승 준비', kind: 'docs', slug: 'dog-flight-preparation' },
      { title: '반려동물 운송요금·기내반입 기준', kind: 'docs', slug: 'airline-pet-cabin-fees' },
      { title: '반려동물 비행기 스트레스의 원인과 예방', kind: 'blog', slug: 'dog-flight-medication' },
      // 콘텐츠 JSON 이 아니라 React 페이지(app/docs/pet-transport-quote) — 경로 규칙은 같아
      // postPath 가 그대로 /docs/pet-transport-quote/ 를 만든다.
      { title: '반려동물 항공 운송업체 문의', kind: 'docs', slug: 'pet-transport-quote' },
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

// 앱 지원 여행지(랜딩) — 접힘 5 + 더보기, 펼침 = 아시아 13 + 유럽 30 + 아메리카 6 + 기타 6 (총 55개국,
// 앱 화이트리스트와 동일). 2026-07-22: 말레이시아·인도네시아(태국 복제)·아르헨티나(베트남 복제)
// ·러시아·튀르키예(카자흐스탄 복제) 추가.
// 유럽 30 = EU 회원국 + 영국·노르웨이·스위스(비EU). 웹 방문자에겐 'EU 묶음/개별 카드국' 구분이
// 무의미해 유럽 한 그룹으로 묶고 가나다순 정렬(2026-07-17: 영국·핀란드·아일랜드·몰타·노르웨이·스위스 추가,
// 2026-07-18: 대만 추가, 2026-07-19: 베트남 추가,
// 2026-07-20: 캄보디아·몽골·우즈베키스탄 추가 + 캐나다 승격 → 아메리카 그룹 신설,
// 2026-07-25: 싱가포르·하와이 승격(SOON→지원) + 아랍에미리트·이스라엘 추가(appSupported 인데 누락돼 있었음)).
//
// 동기화 확인법: domain DESTINATION_OVERRIDES 의 appSupported 목록과 대조한다. 단 EU 24개국은
// domain 에서 '유럽연합' 한 묶음이고 여기선 개별 국가로 펼치므로, 아시아·아메리카만 1:1 대응한다.
// 2026-07-26 기준 domain appSupported 34건 = 아시아 14(japan·china·taiwan·vietnam·thailand·
//   philippines·cambodia·mongolia·uzbekistan·kazakhstan·malaysia·indonesia·singapore·hongkong)
//   + 유럽 8키(eu·uk·ireland·malta·norway·finland·cyprus·switzerland → 개별 펼침 30)
//   + 아메리카 6(canada·mexico·brazil·argentina·hawaii·usa) + 기타 6(morocco·ukraine·russia·turkey·uae·israel).
// 접힘 상태 미리보기 (2026-08-04 사용자 지정 9개국).
//   · 데스크톱(6열) = PREVIEW 6개로 한 줄이 딱 맞는다.
//   · 모바일(3열)   = PREVIEW + EXTRA 9개로 3×3 이 딱 맞는다.
// EXTRA 는 .dest-m 클래스가 붙어 760px 이상에서 숨는다(landing.css) — 데스크톱 구성은 그대로.
// ⚠️ '더보기'는 격자 밖 링크다(dest-grid.tsx). 격자에 넣으면 9+1=10칸이 되어 모바일 넷째 줄에
//    '더보기'만 혼자 남는다. 개수를 바꿀 땐 PREVIEW 6 / 합계 9 를 유지할 것.
export const APP_DEST_PREVIEW = ['일본', '태국', '필리핀', '프랑스', '중국', '하와이']
export const APP_DEST_PREVIEW_EXTRA = ['대만', '싱가포르', '호주']
// 가나다순. 우즈베키스탄·몽골은 중앙아시아·동아시아라 아시아 그룹에 둔다.
// 2026-07-22 말레이시아·인도네시아 추가(태국 복제 — APP_DEST_SOON 에서 승격).
// 2026-07-26 홍콩 추가(필리핀 골격 — AFCD Group II).
export const APP_DEST_ASIA = [
  '대만', '말레이시아', '몽골', '베트남', '싱가포르', '우즈베키스탄', '인도네시아', '일본',
  '중국', '카자흐스탄', '캄보디아', '태국', '필리핀', '홍콩',
]
// 유럽·중동·아프리카 중 EU 밖 — 2026-07-20 모로코·우크라이나 추가.
// ⚠️ 우크라이나는 영공 폐쇄로 직항이 없다(EU 경유 육로). 여정 카드가 그 사실을 안내한다.
// 2026-07-22 러시아·튀르키예 추가(카자흐스탄 복제). 유라시아 걸침 국가라 아시아가 아니라
// 여기(EU 밖 유럽·중동)로 둔다 — 우크라이나와 같은 분류. 가나다순.
// 2026-07-25 아랍에미리트·이스라엘 추가 — 둘 다 appSupported 인데 랜딩에서 누락돼 있었다(중동 분류).
export const APP_DEST_OTHER = ['러시아', '모로코', '아랍에미리트', '우크라이나', '이스라엘', '튀르키예']
export const APP_DEST_EU = [
  '그리스', '네덜란드', '노르웨이', '덴마크', '독일', '라트비아', '루마니아', '룩셈부르크',
  '리투아니아', '몰타', '벨기에', '불가리아', '스웨덴', '스위스', '스페인', '슬로바키아',
  '슬로베니아', '아일랜드', '에스토니아', '영국', '오스트리아', '이탈리아', '체코', '크로아티아',
  '키프로스', '포르투갈', '폴란드', '프랑스', '핀란드', '헝가리',
]
// 아메리카 — 2026-07-20 캐나다 지원 시작(APP_DEST_SOON 에서 승격) + 멕시코·브라질 추가.
// 2026-07-22 아르헨티나 추가(베트남 복제). 2026-07-25 하와이 승격(SOON→지원, 미국 본토와 별개
// 카드 — 하와이는 자체 검역 체계 HDOA). 가나다순.
// 2026-07-26 **미국 본토 승격**(SOON→지원) — domain 은 2026-07-25 부터 appSupported: true 인데
//   랜딩만 '곧 지원'에 남아 있어 앱에서 고를 수 있는 나라를 미지원으로 안내하고 있었다.
export const APP_DEST_AMERICA = ['멕시코', '미국', '브라질', '아르헨티나', '캐나다', '하와이']
// 오세아니아 — 2026-07-27 호주·뉴질랜드 승격(SOON→지원)으로 신설. 둘 다 domain 이
// appSupported: true 라 앱에서 고를 수 있는데, 랜딩만 '곧 지원'에 남으면 지원하는 나라를
// 미지원으로 안내하게 된다(미국·캐나다에서 반복된 어긋남). 가나다순.
export const APP_DEST_OCEANIA = ['뉴질랜드', '호주']
// '곧 지원' — 위 목록에 든 나라를 여기 남기면 같은 나라가 두 번 나온다. 캐나다는 뺐다.
// 2026-07-25 싱가포르·하와이 승격으로 제거. 2026-07-26 미국 승격으로 제거.
// 2026-07-27 호주·뉴질랜드 승격으로 **비었다** — 비면 랜딩의 '2026년 추가 예정' 블록 자체가
// 렌더되지 않는다(page.tsx). 다음 예정 국가가 생기면 여기에 넣으면 블록이 다시 나온다.
export const APP_DEST_SOON: string[] = []

/**
 * 상단 지표 '지원 여행지' 숫자 — 위 네 그룹에서 **자동 계산**한다(2026-07-26).
 *
 * 예전엔 '50+' 로 손으로 적어 둬서, 목적지를 올려도 지표가 안 따라왔다(싱가포르·하와이·
 * 미국 승격 때 매번 어긋남). 목록이 곧 진실이므로 길이를 그대로 쓴다 — 나라를 추가하면
 * 지표가 저절로 오른다. 반올림('50+')이 아니라 실제 값이라 '+' 를 붙이지 않는다.
 */
export const APP_DEST_TOTAL =
  APP_DEST_ASIA.length +
  APP_DEST_EU.length +
  APP_DEST_AMERICA.length +
  APP_DEST_OCEANIA.length +
  APP_DEST_OTHER.length

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
