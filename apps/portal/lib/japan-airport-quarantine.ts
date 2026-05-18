/**
 * 일본 주요 공항 동물검역소 위치 — '일본 수입 동물검역' step 에서 진입하는 내부 leaf 페이지 데이터.
 *
 * 안내도 이미지는 각 공항·동물검역소 공식 PDF 를 PNG 로 변환해
 * /public/guide/japan-airport-quarantine/ 에 보관.
 * width/height 는 원본 픽셀 크기 — 로딩 중 레이아웃 시프트 방지용 aspect-ratio 계산에 사용.
 */

export interface AirportMap {
  /** 안내도 캡션 — 터미널·윙 구분. */
  label: string
  /** /public 기준 이미지 경로. */
  src: string
  /** 원본 픽셀 너비. */
  width: number
  /** 원본 픽셀 높이. */
  height: number
}

export interface JapanAirport {
  /** 공항 한국어명. */
  name: string
  /** 영문명 · IATA 코드. */
  nameSub: string
  /** 동물검역소(공항지소) 문의 전화 — 공식 안내도에 기재된 경우만. */
  phone?: string
  /** 검역 카운터 위치 안내도 — 터미널·윙별. */
  maps: AirportMap[]
}

const DIR = '/guide/japan-airport-quarantine'

export const JAPAN_AIRPORTS: JapanAirport[] = [
  {
    name: '나리타 국제공항',
    nameSub: 'Narita International Airport · NRT',
    phone: '+81-476-34-2342',
    maps: [
      {
        label: '제1터미널 — 남쪽 윙 (South Wing)',
        src: `${DIR}/narita-t1-south.png`,
        width: 2496,
        height: 1404,
      },
      {
        label: '제1터미널 — 북쪽 윙 (North Wing)',
        src: `${DIR}/narita-t1-north.png`,
        width: 2496,
        height: 1404,
      },
      {
        label: '제2터미널 (Terminal 2)',
        src: `${DIR}/narita-t2.png`,
        width: 2189,
        height: 1548,
      },
    ],
  },
  {
    name: '하네다 공항',
    nameSub: 'Tokyo Haneda Airport · HND',
    maps: [
      {
        label: '제2 · 제3터미널 (Terminal 2 · 3)',
        src: `${DIR}/haneda.png`,
        width: 1548,
        height: 2189,
      },
    ],
  },
  {
    name: '간사이 국제공항',
    nameSub: 'Kansai International Airport · KIX',
    phone: '+81-72-455-1956',
    maps: [
      {
        label: '제1터미널 (Terminal 1)',
        src: `${DIR}/kansai-t1.png`,
        width: 2496,
        height: 1404,
      },
      {
        label: '제2터미널 (Terminal 2)',
        src: `${DIR}/kansai-t2.png`,
        width: 2496,
        height: 1404,
      },
      {
        label: '동물검역소 사무소 — 공항역에서 가는 길',
        src: `${DIR}/kansai-office-access.png`,
        width: 1548,
        height: 2189,
      },
    ],
  },
  {
    name: '주부 국제공항',
    nameSub: 'Chubu Centrair International Airport · NGO',
    phone: '+81-569-38-8577',
    maps: [
      {
        label: '제1터미널 (Terminal 1)',
        src: `${DIR}/chubu.png`,
        width: 1548,
        height: 2189,
      },
    ],
  },
  {
    name: '나하 공항',
    nameSub: 'Naha Airport · OKA',
    maps: [
      {
        label: '1층 (1F) 검역 카운터',
        src: `${DIR}/naha.png`,
        width: 2496,
        height: 1404,
      },
    ],
  },
]
