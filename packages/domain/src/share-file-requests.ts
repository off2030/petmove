/**
 * 정보 요청 링크의 목적지별 파일 첨부 요청 정의 (단일 출처).
 *
 * - required=true(필수): 그 목적지면 항상 요청. 링크에 자동 포함.
 * - required=false(선택): 운영자가 링크 만들 때 켜고/끌 수 있음.
 *
 * 링크에는 요청된 파일의 key 배열(case_share_links.file_request_keys)만 저장하고,
 * 라벨·필수여부는 매번 이 정의로 되살린다(설정이 바뀌어도 화면이 함께 따라옴).
 * client(관리자 다이얼로그·고객 폼)·server(업로드 액션) 공용이라 순수 상수만 export.
 */
import { parseDestinations } from './destination-config'

export interface ShareFileRequestDef {
  /** 저장·전송용 안정 key. */
  key: string
  /** 표시 이름 (관리자·고객·첨부 파일명에 사용). */
  label: string
  /** true=필수(항상), false=선택(운영자 토글). */
  required: boolean
  /** 적용 목적지 (한글 라벨 배열) 또는 'all'(모든 목적지). */
  destinations: string[] | 'all'
  /** 제외 목적지 — 'all' 이어도 여기 목적지는 요청 안 함 (예: 구충 증명서는 일본 불필요). */
  excludeDestinations?: string[]
}

export const SHARE_FILE_REQUESTS: ShareFileRequestDef[] = [
  // 필수 — 목적지별
  { key: 'jp_carrier_photo', label: '이동 가방 사진', required: true, destinations: ['일본'] },
  { key: 'pet_photo', label: '반려동물 사진', required: true, destinations: ['태국', '필리핀'] },
  { key: 'passport_photo', label: '여권 사진', required: true, destinations: ['태국'] },
  { key: 'flight_itinerary', label: '항공 일정표 또는 항공권', required: true, destinations: ['태국'] },
  // 선택 — 상황에 따라
  { key: 'jp_export_cert', label: '일본 수출 동물검역증', required: false, destinations: ['일본'] },
  // 구충은 필리핀만 해당 — 필리핀은 '타병원 접종 및 구충 증명서'로 통일, 그 외는 '타병원 접종 증명서'.
  { key: 'other_hospital_vaccine', label: '타병원 접종 증명서', required: false, destinations: 'all', excludeDestinations: ['필리핀'] },
  { key: 'other_hospital_deworming', label: '타병원 접종 및 구충 증명서', required: false, destinations: ['필리핀'] },
]

const BY_KEY = new Map(SHARE_FILE_REQUESTS.map((r) => [r.key, r]))

export function shareFileRequestByKey(key: string): ShareFileRequestDef | undefined {
  return BY_KEY.get(key)
}

/** 목적지(콤마 구분 가능)에 해당하는 파일 요청 목록 — destinations 매칭 또는 'all'. 정의 순서 유지. */
export function shareFileRequestsForDestination(
  destination: string | null | undefined,
): ShareFileRequestDef[] {
  const tokens = parseDestinations(destination)
  return SHARE_FILE_REQUESTS.filter((r) => {
    if (r.excludeDestinations?.some((d) => tokens.includes(d))) return false
    if (r.destinations === 'all') return true
    return r.destinations.some((d) => tokens.includes(d))
  })
}
