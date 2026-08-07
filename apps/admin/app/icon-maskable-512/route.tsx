import { brandIconResponse } from '../_icon-art'

// 512 maskable PWA 아이콘 — Android 적응형. full-bleed 하늘 + 안전영역에 떠오르는 P.
export const runtime = 'nodejs'

export function GET() {
  // 축소 금지 — 구름이 가장자리를 물고 나가는 full-bleed 설계라 줄이면 단차가 생긴다(_icon-art.tsx ⚠️).
  return brandIconResponse(512, false)
}
