/**
 * 다중 목적지 케이스에서 destination별로 분리 저장되는 필드 정책.
 *
 * 저장 구조: `cases.data.by_dest[destination][key] = value`
 *   destination 토큰은 `resolveActiveDestination` 결과(사용자 입력 그대로의 한글/영문 토큰)와 동일.
 *   `trip_type` Map 컨벤션과 일치.
 *
 * Fallback 순서 (read):
 *   1. data.by_dest[destination][key]
 *   2. top-level data[key]  (또는 column for departure_date)
 *   3. legacy country_extra 경로 (readEffectiveExtraValue 내부)
 *
 * 단일 목적지 케이스: by_dest 미사용, 기존 경로 그대로.
 */

import type { CaseRow } from './types'
import { parseDestinations } from './destination-config'

/**
 * 분리 대상 키. 이 키들에 대한 입력은 다중 목적지 시 by_dest 에 저장돼야 함.
 *
 * 🟢 케이스 공통 유지 (포함 X): email, postal_code, overseas_phone, passport_*,
 *   holder_birth_date — 보호자·동물 신원은 destination 무관.
 */
export const DESTINATION_SCOPED_FIELD_KEYS: ReadonlySet<string> = new Set([
  // ── 전염병 검사 (2026-07-30 사용자 지정으로 전역 → 목적지별) ──────────────
  // **검사 항목이 나라마다 다르다**: 호주 3종(리슈만편모충·브루셀라·렙토 MAT) vs
  //   뉴질랜드 5종(바베시아 IFAT/ELISA+PCR·심장사상충·리슈만편모충·렙토·브루셀라).
  //   기록 배열에는 날짜만 들어가고 검사 종목은 없어서, 전역이면 호주용으로 3종만 받은
  //   기록이 뉴질랜드 여정에도 '검사 완료'로 보인다(실제로는 바베시아·심장사상충 누락).
  // ⚠️ 전에는 어느 명단에도 없어 기본 전역이었다 — lint:scope 가 계산된 키
  //   (`nextData[fieldKey]`)를 못 봐서 미분류인 채 통과했다.
  'infectious_disease_records',
  'infectious_disease_records_scheduled',
  'infectious_disease_confirmed',

  // 일정
  'departure_date',
  'vet_visit_date',
  // 예정(미래) 내원일 — 실제 내원일(vet_visit_date)과 같은 분리 원칙. 다중 목적지가 많아
  // 한 나라 예정 내원일이 다른 나라로 새지 않게 by_dest 로 분리. read 는 flatten 이 surface.
  'vet_visit_date_scheduled',
  // 검진 완료(legacy '저장=완료'·admin 토글) 플래그 — 검진일과 같은 step(전 목적지)이라
  // 같이 분리. 안 하면 한 목적지 검진 완료가 다른 목적지로 누수(검진일은 분리됐는데 완료만
  // 전역이면 어긋남). 현행 코드는 이 값을 true 로 쓰지 않아(legacy 데이터만 존재) 다중
  // 목적지 read 에서 flatten strict 가 전역 잔존을 떨궈주는 효과가 주효.
  'vet_visit_confirmed',
  // 항공권 구매 step 표시일(항공정보 최초 입력 시각) — 항공편 필드가 목적지별이라 같이 분리.
  // 현행 코드는 단일 목적지에서만 기록(다중은 미기록)하지만, scoped 로 두면 다중 read 에서
  // flatten 이 전역 잔존을 떨궈 단일→다중 전환 시 표시일 누수를 막는다.
  'flight_info_recorded_at',
  // 출국 항공편 — 한국 출발 (departure_*) + 도착국 도착 (entry_*)
  'departure_flight_date',
  'entry_date',
  'entry_airport',
  'entry_flight_number',
  'entry_departure_airport',
  'entry_time',
  'entry_transport',
  'entry_purpose',
  // 귀국 항공편 (도착국 → 한국)
  'return_date',
  'return_flight_number',
  'return_departure_airport',
  'return_arrival_airport',
  'return_transport',
  // 귀국 항공권 '미정' 플래그('1') — 귀국편이 목적지별로 다르므로 같이 분리. 출국 일정만으로
  // 항공권 구매 step 완료 인정(done-resolver has-flight-date). return_date 입력 시 자동 해제.
  'return_undecided',
  // 증명서·허가 (국가별)
  'permit_no',
  'certificate_no',
  'id_date',
  // 마이크로칩 인증 2차 — 뉴질랜드만 회차가 둘이다(IHS 1.11(4), 채혈이 출국 3~6개월 전인 경우).
  //   호주는 1회뿐이라 이 키를 쓰지 않는다. 1차는 위 'id_date' 를 그대로 공유한다.
  'id_date_2',
  // 수입 허가 신청 → 허가증 2단계 (import-permit step, 태국·호주 등 허가 필요국 공용) —
  // 목적지마다 허가를 따로 받으므로 신청일·완료(skip) 플래그도 by_dest 분리.
  'import_permit_application_date',
  // 허가를 확인한 날 — 신청일 칸이 없는 카드(뉴질랜드)의 완료일 표시용. 신청일이 있으면 그쪽이
  //   우선이고 이 값은 폴백이다(2026-07-29 — 신청일을 없앤 뒤 완료일이 비어 보였다).
  'import_permit_recorded_at',
  'import_permit_issued_skipped',
  // '진행 중' 확인 플래그(보호자가 신청 후 '진행 중' 버튼을 눌렀는지) — skip 플래그와 동일하게 by_dest 분리.
  'import_permit_in_progress',
  // 절차 시간 (EU 촌충국가별 praziquantel 투여시각)
  'deworming_time',
  // 도착국 거주지 주소 — destination 별로 다른 주소
  'address_overseas',
  // 미국 — CDC 입국 경로·도착 주 확인과 미국 현지 절차 날짜. 같은 동물이 미국과 다른
  // 목적지를 동시에 준비해도 한 여정의 확인 상태가 다른 여정으로 새지 않게 분리한다.
  'us_cdc_form_date',
  'us_import_quarantine_date',
  'us_import_quarantine_confirmed',
  'us_export_quarantine_date',
  'us_export_quarantine_confirmed',
  // 검역 — 출입국마다(목적지마다) 별도. 한 동물이 여러 나라를 동시에 진행하므로
  // 검역 완료도 by_dest 로 분리돼야 한다(공용이면 한 나라 완료가 다른 나라로 누수).
  'kr_export_quarantine_date',
  'kr_export_quarantine_confirmed',
  'jp_import_quarantine_date',
  'jp_import_quarantine_confirmed',
  'jp_export_quarantine_visit_date',
  'jp_export_quarantine_visit_confirmed',
  'jp_export_quarantine_application_date',
  'jp_export_quarantine_date',
  'jp_export_quarantine_time',
  'kr_import_quarantine_date',
  'kr_import_quarantine_confirmed',
  // 나라별 도착 수입검역(일본 외) — '{국가}_import_quarantine_date/_confirmed'. 목적지마다 따로
  // 저장(by_dest)되도록 등록. 나라 추가 시 그 나라 키 2개를 여기에 추가.
  'th_import_quarantine_date',
  'th_import_quarantine_confirmed',
  // 하와이 — 도착 검역(공항 동물검역소 5-Day-Or-Less/DAR). 일본 복제(범용 quarantine 방식).
  'hi_import_quarantine_date',
  'hi_import_quarantine_confirmed',
  // 하와이 — 입국 신청(도착 10일 전 AQS 서류 제출, HIPOP 온라인/우편). confirm 완료 모델.
  'hi_import_declaration_date',
  'hi_import_declaration_confirmed',
  // 하와이 — 한국 입국용 건강증명서·USDA 승인(왕복 귀국, 미국 본토 us_export 와 동형).
  'hi_export_quarantine_date',
  'hi_export_quarantine_confirmed',
  'th_export_quarantine_date',
  'th_export_quarantine_confirmed',
  // 말레이시아·인도네시아 — 태국 복제(2026-07-22).
  'my_import_quarantine_date',
  'my_import_quarantine_confirmed',
  'my_export_quarantine_date',
  'my_export_quarantine_confirmed',
  'id_import_quarantine_date',
  'id_import_quarantine_confirmed',
  'id_export_quarantine_date',
  'id_export_quarantine_confirmed',
  // 호주 — 도착 계류(Mickleham 최소 10일/30일) + 계류시설 예약 시작일.
  //   마이크로칩 인증일은 기존 'id_date'(위 증명서·허가 묶음)를 그대로 쓴다.
  'au_import_quarantine_date',
  'au_import_quarantine_confirmed',
  'au_quarantine_reservation_date',
  // 예약을 마친 날(일정 목록 완료일) — 카드 입력값은 미래 계류 시작일이라 따로 찍는다.
  'au_quarantine_reservation_recorded_at',
  // RNATT 선언서 발급일(검역본부) — 수입 허가 신청의 필수 제출물이라 목적지별로 따로 받는다.
  'au_rnatt_declaration_date',
  // 뉴질랜드 — 도착 계류(MPI 승인 시설 최소 10일) + 계류시설 예약 시작일.
  //   마이크로칩 인증일은 호주와 같은 'id_date'(위 증명서·허가 묶음)를 그대로 쓴다.
  'nz_import_quarantine_date',
  'nz_import_quarantine_confirmed',
  'nz_quarantine_reservation_date',
  // 예약을 마친 날 — 카드 입력값은 미래 계류 시작일이라 완료일로 쓸 수 없다(호주와 같은 모델).
  //   ⚠️ 이 키를 명단에 빠뜨리면 by_dest 로 저장돼도 목적지 뷰로 평탄화되지 않아, 예약을 마쳐도
  //   일정 목록의 날짜가 계속 비어 보인다(2026-07-29 사용자 지적으로 발견).
  'nz_quarantine_reservation_recorded_at',
  // 광견병 증명서(RCF) 발급일 — 수입 허가 신청의 필수 제출물이라 목적지별로 따로 받는다
  //   (호주 au_rnatt_declaration_date 와 같은 자리). 구 IHS 시절 이름은 OVD.
  'nz_rcf_date',
  // 남아공 — 도착 검역(국가 검역시설 약 14일) + 검역시설 예약 시작일 + AIA 수입 허가(개 전용).
  //   ⚠️ AIA 는 수의검역 수입 허가(import_permit_*)와 **별개의 두 번째 허가**라 필드도 따로다.
  //   신청 → 발급 2단계라 신청일·완료(skip)·진행중 플래그 셋을 모두 등록해야 한다
  //   (싱가포르 반려동물 라이선스와 같은 모델 — 하나라도 빠지면 저장 후 값이 사라진다).
  'za_import_quarantine_date',
  'za_import_quarantine_confirmed',
  'za_quarantine_reservation_date',
  // 예약을 마친 날 — 카드 입력값은 미래 검역 시작일이라 완료일로 쓸 수 없다(호주·뉴질랜드 모델).
  'za_quarantine_reservation_recorded_at',
  // 버튼 완료 카드라 이 필드에 **허가 취득일**(버튼 누른 날)이 기록된다 — 신청일이 아니다.
  //   ⛔ issued_skipped·in_progress 플래그를 되살리지 말 것(2단계 모델 폐기, 2026-07-30).
  'za_aia_permit_application_date',
  // 싱가포르 — 도착 검역(AQC 30일). (구 귀국 수출검역 필드는 카드 제거와 함께 정리, 2026-08-01.)
  'sg_import_quarantine_date',
  'sg_import_quarantine_confirmed',
  // 싱가포르 전용 절차 카드.
  // 계류장 예약·반려동물 라이선스(개·고양이, 2026-08-01 고양이 포함 확인) = 수입 허가와 동일 신청 → 발급 모델(신청일 + 완료/첨부).
  //   목적지마다 따로 신청하므로 신청일·완료(skip)·진행중 플래그도 by_dest 분리.
  'sg_quarantine_reservation_application_date',
  'sg_quarantine_reservation_issued_skipped',
  'sg_quarantine_reservation_in_progress',
  // 계류장 예약 날짜(정보성) — 신청일과 함께 입력. by_dest 저장이라 반드시 등록해야
  //   activeDestinationView 가 top-level 로 펼쳐 읽힌다(미등록 시 저장 후 날짜가 사라짐).
  'sg_quarantine_reservation_date',
  'sg_dog_licence_application_date',
  'sg_dog_licence_issued_skipped',
  'sg_dog_licence_in_progress',
  // 관부가세·국경검사 예약 = 검역 confirm 모델(예약일 + 완료 확인).
  'sg_gst_permit_date',
  'sg_gst_permit_confirmed',
  'sg_border_inspection_date',
  'sg_border_inspection_recorded_at',
  'sg_border_inspection_confirmed',
  // 아르헨티나 — 도착 검역 + 귀국 수출 검역(SENASA CVI, 2026-07-23 추가).
  'ar_import_quarantine_date',
  'ar_import_quarantine_confirmed',
  'ar_export_quarantine_date',
  'ar_export_quarantine_confirmed',
  'ph_import_quarantine_date',
  'ph_import_quarantine_confirmed',
  // 홍콩 도착 수입 검역 (AFCD 화물터미널 — Group II 라 격리 없음)
  'hk_import_quarantine_date',
  'hk_import_quarantine_confirmed',
  // 중국 도착 수입 검역 (GACC — 미충족 시 30일 격리)
  'cn_import_quarantine_date',
  'cn_import_quarantine_confirmed',
  // 대만 도착 수입 검역 (APHIA — 요건 미충족 시 7일 격리)
  'tw_import_quarantine_date',
  'tw_import_quarantine_confirmed',
  // 베트남 도착 수입 검역 (Thông tư 01/2026 제14조 — 동반 2마리 이하는 공항 검역소 현장 신고)
  'vn_import_quarantine_date',
  'vn_import_quarantine_confirmed',
  // 베트남 골격 복제 4국의 도착 수입 검역 (2026-07-20 — 카드 구성이 베트남과 동일).
  'kh_import_quarantine_date',
  'kh_import_quarantine_confirmed',
  'mn_import_quarantine_date',
  'mn_import_quarantine_confirmed',
  'uz_import_quarantine_date',
  'uz_import_quarantine_confirmed',
  'ca_import_quarantine_date',
  'ca_import_quarantine_confirmed',
  // 대만 수출 검역 (왕복 귀국 전 — 한국 수출검역증으로 갈음 가능한 선택 절차)
  'tw_export_quarantine_date',
  'tw_export_quarantine_confirmed',
  // 중국 수출 검역 (왕복 귀국 전 — 해관 발급 건강증명서)
  'cn_export_quarantine_date',
  'cn_export_quarantine_confirmed',
  // 베트남 수출 검역 (왕복 귀국 전 — 지역 수의지국 Chi cục Thú y 발급. 강제 절차)
  'vn_export_quarantine_date',
  'vn_export_quarantine_confirmed',
  'kh_export_quarantine_date',
  'kh_export_quarantine_confirmed',
  // 모로코·우크라이나·멕시코·브라질·카자흐스탄 — 베트남 골격 복제(2026-07-20).
  // 도착 수입 검역 + 현지 수출 검역 한 쌍씩. 근거는 각 procedure-checks 헤더 주석 참고.
  'ma_import_quarantine_date',
  'ma_import_quarantine_confirmed',
  'ma_export_quarantine_date',
  'ma_export_quarantine_confirmed',
  'ua_import_quarantine_date',
  'ua_import_quarantine_confirmed',
  'ua_export_quarantine_date',
  'ua_export_quarantine_confirmed',
  'mx_import_quarantine_date',
  'mx_import_quarantine_confirmed',
  'mx_export_quarantine_date',
  'mx_export_quarantine_confirmed',
  'br_import_quarantine_date',
  'br_import_quarantine_confirmed',
  'br_export_quarantine_date',
  'br_export_quarantine_confirmed',
  'kz_import_quarantine_date',
  'kz_import_quarantine_confirmed',
  'kz_export_quarantine_date',
  'kz_export_quarantine_confirmed',
  // 아랍에미리트 — 필리핀 골격 복제(2026-07-22).
  'ae_import_quarantine_date',
  'ae_import_quarantine_confirmed',
  'ae_export_quarantine_date',
  'ae_export_quarantine_confirmed',
  // 러시아·튀르키예 — 카자흐스탄 복제(2026-07-22).
  'ru_import_quarantine_date',
  'ru_import_quarantine_confirmed',
  'ru_export_quarantine_date',
  'ru_export_quarantine_confirmed',
  'tr_import_quarantine_date',
  'tr_import_quarantine_confirmed',
  'tr_export_quarantine_date',
  'tr_export_quarantine_confirmed',
  // 몽골·우즈베키스탄·캐나다 수출 검역 (왕복 귀국 전 — 2026-07-20 조사 후 신설).
  // 세 나라 모두 한국 APQA 가 '수출국 정부기관 증명 검역증명서'를 요구해 사실상 강제다
  // (EU 펫패스포트만 예외). 나라별 근거는 각 catalog step 주석 참고.
  'mn_export_quarantine_date',
  'mn_export_quarantine_confirmed',
  'uz_export_quarantine_date',
  'uz_export_quarantine_confirmed',
  'ca_export_quarantine_date',
  'ca_export_quarantine_confirmed',
  // 필리핀 귀국 전 현지 동물병원 방문 — BAI 수출검역 신청용 건강증명서. dated-confirm.
  'ph_local_vet_visit_date',
  'ph_local_vet_visit_confirmed',
  'ph_export_quarantine_date',
  'ph_export_quarantine_confirmed',
  // 홍콩 — 도착 24시간 전 사전 통지 + 귀국 서류 준비(AFCD 건강증명서 또는 한국 검역증 갈음).
  'hk_advance_notice_date',
  'hk_advance_notice_confirmed',
  'hk_export_quarantine_date',
  'hk_export_quarantine_confirmed',
  // 괌 — 검역시설 예약(수입 허가 신청 서류에 예약확인서가 들어간다) + 도착 계류.
  //   ⚠️ 목적지별로 분리 저장하지 않으면 다른 여정으로 새어 나간다(명단이 opt-in 화이트리스트).
  'gu_quarantine_reservation_date',
  'gu_quarantine_reservation_confirmed',
  'gu_import_quarantine_date',
  'gu_import_quarantine_confirmed',
  // EU 패밀리 공용 — 입국 검사·현지 검역증명서. 키는 공용이지만 by_dest 가 목적지별 분리.
  'eu_import_quarantine_date',
  'eu_import_quarantine_confirmed',
  'eu_export_quarantine_date',
  'eu_export_quarantine_confirmed',
  // 아일랜드 사전 통지 (Advance Notice Portal)
  'ie_advance_notice_date',
  'ie_advance_notice_confirmed',
  // 노르웨이 사전 통지 (Mattilsynet 이메일, 48시간 전)
  'no_advance_notice_date',
  'no_advance_notice_confirmed',
  // 키프로스 사전 통지 (지구 수의검역국 이메일, 48시간 전)
  'cy_advance_notice_date',
  'cy_advance_notice_confirmed',
  // 몰타 사전 통지 (온라인 포털 + 수의사 이메일, 3영업일 전)
  'mt_advance_notice_date',
  'mt_advance_notice_confirmed',
  'pt_advance_notice_date',
  'pt_advance_notice_confirmed',
  // 이스라엘 사전 통보 (벤구리온 공항 검역소, 48시간 전)
  'il_advance_notice_date',
  'il_advance_notice_confirmed',
  // 필수 서류 수기 상태(완료/해당없음) — docId→bool 맵(객체 값). 검역과 같은 이유로 목적지별
  // 분리: 한 목적지에서 표시한 서류 완료가 다른 목적지(또는 단일 시절 전역값)로 누수돼 자동
  // 완료로 오판되는 걸 막는다. 스칼라 폼 필드가 아니라 객체지만, flatten/by_dest 헬퍼는 값
  // 타입을 가리지 않아 그대로 동작한다. (폼 필드 key 만 보는 일반 경로 — fields/auto-fill/
  // share-link/admin updateCaseField — 는 이 키를 다루지 않아 영향 없음.)
  'required_doc_flags',
  'required_doc_na',
  // 서류 체크리스트(document-checklist)가 모두 ✓ 된 시점('YYYY-MM-DD', KST) — 일정 표시일용.
  // 완료 판정(required_doc_flags/na·첨부·step done)이 목적지별이라 완료 시점도 by_dest 분리.
  'required_docs_completed_at',
  // 펫무브워크 서류 탭의 수기 준비 상태/메모 — 한 목적지 서류 완료·메모가 다른 목적지
  // 필수서류 체크리스트로 새면 완료 판정이 오염된다.
  'export_doc_status',
  'export_doc_memo',
  // 펫무브워크 신고 탭의 수기 수입·수출 진행 상태 — **카드 연결이 없는 목적지에서만** 쓰이는
  //   운영자 수동값(연결이 있으면 카드 시그널이 단일 출처 — [[resolveReportBinding]]).
  //   예전엔 top-level 전역이라 "하와이, 일본" 처럼 신고국이 둘인 케이스에서 한 나라 신고를
  //   완료로 바꾸면 다른 나라 칸도 완료로 보였다(2026-08-21 발견). 서류 탭 상태와 같은 이유로 분리.
  //   기존 top-level 값은 scripts/migrate-report-status.mjs 가 카드 시그널·by_dest 로 옮겼다.
  'import_import_status',
  'import_export_status',
])

