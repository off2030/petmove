import { brandIconResponse } from '../_icon-art'

// 512 maskable PWA 아이콘 — Android 적응형. full-bleed 하늘 + 안전영역에 떠오르는 P.
export const runtime = 'nodejs'

export function GET() {
  // 0.75 — 런처 crop/확대 보정해 P 에 여백(펫무브 네이티브 아이콘과 크기 통일).
  return brandIconResponse(512, false, 0.75)
}
