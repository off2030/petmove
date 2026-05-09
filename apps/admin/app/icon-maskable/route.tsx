import { ImageResponse } from 'next/og'
import fs from 'node:fs/promises'
import path from 'node:path'

// Android 적응형 아이콘 (manifest purpose: 'maskable') — full-bleed 배경 + 안전영역
// (중앙 80%) 안에 로고. Android OEM 별로 둥근/사각/물방울/teardrop 등으로 자유 crop
// 하므로 가장자리는 잘려도 OK.
//
// 빌드 타임에 PNG 생성. ImageResponse 의 fonts 옵션으로 Alonzo OTF 임베드 →
// 글자가 픽셀로 박혀 Android Chrome 의 background 변환기 의존성 0.
//
// `app/icon-maskable.tsx` 는 Next.js metadata file convention 이 아니므로 자동
// manifest 등록 X. 따라서 route handler 로 만들고 manifest.ts 에서 명시적으로 등록.
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
        {/* 안전영역 안에 들어가도록 사이즈 한 단계 작게. */}
        <div style={{ fontSize: 30, letterSpacing: 1, fontWeight: 700, lineHeight: 1 }}>PETMOVE</div>
        <div style={{ fontSize: 15, letterSpacing: 4, fontWeight: 700, lineHeight: 1, marginTop: 4, paddingLeft: 4 }}>Work</div>
      </div>
    ),
    {
      width: 192,
      height: 192,
      fonts: [{ name: 'Alonzo', data: fontData, weight: 700 }],
    },
  )
}
