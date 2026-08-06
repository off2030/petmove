import { brandIconResponse } from './_icon-art'

// iOS "홈 화면에 추가" apple-touch-icon. 새 브랜드 '떠오르는 P'. full-bleed (iOS 가 자체 마스킹).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return brandIconResponse(180, false)
}
