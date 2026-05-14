/**
 * 보호자 셸 — 마지막으로 본 케이스 ID 보관.
 *
 * /me (case-외) 같은 화면에서 일정/서류/정보 탭으로 복귀할 때 어떤 케이스로
 * 돌아갈지 결정하기 위해 sessionStorage 에 보관. swipe-tabs / bottom-nav 가 공유.
 */
export const LAST_CASE_KEY = 'pm.last-case-id'

export function readLastCaseId(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_CASE_KEY)
  } catch {
    return null
  }
}

export function writeLastCaseId(caseId: string): void {
  try {
    window.sessionStorage.setItem(LAST_CASE_KEY, caseId)
  } catch {
    /* ignore */
  }
}
