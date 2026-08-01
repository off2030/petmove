/**
 * pdf-field-mappings.json 의 source 키 → 사용자에게 보여줄 한국어 라벨.
 *
 * 빈 필드 사전 안내 다이얼로그에서 사용 — PDF 칸 이름(영문 internal) 대신 케이스
 * 필드 라벨로 표시해 사용자가 어디를 채워야 할지 즉시 알 수 있게 한다.
 *
 * 동일 base 데이터를 가리키는 source 들은 groupSourceKey 로 한 키로 묶어 dedupe.
 *   예) address_en / address_en_no_country / address_en_street / address_en_state → "영문 주소"
 *       customer_first_name_en / customer_last_name_en → "보호자 영문 이름"
 *       microchip_combined → "마이크로칩 번호"
 *
 * source 를 추가하면 SOURCE_LABELS 에 매핑을 추가한다 (없으면 raw source 가 그대로 노출됨).
 */

export const SOURCE_LABELS: Record<string, string> = {
  // 보호자
  customer_name: '보호자 한글 이름',
  customer_name_en: '보호자 영문 이름',
  phone: '전화번호',
  email: '이메일',

  // 주소
  address_kr: '한글 주소',
  address_en: '영문 주소',
  address_zipcode: '우편번호',
  address_city: '도시',
  address_overseas: '해외 주소',

  // 동물 기본정보
  pet_name_en: '동물 영문 이름',
  birth_date: '생년월일',
  species: '종 (개/고양이)',
  breed: '품종',
  breed_en: '품종 (영문)',
  color_en: '색상 (영문)',
  sex: '성별',
  weight: '체중',
  animal_description: '동물 외형 설명',

  // 마이크로칩
  microchip: '마이크로칩 번호',
  microchip_implant_date: '마이크로칩 삽입일',
  microchip_secondary: '보조 마이크로칩 번호',
  microchip_tertiary: '보조 마이크로칩 번호 2',

  // 백신 / 검사
  rabies_dates: '광견병 백신 접종 기록',
  rabies_titer_records: '광견병 항체 검사 기록',
  general_vaccine_dates: '종합백신 접종 기록',
  civ_dates: '독감 접종 기록',
  external_parasite_dates: '외부 구충 기록',
  internal_parasite_dates: '내부 구충 기록',
  heartworm_dates: '심장사상충 기록',
  infectious_disease_records: '전염병 검사 기록',

  // 항공편
  entry_flight_number: '항공편명',

  // 일정
  departure_date: '출국일',
  vet_visit_date: '내원일 (증명서 발급일)',

  // 증명서·허가
  certificate_no: '증명서 번호',
  permit_no: '허가증 번호',

  // 국가별 추가정보
  australia_extra: '호주 추가 정보',
  hawaii_extra: '하와이 추가 정보',
  japan_extra: '일본 추가 정보',
  new_zealand_extra: '뉴질랜드 추가 정보',
  switzerland_extra: '스위스 추가 정보',
  thailand_extra: '태국 추가 정보',

  // standalone (Invoice/ESD) — 케이스 없이 발급. 빈 필드 검사 대상 외이지만 fallback 라벨.
  consignee_lab: '수신 실험실',
  shipper_export_ref: '발송 참조번호',
  total_pets_arriving: '도착 동물 수',
  tube_count: '튜브 수',
}

/**
 * 동일 base 데이터를 가리키는 여러 source 를 한 키로 묶는다.
 * — 영문 주소의 도로명·시도·국가제외 derived 변형은 모두 "영문 주소" 한 칸
 * — 해외 주소 분해도 한 칸
 * — 우편번호 합본(postcode_place)·동의어(postal_code) → 우편번호
 * — 마이크로칩 합본(microchip_combined) → 마이크로칩 번호
 * — 보호자 영문 이름 split 분리 저장도 한 라벨로 합침
 */
export function groupSourceKey(source: string): string {
  if (source.startsWith('address_en')) return 'address_en'
  if (source.startsWith('address_overseas')) return 'address_overseas'
  if (source === 'postcode_place' || source === 'postal_code') return 'address_zipcode'
  if (source === 'microchip_combined' || source === 'microchip_primary') return 'microchip'
  if (source === 'customer_first_name_en' || source === 'customer_last_name_en') return 'customer_name_en'
  return source
}

/**
 * 빈 필드 검사에서 제외할 source.
 * — standalone 전용 4종: 케이스 발급 흐름에 등장 X
 * — infectious_date:<lab> / titer_date:<lab>: vet_visit_date 로 자연 폴백되므로
 *   별도 알림 의미 없음 (lab 매칭 누락은 절차 검증 룰이 따로 잡음)
 * — microchip_secondary_note: 보조칩은 선택 입력 — 없으면 각주 자체가 공란 (정상)
 */
const STANDALONE_ONLY = new Set([
  'consignee_lab',
  'shipper_export_ref',
  'total_pets_arriving',
  'tube_count',
])

export function shouldSkipSourceForMissingCheck(source: string): boolean {
  if (STANDALONE_ONLY.has(source)) return true
  if (source === 'microchip_secondary_note') return true
  if (source.startsWith('infectious_date:') || source.startsWith('titer_date:')) return true
  return false
}

/** source → 한국어 라벨. 그룹키 거친 후 SOURCE_LABELS lookup, 없으면 raw 그대로. */
export function labelForSource(source: string): string {
  const key = groupSourceKey(source)
  return SOURCE_LABELS[key] ?? key
}
