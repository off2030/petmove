export type ExternalLink = {
  id: string
  name: string
  url: string
  description: string
  flag?: string
}

export type ExternalLinkCategory = {
  id: string
  label: string
  links: ExternalLink[]
}

export type ExternalLinksConfig = {
  categories: ExternalLinkCategory[]
}

export const DEFAULT_EXTERNAL_LINKS: ExternalLinksConfig = {
  categories: [
    {
      id: 'reporting',
      label: '신고 기관',
      links: [
        {
          id: 'jp-naccs',
          name: '動物検疫所 (일본 NACCS)',
          url: 'https://webaps-prod.nac.naccs.jp/anau/anipas/AOWZ01/OWZ01W02O',
          description: '動物検疫関連業務',
          flag: '🇯🇵',
        },
        {
          id: 'us-cdc-dog-import',
          name: 'CDC Dog Import Form',
          url: 'https://survey.1cdp.cdc.gov/?form=556bcb90-1bca-4b01-8094-ad22a7169c32',
          description: '미국 입국 개 신고서',
          flag: '🇺🇸',
        },
        {
          id: 'us-hdoa-hipop',
          name: 'HDOA Animal Quarantine',
          url: 'https://identity.ais.hawaii.gov/hipop/login',
          description: '하와이 검역 로그인',
          flag: '🇺🇸',
        },
        {
          id: 'us-hdoa-microchip',
          name: 'HDOA 마이크로칩 검색',
          url: 'https://hdoa.hawaii.gov/ai/aqs/animal-quarantine-microchip-search/',
          description: '하와이 마이크로칩 조회',
          flag: '🇺🇸',
        },
        {
          id: 'ph-intercommerce-login',
          name: 'InterCommerce',
          url: 'https://www.intercommerce.com.ph/login.asp?home=HOME',
          description: '필리핀 로그인',
          flag: '🇵🇭',
        },
        {
          id: 'ph-intercommerce-bai',
          name: 'InterCommerce BAI',
          url: 'https://www.intercommerce.com.ph/registrationbai.asp',
          description: 'BAI 등록',
          flag: '🇵🇭',
        },
      ],
    },
    {
      id: 'lab',
      label: '검사기관',
      links: [
        {
          id: 'kr-qia',
          name: '농림축산검역본부',
          url: 'https://eminwon.qia.go.kr/intro/tm.jsp',
          description: '인터넷 검역지원서비스',
          flag: '🇰🇷',
        },
        {
          id: 'kr-krsl',
          name: 'KRSL (코미팜혈청연구소)',
          url: 'http://krsl.komipharm.co.kr/main.asp',
          description: '혈청검사',
          flag: '🇰🇷',
        },
        {
          id: 'us-ksvdl',
          name: 'KSVDL (Kansas State University)',
          url: 'http://www.ksvdl.org/',
          description: '미국 전염병검사 (광견병 항체가 등)',
          flag: '🇺🇸',
        },
      ],
    },
    {
      id: 'shipping',
      label: '배송',
      links: [
        {
          id: 'fedex-kr',
          name: 'FedEx 한국',
          url: 'https://www.fedex.com/ko-kr/home.html',
          description: '국제특송',
          flag: '🇰🇷',
        },
        {
          id: 'ems-kr',
          name: '우체국 EMS',
          url: 'https://ems.epost.go.kr/front.SmEmsAcceptIntro.postal',
          description: '국제우편 스마트접수',
          flag: '🇰🇷',
        },
      ],
    },
    {
      id: 'admin',
      label: '운영',
      links: [
        {
          id: 'ghost',
          name: 'Ghost',
          url: 'https://account.ghost.org/signin',
          description: '블로그 CMS 로그인',
        },
      ],
    },
  ],
}
