import { ImageResponse } from 'next/og'

/**
 * 펫무브워크 앱 아이콘 아트 — 리본P (펫무브와 같은 모양, 색만 다름).
 *   펫무브(portal) = amber, 펫무브워크 = editorial 버건디.
 * favicon/PWA PNG 라우트(icon·apple-icon·icon-512·icon-maskable·icon-maskable-512)가 공용.
 * 폰트 의존성 0 — 리본은 vector path.
 */
const BG = '#7A2E2E' // editorial 버건디 (primary)
const FG = '#F4EDE0' // cream

function ribbonSvg(rounded: boolean): string {
  const rx = rounded ? ' rx="22.5"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"${rx} fill="${BG}"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="${FG}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

/** 리본P 아이콘 PNG (ImageResponse). rounded=false → full-bleed (apple-touch / maskable). */
export function ribbonIconResponse(px: number, rounded = true) {
  const dataUri = `data:image/svg+xml;base64,${btoa(ribbonSvg(rounded))}`
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={px} height={px} alt="" />
      </div>
    ),
    { width: px, height: px },
  )
}
