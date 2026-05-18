/**
 * 농림축산검역본부 전국 동물검역소 — '한국 수출 동물검역' step 의 위치 안내 페이지 데이터.
 *
 * featured: 출국 검역에 자주 쓰이는 공항·서울 본부 — 페이지 상단 '주요' 섹션에 함께 노출.
 */

export interface QuarantineStation {
  /** 부서명 — 예: '인천공항 제1여객터미널'. */
  office: string
  /** 전화번호 (표시용 원문 — '~'·',' 로 여러 번호 포함 가능). */
  phone: string
  address: string
  /** true 면 페이지 상단 '주요 동물검역소' 섹션에도 노출. */
  featured?: boolean
}

export interface QuarantineRegion {
  /** 지역본부. */
  hq: string
  stations: QuarantineStation[]
}

export const QUARANTINE_REGIONS: QuarantineRegion[] = [
  {
    hq: '인천공항지역본부',
    stations: [
      {
        office: '화물검역과',
        phone: '032-740-2680, 2668',
        address: '인천 중구 공항로 424번길 47 정부합동청사 2층 230호',
      },
      {
        office: '인천공항 제1여객터미널',
        phone: '032-740-2660~2',
        address: '인천 중구 공항로 272 인천국제공항 제1여객터미널 3037호',
        featured: true,
      },
      {
        office: '인천공항 제2여객터미널',
        phone: '032-740-2028',
        address: '인천 중구 제2여객터미널대로 446 인천국제공항 제2여객터미널 2F-0750호',
        featured: true,
      },
    ],
  },
  {
    hq: '영남지역본부',
    stations: [
      {
        office: '축산물 위생검역과',
        phone: '051-600-0424',
        address: '부산 중구 충장대로 6 한진중공업 R&D 센터 2층',
      },
      {
        office: '김해공항사무소',
        phone: '051-971-1925',
        address: '부산 강서구 공항진입로 108 김해공항국제선 1층',
      },
      {
        office: '부산신항사무소',
        phone: '051-606-5207',
        address: '부산 강서구 신항남로 330 (PNIT 2층)',
      },
      {
        office: '신선대사무소',
        phone: '051-626-6744',
        address: '부산 남구 신선로 294 대한통운컨테이너터미널 본관',
      },
      {
        office: '대구공항사무소',
        phone: '053-982-5096',
        address: '대구 공항로 221 (지저동 400-1) 1층 CU편의점 옆',
      },
      {
        office: '창원사무소',
        phone: '055-987-5410',
        address: '경남 창원시 마산합포구 제2부두로 10 정부경남지방합동청사 6층',
      },
    ],
  },
  {
    hq: '중부지역본부',
    stations: [
      {
        office: '축산물 위생검역과',
        phone: '032-722-8237',
        address: '인천 남구 주안로 129 (주안역 1번 출구)',
      },
      {
        office: '평택사무소',
        phone: '031-684-6397~9',
        address: '경기 평택시 포승읍 평택항만길 73 평택항마린센터 4층',
      },
      {
        office: '청주사무소',
        phone: '043-263-4218',
        address: '충북 청주시 흥덕구 신율로 136',
      },
      {
        office: '천안사무소',
        phone: '041-522-4570',
        address: '충남 천안시 동남구 태조산길 51',
      },
    ],
  },
  {
    hq: '서울지역본부',
    stations: [
      {
        office: '축산물 위생검역과',
        phone: '02-2650-0617',
        address: '서울 강서구 등촌로 39가길 46',
        featured: true,
      },
      {
        office: '김포공항사무소',
        phone: '02-2664-2601',
        address: '서울 강서구 하늘길 38 김포공항 국제선청사 171 (1층 우리은행 옆 통로)',
        featured: true,
      },
      {
        office: '용인사무소',
        phone: '031-327-0114',
        address: '경기 용인시 처인구 포곡읍 전대로 16번길 44 (에버랜드역 1번 출구)',
      },
      {
        office: '속초사무소',
        phone: '033-635-9125',
        address: '강원 속초시 설악금강대교로 136-58 3층',
      },
    ],
  },
  {
    hq: '호남지역본부',
    stations: [
      {
        office: '축산물 위생검역과',
        phone: '063-460-9430',
        address: '전북 군산시 미장8길 7',
      },
      {
        office: '광양사무소',
        phone: '061-798-4900',
        address: '전남 광양시 항만8로 18-42 광양항동측물류지원센터 1·3층',
      },
      {
        office: '광주사무소',
        phone: '062-975-6070',
        address: '광주 북구 첨단과기로 208번길 43 광주정부지방합동청사',
      },
      {
        office: '전주사무소',
        phone: '063-247-9960',
        address: '전북 전주시 덕진구 동부대로 740',
      },
    ],
  },
  {
    hq: '제주지역본부',
    stations: [
      {
        office: '축산물 위생검역과',
        phone: '064-728-5350',
        address: '제주시 청사로 59 정부제주지방합동청사 4층',
      },
      {
        office: '제주공항사무소',
        phone: '064-746-2460',
        address: '제주시 공항로 2 제주국제공항 내',
      },
    ],
  },
]
