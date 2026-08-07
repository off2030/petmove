import { brandIconResponse } from '../_icon-art'

// 192 maskable (Android 적응형 — 둥근/사각/물방울 자유 crop). full-bleed 하늘 +
// 안전영역(중앙 80%) 안에 떠오르는 P. manifest.ts 에서 purpose:'maskable' 로 명시 등록.
export const runtime = 'nodejs'

export function GET() {
  // 축소 금지 — 구름이 가장자리를 물고 나가는 full-bleed 설계라 줄이면 단차가 생긴다(_icon-art.tsx ⚠️).
  return brandIconResponse(192, false)
}
