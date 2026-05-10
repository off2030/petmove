import { ImageResponse } from 'next/og'
import fs from 'node:fs/promises'
import path from 'node:path'

// 512x512 PWA 아이콘 (purpose: 'any') — 큰 디스플레이 / splash screen 용.
// 192x192 은 Android Chrome 의 일반 홈 화면 아이콘에 충분하지만 splash, app drawer
// 일부 OEM 에선 더 큰 사이즈를 요구한다. manifest 에 두 사이즈 다 등록해 OEM 이 알아서 선택.
export const runtime = 'nodejs'

export async function GET() {
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
          borderRadius: 96,
        }}
      >
        <div style={{ fontSize: 248, letterSpacing: 6, fontWeight: 700, lineHeight: 1 }}>PMW</div>
      </div>
    ),
    {
      width: 512,
      height: 512,
      fonts: [{ name: 'Alonzo', data: fontData, weight: 700 }],
    },
  )
}
