import { brandIconResponse } from '../_icon-art'

// 512x512 PWA 아이콘 (purpose: 'any') — splash / app drawer 용. 새 브랜드 '떠오르는 P'.
export const runtime = 'nodejs'

export function GET() {
  return brandIconResponse(512)
}
