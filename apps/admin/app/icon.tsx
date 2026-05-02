import { ImageResponse } from 'next/og'

// 일반 favicon / Android home screen 아이콘 (purpose: 'any').
// public/icon.svg 가 SVG 버전이지만, 일부 구형 Android Chrome 은 PNG 만 지원.
// Next.js 가 빌드 타임에 PNG 로 생성하고 <link rel="icon"> 자동 주입.
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
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
          fontSize: 110,
          fontWeight: 500,
          fontFamily: 'Georgia, serif',
          borderRadius: 36,
        }}
      >
        P
      </div>
    ),
    { ...size },
  )
}
