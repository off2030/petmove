'use client'

import { SettingsView } from '@/components/settings/settings-view'

/**
 * 앱 설정 (/settings) — 상단바 ⚙ 아이콘이 여기로 도착.
 * 화면(테마)·계정·약관·개인정보·문의·앱정보. 등록 데이터(보호자·반려동물 등)는 /me.
 */
export default function SettingsPage() {
  return <SettingsView />
}
