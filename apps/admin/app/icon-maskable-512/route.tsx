import { ImageResponse } from 'next/og'
import fs from 'node:fs/promises'
import path from 'node:path'

// 512x512 maskable PWA 아이콘 — Android 적응형 (둥근/사각/물방울 등 자유 crop).
// 안전영역 (중앙 80%) 안에 PETMOVE/Work, 가장자리 full-bleed 갈색.
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
        }}
      >
        {/* 안전영역(중앙 80% ≈ 410px) 안에 들어가도록 폰트 크기 조정. */}
        <div style={{ fontSize: 80, letterSpacing: 3, fontWeight: 700, lineHeight: 1 }}>PETMOVE</div>
        <div style={{ fontSize: 40, letterSpacing: 12, fontWeight: 700, lineHeight: 1, marginTop: 10, paddingLeft: 12 }}>Work</div>
      </div>
    ),
    {
      width: 512,
      height: 512,
      fonts: [{ name: 'Alonzo', data: fontData, weight: 700 }],
    },
  )
}