export function isDestinationScopedKey(key: string): boolean {
  return DESTINATION_SCOPED_FIELD_KEYS.has(key)
}

/**
 * 의도적으로 **케이스 공통(전역)** 으로 두는 case.data 키 — 목적지가 달라도 같은 값.
 *
 * 두 부류:
 *   1) 동물·보호자 신원·이력 — 동물 한 마리/보호자 한 명의 사실이라 목적지 무관.
 *      (이름, 체중, 마이크로칩, 광견병 접종·항체 이력 + 그 확인 플래그)
 *   2) 스코핑 기반 구조물 — 그 자체가 destination 별 분기를 담는 컨테이너거나 케이스 단위 메타.
 *      (by_dest, destination-keyed 맵 trip_type/arrival_confirmed, past_journeys)
 *
 * scoping lint(scripts/lint-destination-scoping.mjs)가 이 명단 + DESTINATION_SCOPED_FIELD_KEYS
 * 로 "분류됨"을 판정한다. 새 case.data 키는 둘 중 하나에 반드시 등록 — 안 하면 lint 실패.
 */
export const GLOBAL_CASE_DATA_KEYS: ReadonlySet<string> = new Set([
  // 1) 동물·보호자 신원·이력 (동물/보호자 단위 — 목적지 무관)
  'customer_first_name_en',
  'customer_last_name_en',
  'weight',
  'microchip_implant_date',
  'rabies_dates',
  'general_vaccine_dates', //   종합백신 접종 이력 — 동물 단위 사실 (rabies_dates 동일)
  'kennel_cough_dates', //      켄넬코프 접종 이력 — 종합백신과 같은 동물 단위 사실(2026-07-27 카드 분리)
  'heartworm_dates', //         심장사상충 검사 이력 — 구충과 같은 동물 단위 사실(2026-07-27 카드 분리)
  // 아래 5개는 **미분류였다**(2026-07-30 전수조사로 발견). 기본이 전역이라 동작은 의도와
  //   같았지만, lint:scope 가 계산된 키(`nextData[fieldKey]`)를 못 봐서 분류 없이 통과했다 —
  //   같은 구멍으로 infectious_disease_records 가 목적지별이어야 하는데 전역으로 굴러다녔다.
  //   이제 액션 화이트리스트(PARASITE_FIELD_KEYS 등)를 lint 가 읽어 분류를 강제한다.
  'external_parasite_dates', //  외부구충 처치 이력 — 동물 단위 사실
  'internal_parasite_dates', //  내부구충 처치 이력 — 〃 (촌충 카드와 키 공유)
  'lungworm_dates', //           폐충 처치 이력 — 〃 (2026-07-29 카드 분리)
  'civ_dates', //                독감(CIV) 접종 이력 — 〃 (종합백신과 같은 모델)
  'rabies_titer_extra', //       추가 항체검사 회차 — rabies_titer_records 와 같은 동물 단위
  'rabies_titer_records',
  'rabies_titer_scheduled', //  항체검사 채혈일을 미래(예정)로 저장 시 별도 자리 — *_dates 동일 동물 단위(전역)
  'rabies_extra_confirmed',
  'rabies_titer_result_confirmed',
  'titer_extra_confirmed',
  'titer_extra_result_confirmed', // 추가 항체검사 '결과 확인 완료' — 1회차 플래그와 동일 동물 단위(전역)
  // 백신·검사·구충 카드의 '예정→도래→완료확인' 플래그 — 대응 *_dates 가 동물 단위(전역)라
  // 확인 플래그도 전역. server 저장 액션이 '가장 늦은 입력일 ≤ 오늘'로 자동 set/clear.
  'microchip_confirmed',
  'rabies_1_confirmed',
  'rabies_2_confirmed',
  'rabies_single_confirmed',
  'general_vaccine_confirmed',
  'kennel_cough_confirmed',
  'heartworm_confirmed',
  'civ_confirmed',
  'external_parasite_confirmed',
  'internal_parasite_confirmed',
  // 회차 목록 카드의 '미래(예정) 회차' 별도 저장 자리 — 대응 *_dates 와 동일 동물 단위(전역).
  // 미래 날짜를 기록 배열에서 빼서 여기 두면 입력칸은 실제 회차만, 미래는 예정 배지로만 표시.
  'general_vaccine_dates_scheduled',
  'kennel_cough_dates_scheduled',
  'heartworm_dates_scheduled',
  'external_parasite_dates_scheduled',
  'internal_parasite_dates_scheduled',
  // 마이크로칩 삽입·광견병 접종 예정일 — 대응 *_date(s) 가 동물 단위(전역)라 예정도 전역.
  // (내원일 예정과 달리 동물 한 마리의 사실이라 목적지 무관.)
  'microchip_implant_date_scheduled',
  'rabies_dates_scheduled',
  // 2) 스코핑 기반 구조물·케이스 단위 메타
  'by_dest', //              destination 별 분기를 담는 컨테이너 그 자체
  'trip_type', //            destination 키 맵(내부적으로 목적지별 — 컨테이너는 전역)
  'arrival_confirmed', //    destination 키 맵(도착확인 — 컨테이너는 전역)
  'dest_started_at', //      destination 키 맵({[dest]: 'YYYY-MM-DD'}) — 그 목적지 준비 시작일.
  //                          addCaseDestination 이 추가한 날을 기록. 일정 카드 'N일째' 카운트업 기준일이
  //                          첫 등록일이 아니라 그 목적지 시작일이 되게(재이용 고객 새 여정). 없으면 created_at
  //                          폴백(처음 등록 목적지·기존 케이스). trip_type 과 같은 패턴(컨테이너 전역, 내부 목적지별).
  'past_journeys', //        완료된 여정 비석 목록(케이스 단위)
  // 3) 첨부 파일 — **의도적으로 케이스 공유**(전역 저장). 보호자가 올린 파일은 동물/케이스의
  //    자산이라 목적지와 무관하게 서류함에서 늘 보여야 한다(목적지 분리해도 기존 첨부 사라지지
  //    않게 — by_dest 명단 등록 방식은 기존 데이터 증발 위험이라 금지).
  //    ⚠️ 과거 주석의 "spec 이 목적지별이라 교차 카운트 없음" 주장은 **previewStepId 를 공유하는
  //    spec 들에서 깨진다** — rabies-titer(16개 spec)·certificate-issue(14)·import-permit(13)·
  //    kr-import-quarantine(12) 등이 같은 attachStepId 를 쓰므로, stepId 만 보면 다중 목적지에서
  //    A 목적지 첨부가 B 목적지 체크리스트를 완료시켰다. 해결(2026-08-01): 저장은 전역 그대로
  //    두고 문서 항목에 destination 태그를 달아(업로드 시 활성 목적지) 판정
  //    (required-docs hasAttachmentForStep + attachmentInDestinationScope)만 스코프 필터 —
  //    무태그(legacy)는 전 목적지 인정, 동물 단위 사실 step(SHARED_ATTACH_STEPS)은 태그 무관 공유.
  'documents', //            stepId(+destination) 태그 첨부 배열(저장은 케이스 공유, 판정은 목적지 스코프)
  'notes', //                첨부 메모 맵(documents 와 한 묶음)
  // 4) 케이스 단위 메타·설정 / destination 키 맵 / 일본 단일 단계 (전수 조사 2026-06-11)
  'co_progress', //          '함께 준비' — 동물 1마리당 1개(DB 트리거가 보호자 형제 동기화). 의도적 케이스 단위
  'completion_prompt_dismissed', // destination 키 맵({[dest]: anchorDate}) — 내부적으로 이미 목적지별
  'feedback', //             여정 만족도 의견 — { [목적지]: {rating,text,submittedAt} } 키 맵(내부 목적지별,
  //                          컨테이너는 전역). arrival_confirmed 와 같은 패턴이라 demote(by_dest 삭제) 후에도
  //                          의견 데이터는 살아남는다. 완료 게이트 아님. legacy 단일 객체는 read/write 시점 호환.
  'vet_available_date', //   출국일 파생 내원가능일(admin) — 단일 목적지에서만 기록(다중 부수효과 스킵)이라 누수 없음
  'import_report_dismissed', // 신고 탭 '신고 내리기'(취소) 플래그 — 케이스를 신고 탭에서 숨김.
  //                            케이스 단위(목적지 무관)로 한 줄을 내리는 동작이라 전역. isDismissedImportReport 가 top-level read.
  // 일본 전용 단계 신호 — 케이스당 일본 1개뿐이라 동시 다중목적지 누수 없음. portal·admin 양쪽이
  // top-level 로 read/write 해 정합(스코핑하면 양쪽 다 고쳐야 하고 실익 없음).
  'advance_notification_date',
  'advance_notification_approval_skipped',
  'jp_export_quarantine_reservation_skipped',
  // 보호자가 '진행 중' 버튼을 눌렀는지 — 위 skip 플래그와 같은 일본 단일 단계 내부 신호라 전역.
  'advance_notification_in_progress',
  'jp_export_quarantine_in_progress',
  // admin '진행중'(demote) 시그널 — 위 skip 플래그와 같은 일본 단일 단계 내부 신호. derive 가
  // top-level 로 read(report-status.ts), admin action 이 top-level 로 write. 같은 이유로 전역.
  'advance_notification_admin_demoted_at',
  'jp_export_quarantine_admin_demoted_at',
])

