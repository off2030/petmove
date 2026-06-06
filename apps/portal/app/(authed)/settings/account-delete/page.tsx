'use client'

import { AccountDeleteView } from '@/components/settings/account-delete-view'

/**
 * 계정 삭제 (/settings/account-delete) — 설정 > 계정 삭제 진입.
 * 7일 유예. 확인 모달 → requestAccountDeletion. 유예 중이면 D-day + 취소 버튼.
 */
export default function AccountDeletePage() {
  return <AccountDeleteView />
}
