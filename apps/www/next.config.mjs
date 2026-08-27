// ── 구 Ghost 시절 옛 슬러그 → 현행 슬러그 301 매핑 ──────────────────────
// 출처: 서치콘솔 404 보고서 58건 전수 대조 (2026-07-28).
// 고스트 안에서 글 주소를 바꿨을 때 죽은 옛 주소들 — 외부 링크·검색 유입 회수용.
// 새 항목은 아래 표에만 추가 (source 는 슬러그만, 프리픽스는 조립 시 붙음).

// /docs/<옛슬러그>/ → /docs/<새슬러그>/
const DOCS_RENAMES = {
  // 나라 가이드: 옛 짧은 슬러그 → *-pet-travel-guide
  japan: 'japan-pet-travel-guide',
  usa: 'usa-pet-travel-guide',
  eu: 'eu-pet-travel-guide',
  uk: 'uk-pet-travel-guide',
  hawaii: 'hawaii-pet-travel-guide',
  guam: 'guam-pet-travel-guide',
  switzerland: 'switzerland-pet-travel-guide',
  australia: 'australia-pet-travel-guide',
  newzealand: 'newzealand-pet-travel-guide',
  uae: 'uae-pet-travel-guide',
  ph: 'philippines-pet-travel-guide',
  hk: 'hongkong-pet-travel-guide',
  thai: 'thailand-pet-travel-guide',
  singapore: 'singapore-pet-travel-guide',
  indonesia: 'indonesia-pet-travel-guide',
  malaysia: 'malaysia-pet-travel-guide',
  india: 'india-pet-travel-guide',
  china: 'china-pet-travel-guide',
  taiwan: 'taiwan-pet-travel-guide',
  vietnam: 'vietnam-pet-travel-guide',
  cambodia: 'cambodia-pet-travel-guide',
  mongolia: 'mongolia-pet-travel-guide',
  kazakhstan: 'kazakhstan-pet-travel-guide',
  russia: 'russia-pet-travel-guide',
  canada: 'canada-pet-travel-guide',
  brazil: 'brazil-pet-travel-guide',
  morocco: 'morocco-pet-travel-guide',
  'teoki-twireukiye': 'turkey-pet-travel-guide',
  'travel-with-pets-to-uzbekistan': 'uzbekistan-pet-travel-guide',
  // 일반 문서
  'gangaji-bihaenggi-tabseung-junbi': 'dog-flight-preparation',
  'hanggongsabyeol-banryeodongmul-ginae-tabseung-biyong': 'airline-pet-cabin-fees',
  'dongmulgeomyeogso-bangmun-yeyag': 'pet-quarantine-reservation',
  aqsreservation: 'pet-quarantine-reservation',
  suculdongmulgeomyeog: 'pet-export-inspection',
  // 2026-08-05 내부 링크 전수조사에서 발견된 죽은 옛 슬러그
  // 기내반입 기준 글은 운송요금 글로 병합(2026-08-27) — 옛 주소를 policy 로 보내면
  //   리디렉트를 두 번 타므로 최종 목적지로 바로 보낸다.
  'hanggongsabyeol-gangaji-goyangi-ginaebanib-heoyonggijun': 'airline-pet-cabin-fees',
}

// /blog/<옛슬러그>/ → /blog/<새슬러그>/
const BLOG_RENAMES = {
  'gangaji-peurangseu-ibgug-junbijeolca-gigan-biyong': 'dog-travel-to-france',
  'gangaji-simjangsusuleul-wihan-ilbon-ibgug-junbi-annae': 'japan-entry-for-dog-heart-surgery',
  'gangaji-migug-ibgug-junbijeolca-gigan-biyong': 'dog-travel-to-usa-2024-rule',
  'gangaji-migug-ibgug-gyujeong-byeongyeong-ganghwa-annae': 'dog-travel-to-usa',
  'gangaji-migug-ibgug-junbijeolca-gigan-biyong-eobdeiteu-2024nyeon-8weolbuteo-jeogyong':
    'dog-travel-to-usa-august-2024-update',
  'gangaji-dongban-ilbonyeohaeng-a-to-z': 'dog-travel-to-japan',
  'gangaji-goyangi-ilbon-geomyeog-junbi-jeolca': 'japan-pet-import-process',
  'haeoe-gwanggyeonbyeong-bibalsaenggugga-riseuteu': 'rabies-free-countries',
  'gangaji-bihaenggi-tabseung-ddae-yageul-meogyeodo-doelgga': 'dog-flight-medication',
  'gangaji-taegug-ibgug-junbijeolca-gigan-biyong': 'dog-travel-to-thailand',
  'gangaji-taegug-ibgug-junbijeolca-gigan-biyong-2': 'dog-travel-to-thailand',
  'gangaji-hawai-ibgug-junbijeolca-gigan-biyong': 'dog-travel-to-hawaii',
  'gangaji-hawai-ibgug-junbijeolca-gigan-biyong-2': 'dog-travel-to-hawaii',
  'gangaji-haeoeyeohaeng': 'dog-international-travel',
  'banryeodongmulgwa-peurangseureul-gyeongyuhayeo-yeonggugeuro-ganeun-bangbeob':
    'travel-to-uk-with-pet-via-france',
  'goyangi-migug-ibgug-jeolca': 'cat-travel-to-usa',
  'haeoeeseo-gangajireul-hangugeuro-derigo-oneun-bangbeob': 'bring-dog-to-korea',
  // 2026-08-05 내부 링크 전수조사에서 발견된 죽은 옛 슬러그
  animalinspecton: 'pet-quarantine-guide',
  jnaqs: 'japan-pet-quarantine-office',
}

