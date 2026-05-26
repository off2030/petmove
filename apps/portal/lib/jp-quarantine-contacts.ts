/**
 * 일본 동물검역소 연락처 — '사전 신고' / '일본 수출검역 신청' step 에서 진입하는
 * 내부 leaf 페이지 데이터. 펫무브는 개·고양이만 다루므로 그 외 동물 안내는 제외.
 *
 * 출처: 일본 농림수산성 동물검역소(MAFF Animal Quarantine Service) 공식 안내.
 * 구조: 본 흐름(나리타·하네다·간사이) vs 그 외 지역. 본 흐름은 절차 단계별로
 * 담당 부서가 다르기 때문에 subsection 두 개 — 신청·여행 문의(도쿄 본부 공항 담당)
 * 와 사전 신고 승인 후·예약 문의(각 공항 지부 직통). 그 외 지역은 항구·지방 공항으로
 * subsection 없음.
 */

export interface ContactEmail {
  /** 다중 이메일일 때 라벨 (예: '제1터미널', '화물'). 단일이면 생략. */
  label?: string
  address: string
}

export interface ContactRow {
  /** 부서·공항·지부 이름. */
  name: string
  /** 부가 위치 정보 (지역 지부에 사용). */
  location?: string
  /** 전화 — 다중 지원. */
  phones: string[]
  /** 팩스 — 다중 지원. */
  faxes: string[]
  /** 이메일 — 라벨 있는 다중 지원. */
  emails: ContactEmail[]
}

export interface ContactSubsection {
  /** 문의 종류 라벨 (예: '사전 신고·수출검역 신청·여행 관련 문의'). */
  title: string
  rows: ContactRow[]
}

export interface ContactSection {
  /** 상위 그룹 제목 (예: '나리타·하네다·간사이 공항'). */
  title: string
  /** 그룹 부연 설명. */
  subtitle?: string
  /** 문의 종류별 분기. 없으면 rows 사용. */
  subsections?: ContactSubsection[]
  /** subsection 없는 단일 흐름. */
  rows?: ContactRow[]
}

