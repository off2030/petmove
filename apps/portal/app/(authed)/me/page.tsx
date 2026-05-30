'use client'

import { SettingsHubView } from '@/components/me/settings-hub-view'

/**
 * 설정 탭 (/me) — bottom-nav 의 '설정' 탭이 여기로 도착.
 * 6 메뉴 리스트 → /me/{guardian,animal,travel,vet,agency,account}.
 * (이전엔 ProfileView 가 마운트됐으나 정보 페이지와 통합되면서 hub 로 전환.)
 */
export default function MePage() {
  return <SettingsHubView />
}
