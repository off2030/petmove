/**
 * OpenAI 모델을 한 곳에서 관리한다.
 *
 * 추출 작업별로 모델이 달라 두 개의 상수를 내보낸다:
 *
 *   EXTRACTION_MODEL      — 단일 필드 추출 (항공/백신/주소)
 *                           env: OPENAI_MODEL 로 오버라이드
 *
 *   DROP_CREATE_MODEL     — 고객 리스트 드롭/페이스트로 새 케이스 만들 때 사용.
 *                           여러 문서에서 식별자·고객·항공 정보까지 한 번에 뽑아야 하므로
 *                           더 강한 모델 사용.
 *                           env: OPENAI_DROP_MODEL 로 오버라이드
 *
 * 사용 가능한 vision + structured outputs 모델 예:
 *   - gpt-4o-mini   (저렴, 기본값)
 *   - gpt-4o
 *   - gpt-4.1-mini
 *   - gpt-4.1       (정확도 최상, 가격 ↑)
 */

const DEFAULT_EXTRACTION_MODEL = 'gpt-4o-mini'
const DEFAULT_DROP_CREATE_MODEL = 'gpt-4o-mini'

/** 항공/백신/주소 등 개별 필드 추출용 모델. */
export const EXTRACTION_MODEL =
  process.env.OPENAI_MODEL?.trim() || DEFAULT_EXTRACTION_MODEL

/** 고객 리스트 드롭/페이스트 → 새 케이스 생성 때 사용하는 고정밀 모델. */
export const DROP_CREATE_MODEL =
  process.env.OPENAI_DROP_MODEL?.trim() || DEFAULT_DROP_CREATE_MODEL