// 프리픽스 없는 루트 옛 주소 / 대응 글이 없어 허브·홈으로 보내는 것들
const EXTRA_REDIRECTS = [
  // 글 병합 — 기내반입 기준을 운송요금 글로 합쳤다(2026-08-27). 같은 7개 항공사 표를
  //   둘로 나눠 갖고 있어 검색어가 흩어졌다. 자리가 더 좋은 쪽(요금: 클릭 23·CTR 4.1%)으로
  //   합치고 기준 글(클릭 2·CTR 0.7%)을 넘긴다. ⛔ 이 리디렉트를 지우면 그동안 쌓인
  //   외부 링크와 검색 순위가 끊긴다.
  { source: '/docs/airline-pet-cabin-policy', destination: '/docs/airline-pet-cabin-fees/' },
  // 고스트 초기(루트 슬러그) 시절 주소
  { source: '/dongmulgeomyeogso-wicireul-alryeojuseyo', destination: '/docs/pet-quarantine-station/' },
  { source: '/gangaji-simjangsusuleul-wihan-ilbon-ibgug-junbi-annae', destination: '/blog/japan-entry-for-dog-heart-surgery/' },
  // 대응 글이 없는 것들 → 가이드 허브
  { source: '/docs/costa-rica', destination: '/guide/' }, // 코스타리카 글은 이관하지 않음
  { source: '/docs/rss', destination: '/guide/' },
  // 고스트 태그 페이지 전부 — :path* 가 끝 슬래시까지 흡수하므로 {/}? 불필요
  { source: '/tag/:path*', destination: '/guide/', wildcard: true },
  // 고스트 테마 잔재 페이지 → 홈 (서치콘솔 '리디렉션 오류' 1건이 이 주소)
  { source: '/changelog', destination: '/' },
  // 2026-08-05 내부 링크 전수조사 — 루트형 옛 주소 (구 글 본문에서 참조되던 형태)
  { source: '/gangaji-migug-ibgug-gyujeong-byeongyeong-ganghwa-annae', destination: '/blog/dog-travel-to-usa/' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 검증용 dev 서버를 본 서버와 다른 빌드 폴더로 띄우기 위한 우회 (portal 과 같은 패턴).
  // 평소엔 미설정 → 기본 .next 그대로.
  distDir: process.env.PM_DIST_DIR || '.next',
  // 구 Ghost URL 이 전부 `/` 로 끝남 — 슬러그 보존의 핵심. /docs/japan-pet-travel-guide/ 형태 유지.
  trailingSlash: true,
  async redirects() {
    const entry = (source, destination, wildcard = false) => ({
      // `{/}?` = 끝 슬래시 유무 모두 매칭 (trailingSlash 정규화보다 먼저 걸려도 안전)
      source: wildcard ? source : `${source}{/}?`,
      destination,
      permanent: true,
    })
    return [
      ...Object.entries(DOCS_RENAMES).map(([o, n]) => entry(`/docs/${o}`, `/docs/${n}/`)),
      ...Object.entries(BLOG_RENAMES).map(([o, n]) => entry(`/blog/${o}`, `/blog/${n}/`)),
      ...EXTRA_REDIRECTS.map(({ source, destination, wildcard }) => entry(source, destination, wildcard)),
    ]
  },
}

export default nextConfig
