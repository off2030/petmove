import { ImageResponse } from 'next/og'
import fs from 'node:fs/promises'
import path from 'node:path'

// iOS "홈 화면에 추가" 시 사용되는 apple-touch-icon.
// 빌드 타임에 PNG 로 생성되어 <link rel="apple-touch-icon"> 자동 주입.
// 단일 모노그램 — PMW (작은 사이즈 가독성 우선). Alonzo ExtraLight + faux bold.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
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
        }}
      >
        <div style={{ fontSize: 86, letterSpacing: 2, fontWeight: 700, lineHeight: 1 }}>PMW</div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Alonzo', data: fontData, weight: 700 }],
    },
  )
}
