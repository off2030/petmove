// 동시수정 충돌 안내 — 편집 hook 들이 공유하는 단일 출처 카피·동작.
// updateCaseInfoFields 가 conflict 결과를 주면 호출한다.

/** useConfirm() 이 돌려주는 함수와 구조적으로 호환되는 최소 타입. */
type ConfirmFn = (input: {
  message: string
  description?: string
  okLabel?: string
  okOnly?: boolean
}) => Promise<boolean>

/**
 * '내용이 바뀌었어요' 단일버튼 팝업을 띄우고, 누르면 페이지를 새로고침해
 * DB 최신값으로 폼을 다시 채운다(미반영 입력은 버려지고 다시 입력하게 됨).
 * 충돌은 같은 칸을 그 사이 다른 곳에서 다르게 바꾼 드문 경우에만 발생한다.
 */
export async function showConflictNotice(confirm: ConfirmFn): Promise<void> {
  await confirm({
    message: '내용이 바뀌었어요',
    description:
      '다른 곳에서 정보가 수정되어, 방금 저장은 반영되지 않았어요. 최신 내용을 불러와 다시 입력하세요.',
    okLabel: '최신 내용 불러오기',
    okOnly: true,
  })
  window.location.reload()
}
