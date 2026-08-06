/** 정보 요청 링크 발급 시 빠른 선택용 사용자 정의 프리셋 — 조직 단위 저장. */
export interface SharePreset {
  /** 클라이언트 생성 UUID */
  id: string
  /** 표시 라벨 */
  name: string
  /** 선택할 필드 키 배열 — 컬럼·data·EXTRA·합성(__rabies 등) 모두 가능 */
  field_keys: string[]
  /**
   * 함께 요청할 파일 슬롯 키(SHARE_FILE_REQUESTS.key). 2026-08-06 추가 —
   * 프리셋 하나로 필드+파일을 같이 고르기 위함. 옛 프리셋은 없으므로 optional.
   */
  file_keys?: string[]
}