export function isGlobalCaseDataKey(key: string): boolean {
  return GLOBAL_CASE_DATA_KEYS.has(key)
}

/**
 * `data.by_dest[destination][key]` 읽기.
 *
 * - 키 미존재: `undefined` (caller 는 top-level/column fallback 으로 진행)
 * - 키 존재 + null: `null` (명시적 "비움" sentinel — caller 는 fallback 하지 말고 null 반환)
 * - 키 존재 + 값: 그 값
 *
 * 다중 목적지 케이스에서 한 destination 의 값을 비웠을 때 top-level 잔여 데이터가
 * fallback 으로 부활하는 걸 막기 위해 null sentinel 을 명시적으로 보존한다.
 */
export function readByDestValue(
  data: Record<string, unknown> | null | undefined,
  destination: string | null | undefined,
  key: string,
): unknown {
  if (!data || !destination) return undefined
  const byDest = data['by_dest'] as Record<string, Record<string, unknown>> | undefined
  const destObj = byDest?.[destination]
  if (!destObj || !(key in destObj)) return undefined
  const v = destObj[key]
  return v === undefined ? null : v
}

/**
 * `data.by_dest[destination][key] = value` 를 갱신한 새 data 객체 반환 (immutable).
 *
 * value 가 null/undefined/빈문자열 이면 **명시적 null sentinel** 로 저장 (delete X).
 * 다중 목적지에서 한 destination 에서 비우기 액션을 하면 top-level fallback 으로
 * 부활하는 걸 막기 위함. by_dest 객체에 항목이 쌓이지만 의미상 "명시적 비움".
 */
