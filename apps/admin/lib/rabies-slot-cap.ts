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
}
