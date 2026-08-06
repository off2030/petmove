import { ImageResponse } from 'next/og'

/**
 * 펫무브워크 앱 아이콘 아트 — 새 브랜드 '떠오르는 P' (하늘·구름).
 *
 * 2026-08-06 교체: 이전에는 구 브랜드 '리본P 버건디'라 상단바 로고만 새 브랜드로 바뀌고
 * 브라우저 탭 아이콘은 계속 옛 아이콘이 떴다.
 * 아트웍 원본 = docs/brand/logo-rising-p1-transparent.svg
 * (상단바 컴포넌트: components/layout/brand-logo-mark.tsx — 같은 path 를 씀)
 *
 * favicon/PWA PNG 라우트(icon·apple-icon·icon-512·icon-maskable·icon-maskable-512)가 공용.
 * 폰트 의존성 0 — 전부 vector.
 */

/**
 * @param rounded 둥근 사각 마스크. false 면 full-bleed (apple-touch / maskable — OS 가 자체 마스킹).
 * @param scale 1=원본. maskable 은 런처가 가장자리를 crop 하므로 줄여서(예 0.75) 여백을 둔다.
 */
function brandSvg(rounded: boolean, scale = 1): string {
  const rx = rounded ? ' rx="46"' : ''
  const open = scale !== 1 ? `<g transform="translate(100 100) scale(${scale}) translate(-100 -100)">` : ''
  const close = scale !== 1 ? '</g>' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
    + `<defs>`
    + `<clipPath id="sq"><rect width="200" height="200"${rx}/></clipPath>`
    + `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#63C9FF"/><stop offset="1" stop-color="#0BAEFF"/>`
    + `</linearGradient>`
    + `</defs>`
    + `<g clip-path="url(#sq)">${open}`
    + `<rect width="200" height="200" fill="url(#sky)"/>`
    // 떠오르는 P — 구름보다 먼저 그려 구름 언덕 뒤로 가려진다.
    + `<path d="M116 132 L116 82 A6 6 0 0 1 122 76 L128 76 A15 15 0 0 1 128 106 L118 106" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<rect x="0" y="160" width="200" height="40" fill="#ffffff"/>`
    + `<circle cx="46" cy="168" r="52" fill="#ffffff"/>`
    + `<circle cx="72" cy="120" r="48" fill="#ffffff"/>`
    + `<circle cx="112" cy="148" r="34" fill="#ffffff"/>`
    + `<circle cx="146" cy="138" r="38" fill="#ffffff"/>`
    + `<circle cx="178" cy="154" r="24" fill="#ffffff"/>`
    // 비침 기둥 — 구름에 가린 구간을 34% 투명으로 겹쳐 빛이 배어나는 느낌.
    + `<path d="M116 132 L116 118" fill="none" stroke="#FFC93C" stroke-width="18" stroke-linecap="round" opacity="0.34"/>`
    + `${close}</g></svg>`
}

/** 브랜드 아이콘 PNG (ImageResponse). rounded=false → full-bleed (apple-touch / maskable). */
export function brandIconResponse(px: number, rounded = true, scale = 1) {
  const dataUri = `data:image/svg+xml;base64,${btoa(brandSvg(rounded, scale))}`
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
