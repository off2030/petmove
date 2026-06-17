import { ribbonIconResponse } from '../_icon-art'

// 512x512 PWA 아이콘 (purpose: 'any') — splash / app drawer 용. 리본P 버건디.
export const runtime = 'nodejs'

export function GET() {
  return ribbonIconResponse(512)
}
