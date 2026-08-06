import { brandIconResponse } from './_icon-art'

// favicon / Android 홈 화면 아이콘 (purpose: 'any'). 새 브랜드 '떠오르는 P' (둥근 사각).
// Next.js 가 빌드 타임에 PNG 로 생성하고 <link rel="icon"> 자동 주입.
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
  return brandIconResponse(192)
}
