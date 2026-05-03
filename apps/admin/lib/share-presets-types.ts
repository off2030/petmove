/** 공유 링크 발급 시 빠른 선택용 사용자 정의 프리셋 — 조직 단위 저장. */
export interface SharePreset {
  /** 클라이언트 생성 UUID */
  id: string
  /** 표시 라벨 */
  name: string
  /** 선택할 필드 키 배열 — 컬럼·data·EXTRA·합성(__rabies 등) 모두 가능 */
  field_keys: string[]
}
