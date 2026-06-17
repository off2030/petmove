import { ribbonIconResponse } from './_icon-art'

// iOS "홈 화면에 추가" apple-touch-icon. 리본P 버건디. full-bleed (iOS 가 자체 마스킹).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return ribbonIconResponse(180, false)
}
