/**
 * 중앙 수의사/병원 정보.
 * 증명서 템플릿에 들어가는 서명란·연락처 정보를 한 곳에서 관리한다.
 * 모든 PDF 매핑은 transform "vet:<key>" 로 이 값을 참조한다.
 */

export const VET_INFO = {
  // 한글
  name_ko: '이진원',
  clinic_ko: '로잔동물의료센터',
  address_ko: '대한민국 서울시 관악구 관악로 29길 3, 수안빌딩 1층',

  // 영문
  name_en: 'Jinwon Lee',
  clinic_en: 'Lausanne Veterinary Medical Center',
  address_en: '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  /** 주소 1줄 (street) / 2줄 (locality) 분리 */
  address_street_en: '1st floor, 3, Gwanak-ro 29-gil',
  address_locality_en: 'Gwanak-gu, Seoul, Republic of Korea',

  // 연락처
  phone: '02-872-7588',
  phone_intl: '+82-2-872-7588',
  email: 'petmove@naver.com',

  // 면허
  license_no: '9608',
} as const

export type VetInfoKey = keyof typeof VET_INFO
