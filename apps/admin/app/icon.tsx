import { ImageResponse } from 'next/og'
import fs from 'node:fs/promises'
import path from 'node:path'

// 일반 favicon / Android home screen 아이콘 (purpose: 'any').
// 단일 모노그램 — PMW (작은 사이즈 가독성 우선). Alonzo ExtraLight + faux bold.
// public/icon.svg 가 SVG 버전이지만, 일부 구형 Android Chrome 은 PNG 만 지원.
// Next.js 가 빌드 타임에 PNG 로 생성하고 <link rel="icon"> 자동 주입.
export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default async function Icon() {
  const fontData = await fs.readFile(
    path.join(process.cwd(), 'public/fonts/Alonzo-ExtraLight.otf'),
  )
  return new ImageResponse(
    (
      <div
        style={{
          background: '#A56D54',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#F5F4ED',
          fontFamily: 'Alonzo',
          borderRadius: 36,
        }}
      >
        <div style={{ fontSize: 92, letterSpacing: 2, fontWeight: 700, lineHeight: 1 }}>PMW</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Alonzo', data: fontData, weight: 700 }],
    },
  )
}
