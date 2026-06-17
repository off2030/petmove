import { ribbonIconResponse } from './_icon-art'

// favicon / Android 홈 화면 아이콘 (purpose: 'any'). 리본P 버건디 (둥근 사각).
// Next.js 가 빌드 타임에 PNG 로 생성하고 <link rel="icon"> 자동 주입.
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
  return ribbonIconResponse(192)
}