export function writeByDestValue(
  data: Record<string, unknown> | null | undefined,
  destination: string,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(data ?? {}) }
  const byDest: Record<string, Record<string, unknown>> = {
    ...((next['by_dest'] as Record<string, Record<string, unknown>> | undefined) ?? {}),
  }
  const destObj: Record<string, unknown> = { ...(byDest[destination] ?? {}) }
  if (value === null || value === undefined || value === '') {
    destObj[key] = null // 명시적 비움 sentinel
  } else {
    destObj[key] = value
  }
  byDest[destination] = destObj
  next['by_dest'] = byDest
  return next
}

/**
 * 탭(신고·서류·검사)에서 케이스 한 줄이 대표할 "활성 목적지" 해석.
 *
 * 우선순위:
 *   1. data[overrideKey] (사용자가 칩으로 고른 값) — 유효한 목적지일 때만.
 *   2. 출국일(by_dest 우선)이 입력된 첫 목적지 — 다중 목적지에서 자연스러운 기본.
 *   3. 첫 목적지.
 *
 * DestinationCell(칩 표시)과 todos 탭의 날짜 읽기(flatten)가 동일 목적지를 쓰도록
 * 공용 — 칩과 표시 데이터가 어긋나지 않게 한다. 단일 목적지면 그 목적지.
 */