export const JP_QUARANTINE_CONTACTS: ContactSection[] = [
  {
    title: '나리타·하네다·간사이 공항',
    subsections: [
      {
        title: '사전 신고·수출검역 신청·여행 관련 문의',
        rows: [
          {
            name: '나리타 국제공항',
            phones: ['+81-3-5708-7261'],
            faxes: ['+81-3-6428-9953'],
            emails: [
              { label: '제1터미널', address: 'aqs.nrt1@maff.go.jp' },
              { label: '제2터미널', address: 'aqs.nrt2@maff.go.jp' },
              { label: '화물', address: 'aqs.nrtcargo@maff.go.jp' },
            ],
          },
          {
            name: '도쿄 국제공항 (하네다 공항)',
            phones: ['+81-3-5757-9752'],
            faxes: ['+81-3-5757-9759'],
            emails: [{ address: 'aqs.hnd@maff.go.jp' }],
          },
          {
            name: '간사이 국제공항',
            phones: ['+81-72-455-1956'],
            faxes: ['+81-72-455-1957'],
            emails: [{ address: 'aqs.kix1@maff.go.jp' }],
          },
        ],
      },
      {
        title: '사전 신고 승인 후·수출검역 예약 문의',
        rows: [
          {
            name: '나리타 지부, 제1터미널',
            location: '나리타 국제공항',
            phones: ['+81-476-32-6510'],
            faxes: ['+81-476-30-3011'],
            emails: [{ address: 'aqs.nrt1@maff.go.jp' }],
          },
          {
            name: '나리타 지부, 제2터미널',
            location: '나리타 국제공항',
            phones: ['+81-476-34-2342'],
            faxes: ['+81-476-34-2338'],
            emails: [{ address: 'aqs.nrt2@maff.go.jp' }],
          },
          {
            name: '나리타 지부 (화물)',
            location: '나리타 국제공항',
            phones: ['+81-476-32-6655'],
            faxes: ['+81-476-30-3012'],
            emails: [{ address: 'aqs.nrtcargo@maff.go.jp' }],
          },
          {
            name: '하네다 공항 지부',
            location: '도쿄 국제공항',
            phones: ['+81-3-5757-9752'],
            faxes: ['+81-3-5757-9759'],
            emails: [{ address: 'aqs.hnd@maff.go.jp' }],
          },
          {
            name: '간사이 공항 지부',
            location: '간사이 국제공항',
            phones: ['+81-72-455-1956'],
            faxes: ['+81-72-455-1955'],
            emails: [{ address: 'aqs.kix1@maff.go.jp' }],
          },
          {
            name: '간사이 공항 지부 (화물)',
            location: '간사이 국제공항',
            phones: ['+81-72-455-1958'],
            faxes: ['+81-72-455-1959'],
            emails: [{ address: 'aqs.kixcargo@maff.go.jp' }],
          },
        ],
      },
    ],
  },
  {
    title: '그 외 지역',
    subtitle: '항구·지방 공항',
    rows: [
      {
        name: '홋카이도와 도호쿠 지부',
        location: '도마코마이 항구, 신치토세 공항',
        phones: ['+81-123-24-6080'],
        faxes: ['+81-123-24-6091'],
        emails: [{ address: 'aqs.sk@maff.go.jp' }],
      },
      {
        name: '요코하마 본부',
        location: '케이힌 항구',
        phones: ['+81-45-751-5973'],
        faxes: ['+81-45-751-5951'],
        emails: [{ address: 'aqs.yokodobutu@maff.go.jp' }],
      },
      {
        name: '중부 공항 지부',
        location: '주부 국제공항',
        phones: ['+81-569-38-8577'],
        faxes: ['+81-569-38-8585'],
        emails: [{ address: 'aqs.nqa@maff.go.jp' }],
      },
      {
        name: '나고야 지부',
        location: '나고야 항구',
        phones: ['+81-52-651-0334'],
        faxes: ['+81-52-661-0203'],
        emails: [{ address: 'aqs.nqo@maff.go.jp' }],
      },
      {
        name: '고베 지부',
        location: '한신 항구 (효고)',
        phones: ['+81-78-222-8990'],
        faxes: ['+81-78-222-8993'],
        emails: [{ address: 'aqs.ukb@maff.go.jp' }],
      },
      {
        name: '오사카 지부',
        location: '한신 항구 (오사카)',
        phones: ['+81-6-6575-3466'],
        faxes: ['+81-6-6575-0977'],
        emails: [{ address: 'aqs.osa@maff.go.jp' }],
      },
      {
        name: '모지 지부',
        location: '기타큐슈 공항',
        phones: ['+81-93-321-1116'],
        faxes: ['+81-93-332-5858'],
        emails: [{ address: 'aqs.moji@maff.go.jp' }],
      },
      {
        name: '하카타 지부',
        location: '하카타 항구',
        phones: ['+81-92-262-5285'],
        faxes: ['+81-92-262-5283'],
        emails: [{ address: 'aqs.hkt@maff.go.jp' }],
      },
      {
        name: '후쿠오카 공항 지부',
        location: '후쿠오카 공항',
        phones: ['+81-92-477-0080'],
        faxes: ['+81-92-477-7580'],
        emails: [{ address: 'aqs.fuk@maff.go.jp' }],
      },
      {
        name: '가고시마 공항 지부',
        location: '가고시마 공항, 가고시마 항구',
        phones: ['+81-995-43-9061'],
        faxes: ['+81-995-43-9066'],
        emails: [{ address: 'aqs.kop@maff.go.jp' }],
      },
      {
        name: '오키나와 지부 (나하 항구)',
        location: '나하 항구',
        phones: ['+81-98-861-4370'],
        faxes: ['+81-98-862-0093'],
        emails: [{ address: 'aqs.nah@maff.go.jp' }],
      },
      {
        name: '오키나와 지부 (나하 공항)',
        location: '나하 공항',
        phones: ['+81-98-857-4468'],
        faxes: ['+81-98-859-1646'],
        emails: [{ address: 'aqs.nap@maff.go.jp' }],
      },
    ],
  },
]
