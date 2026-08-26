/**
 * 여러 마리를 **한 장에** 담는 증명서 폼 키.
 *
 * 이 목록에 들어가면 발급 버튼이 단일 케이스가 아니라 형제 케이스 묶음
 * (같은 보호자·여행지·출국일/내원일 — `fetchSiblings`)으로 동작한다:
 * `previewSiblings` → 선택 다이얼로그 → `fillPdfMulti`(용량 초과 시 여러 장으로 분할).
 *
 * 실제 한 장에 몇 마리가 들어가는지는 `pdf-fill.ts` 의 `FORM_CAPACITY` 가 단일 출처다.
 *
 * ⛔ 이 유니온을 여기저기 다시 적지 말 것 — 예전엔 같은 목록이 서버 액션·API 라우트·
 *   다이얼로그·다운로드 헬퍼에 네 번 복사돼 있어서 폼을 하나 추가할 때마다 네 곳이
 *   따로 놀았다(태국 R.1/1 추가 때 정리, 2026-08-24).
 */
export type MultiFormKey = 'AnnexIII' | 'UK' | 'NZ' | 'VBC' | 'Form_R11'

/** 한 장(문서)에 담을 수 있는 동물 수 / 백신 행 수. */
export interface FormCapacity { animals: number; vaccRows: number }

/**
 * 폼별 한 장 용량 — **단일 출처**.
 *
 * 여기 없는 폼(VBC — 동물 테이블이 없어 제한 없음)은 몇 마리든 한 장에 들어간다.
 * 실제 분할은 `pdf-fill.ts` 의 `packCases`, 장수 미리보기는 서버 액션의
 * `simulatePackCount` 과 발급 다이얼로그가 이 표를 **함께** 본다 — 예전엔 같은 숫자가
 * 세 곳에 복사돼 있어 폼을 추가하면 미리보기 장수와 실제 발급 장수가 어긋났다.
 *
 * ⚠️ 이 파일은 client 컴포넌트도 import 한다 — 서버 전용 모듈(pdf-lib·fs)을 끌어오지 말 것.
 */
export const FORM_CAPACITY: Record<string, FormCapacity | undefined> = {
  AnnexIII: { animals: 3, vaccRows: 5 },
  UK:       { animals: 5, vaccRows: 5 },
  // NZ 인증서는 (10)/(11)/(12)... 의 백신/검사 행이 동물별이 아니라 인증서당 1개씩만
  // 있어서 packer 의 vaccRows 제약이 의미 없다. 큰 값으로 두면 동물 5마리까지 한
  // 인증서에 채워진다 (Cert A p1 5-row table + Cert B (4) 의 multi-line microchip 목록).
  NZ:       { animals: 5, vaccRows: 9999 },
  NZ_2:     { animals: 5, vaccRows: 9999 },
  // 태국 수입허가 신청서 R.1/1 — 양식에 동물 칸이 좌·우 **두 개**뿐이다. 백신/검사 행이
  // 없는 양식이라 vaccRows 제약은 의미가 없어 크게 둔다(NZ 와 같은 이유).
  // 3마리면 2장(2+1), 5마리면 3장(2+2+1) 으로 자동 분할된다.
  Form_R11: { animals: 2, vaccRows: 9999 },
}
