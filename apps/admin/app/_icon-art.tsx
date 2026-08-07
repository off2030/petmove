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
 *
 * ⚠️ maskable 에 scale 을 걸지 말 것 (2026-08-07 제거 — 안드로이드 홈화면에서 아이콘이
 *   깨져 보인다는 제보로 발견). 구름은 **캔버스 밖으로 흘러넘치게** 설계돼 있다: 바닥
 *   rect(y160~200)와 왼쪽 원(cx46 cy168 r52 → 아래끝 y220)이 가장자리를 물고 나간다.
 *   여기에 scale(0.75) 를 걸면 흘러넘침까지 같이 줄어 rect 는 y175 에서 끊기고 왼쪽 원만
 *   y190 까지 내려와, **구름 아래에 흰 띠가 뜨고 왼쪽에 계단 단차**가 생긴다.
 *   P 는 원래 크기에서도 안전영역(중앙 지름 80% 원 = r80) 안에 있다 — 가장 먼 점이 중심에서
 *   약 62 라 여유가 충분하므로 줄일 이유가 없다. 펫무브(portal) public/icon-maskable.svg 도
 *   scale 없이 full-bleed 다 — 두 앱을 일치시킨다.
 */
function brandSvg(rounded: boolean): string {
  const rx = rounded ? ' rx="46"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`
    + `<defs>`
    + `<clipPath id="sq"><rect width="200" height="200"${rx}/></clipPath>`
    + `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#63C9FF"/><stop offset="1" stop-color="#0BAEFF"/>`
    + `</linearGradient>`
    + `</defs>`
    + `<g clip-path="url(#sq)">`
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
    + `</g></svg>`
}

/** 브랜드 아이콘 PNG (ImageResponse). rounded=false → full-bleed (apple-touch / maskable). */
export function brandIconResponse(px: number, rounded = true) {
  const dataUri = `data:image/svg+xml;base64,${btoa(brandSvg(rounded))}`
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