export function resolveTabActiveDest(
  caseRow: Pick<CaseRow, 'destination' | 'data' | 'departure_date'>,
  overrideKey: string,
): string | null {
  const dests = parseDestinations(caseRow.destination)
  if (dests.length === 0) return null
  const data = (caseRow.data as Record<string, unknown> | null) ?? {}
  const override = data[overrideKey]
  if (typeof override === 'string' && dests.includes(override)) return override
  const withDeparture = dests.find((d) => !!getDepartureDate(caseRow, d))
  return withDeparture ?? dests[0]
}

/**
 * 활성 목적지 기준 출국일.
 * by_dest 우선. 단일/legacy 는 `cases.departure_date` 컬럼 fallback.
 * 다중 목적지 + 그 목적지가 by_dest 로 관리되면 컬럼 fallback 안 함 — 컬럼은 단일값이라 어느
 * 목적지 것인지 모호하고, 새 목적지가 다른 목적지 출국일을 컬럼으로 물려받는 누수를 막는다(B).
 */
export function getDepartureDate(
  caseRow: Pick<CaseRow, 'data' | 'departure_date' | 'destination'>,
  destination: string | null | undefined,
): string | null {
  const data = caseRow.data as Record<string, unknown> | null
  const v = readByDestValue(data, destination, 'departure_date')
  if (typeof v === 'string' && v) return v
  // 다중 목적지 + 특정 목적지 지정 → by_dest 만 신뢰. 컬럼 fallback 안 함(엔트리 유무 무관) — 누수 차단(B).
  if (destination && parseDestinations(caseRow.destination).length > 1) return null
  return caseRow.departure_date ?? null
}

