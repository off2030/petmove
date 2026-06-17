import { ribbonIconResponse } from '../_icon-art'

// 192 maskable (Android 적응형 — 둥근/사각/물방울 자유 crop). full-bleed 버건디 +
// 안전영역(중앙 80%) 안에 리본P. manifest.ts 에서 purpose:'maskable' 로 명시 등록.
export const runtime = 'nodejs'

export function GET() {
  return ribbonIconResponse(192, false)
}
