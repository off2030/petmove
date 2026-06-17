import { ribbonIconResponse } from '../_icon-art'

// 512 maskable PWA 아이콘 — Android 적응형. full-bleed 버건디 + 안전영역 리본P.
export const runtime = 'nodejs'

export function GET() {
  return ribbonIconResponse(512, false)
}