/**
 * 활성 목적지 기준 내원일 (= 증명서 발급일).
 * by_dest 우선. 단일/legacy 는 `data.vet_visit_date`(top-level) fallback.
 * 다중 목적지 + 그 목적지가 by_dest 로 관리되면 top-level fallback 안 함 — 다른 목적지의
 * top-level 잔존 내원일을 새 목적지가 물려받는 누수를 막는다(B).
 */
export function getVetVisitDate(
  caseRow: Pick<CaseRow, 'data' | 'destination'>,
  destination: string | null | undefined,
): string | null {
  const data = (caseRow.data as Record<string, unknown> | null) ?? null
  const v = readByDestValue(data, destination, 'vet_visit_date')
  if (typeof v === 'string' && v) return v
  // 다중 목적지 + 특정 목적지 지정 → by_dest 만 신뢰. top-level fallback 안 함 — 누수 차단(B).
  if (destination && parseDestinations(caseRow.destination).length > 1) return null
  const top = data?.['vet_visit_date']
  return typeof top === 'string' && top ? top : null
}

/**
 * 활성 목적지 기준으로 케이스를 "평탄화" — `data.by_dest[destination]` 의 destination-scoped
 * 값을 top-level 로 덮어쓴 새 CaseRow 반환 (immutable). PDF·자동채움 등 단일값을 가정하는
 * legacy 경로가 다중 목적지 케이스에서도 활성 목적지 기준으로 동작하도록 입력 전처리에 사용.
 *
 * - departure_date 컬럼: by_dest[dest].departure_date 가 있으면 그 값으로 교체 (null sentinel
 *   이면 컬럼도 null).
 * - data 의 각 scoped key: by_dest[dest][key] 가 있으면 (null 포함) 그 값으로 교체.
 * - by_dest 키 자체는 결과 data 에서 제거 (legacy 경로는 모르기 때문).
 * - destination 미지정 또는 by_dest 없음: caseRow 그대로 반환.
 */
