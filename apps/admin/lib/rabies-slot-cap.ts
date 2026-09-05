/**
 * Form 별 dedicated 광견병 슬롯 수.
 *
 * 광견병 접종이 슬롯 수보다 많으면 사용자가 모달에서 어떤 접종을 인쇄할지
 * 선택한다. 선택된 접종 중 최근 N개가 dedicated 슬롯(빠른 순)에 들어가고,
 * 나머지 선택분은 "기타 예방접종" 칸에 최근 순으로 기재된다.
 * 선택하지 않은 접종은 증명서에 기재되지 않는다.
 *
 * 다른 form 은 광견병 선택 모달 미지원 (모든 접종이 기존 로직대로 처리).
 */
export const RABIES_SLOT_CAP: Record<string, number> = {
  Form25: 3,
  Form25AuNz: 2,
  FormRE: 2,
  FormAC: 6,
}

/**
 * 모달을 띄우는 **최소 접종 수**. 미지정이면 slot cap + 1 = "슬롯에 다 안 들어갈 때".
 *
 * Form AC 만 예외로 명시한다 — 슬롯이 6개라 '넘칠 때' 규칙으로는 사실상 열리지 않는다
 * (운영 일본 케이스 570건 최대 4회, 2026-09-05 확인). Form AC 는 "다 안 들어가서"가 아니라
 * "다 들어가지만 골라 찍으려고" 여는 모달이라 별지25(일본)와 같은 4건으로 맞췄다.
 */
const RABIES_PICK_MIN: Record<string, number> = {
  FormAC: 4,
}

/** 이 form 에서 광견병 선택 모달을 띄울 최소 접종 수. cap 이 없으면 null(모달 미지원). */
export function rabiesPickMin(formKey: string): number | null {
  const cap = RABIES_SLOT_CAP[formKey]
  if (cap === undefined) return null
  return RABIES_PICK_MIN[formKey] ?? cap + 1
}

/**
 * 선택분이 넘쳤을 때 "기타 예방접종" 칸으로 흘릴 수 있는 서식인가.
 * Form AC 는 그 칸이 없어(rabies1~6 + titer1~2 뿐) 선택하지 않은 접종은 그냥 빠진다.
 */
export function hasRabiesOverflowSlot(formKey: string): boolean {
  return formKey !== 'FormAC'
}
