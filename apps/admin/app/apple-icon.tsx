import { ImageResponse } from 'next/og'

// iOS "홈 화면에 추가" 시 사용되는 apple-touch-icon.
// 빌드 타임에 PNG 로 생성되어 <link rel="apple-touch-icon"> 자동 주입.
// public/icon.svg 와 동일한 브랜드 — 갈색 배경 + 크림색 P.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#A56D54',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F5F4ED',
          fontSize: 100,
          fontWeight: 500,
          fontFamily: 'Georgia, serif',
        }}
      >
        P
      </div>
    ),
    { ...size },
  )
}