export function flattenCaseForDestination<T extends CaseRow>(
  caseRow: T,
  destination: string | null | undefined,
): T {
  if (!destination) return caseRow
  const data = (caseRow.data as Record<string, unknown> | null) ?? {}
  const byDest = data['by_dest'] as Record<string, Record<string, unknown>> | undefined
  const destObj = byDest?.[destination]
  const isMulti = parseDestinations(caseRow.destination).length > 1
  // 단일/legacy + by_dest 엔트리 없음: top-level/컬럼 그대로(누수 상대 없음). 다중은 엔트리가
  // 없어도 strict 처리(아래) — 컬럼/top-level 잔존을 물려받지 않게.
  if (!isMulti && !destObj) return caseRow
  const nextData: Record<string, unknown> = { ...data }
  delete nextData['by_dest']
  let nextDeparture = caseRow.departure_date
  if (isMulti) {
    // 다중 목적지: scoped 키는 by_dest[dest] 만 신뢰. top-level/컬럼 잔존은 다른 목적지(또는 단일
    // 시절) 것일 수 있으므로 무시 — 누수 차단(B). 엔트리 자체가 없으면 전부 미입력으로 비운다.
    const obj = destObj ?? {}
    for (const k of DESTINATION_SCOPED_FIELD_KEYS) {
      if (k === 'departure_date') continue
      const has = Object.prototype.hasOwnProperty.call(obj, k)
      const v = has ? obj[k] : undefined
      if (!has || v === null || v === undefined) delete nextData[k]
      else nextData[k] = v
    }
    nextDeparture =
      typeof obj['departure_date'] === 'string' && obj['departure_date']
        ? (obj['departure_date'] as string)
        : null
  } else {
    // 단일/legacy: destObj 에 있는 키만 덮어쓰고 나머지는 top-level/컬럼 유지 (누수 상대가 없고,
    // 마이그 전·부분 by_dest 상태에서도 호환). null sentinel → 명시적 비움.
    for (const k of Object.keys(destObj as Record<string, unknown>)) {
      if (!DESTINATION_SCOPED_FIELD_KEYS.has(k)) continue
      const v = (destObj as Record<string, unknown>)[k]
      if (k === 'departure_date') {
        nextDeparture = typeof v === 'string' && v ? v : null
      } else {
        if (v === null || v === undefined) delete nextData[k]
        else nextData[k] = v
      }
    }
  }
  return { ...caseRow, departure_date: nextDeparture, data: nextData }
}
