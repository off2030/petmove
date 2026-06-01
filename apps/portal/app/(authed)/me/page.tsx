'use client'

import { SettingsHubView } from '@/components/me/settings-hub-view'

/**
 * 내 정보 탭 (/me) — bottom-nav 의 '내 정보' 탭이 여기로 도착.
 * 등록 데이터 리스트 → /me/{guardian,animal,travel,vet,agency,account}.
 * (앱 설정(계정·테마·약관·문의 등)은 상단바 ⚙ → /settings 로 분리.)
 */
export default function MePage() {
  return <SettingsHubView />
}
