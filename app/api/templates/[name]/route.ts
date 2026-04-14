import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'

const TEMPLATE_DIR = path.join(process.cwd(), 'data', 'pdf-templates')

// 허용 파일명 화이트리스트 — 디렉토리 트래버설 방지
const ALLOWED = new Set([
  '한국.pdf',
  'ID.pdf',
  '유럽.pdf',
  '영국.pdf',
  'FormAC.pdf',
  '한국_renamed.pdf',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name: rawName } = await params
  const name = decodeURIComponent(rawName)

  if (!ALLOWED.has(name)) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const buf = await readFile(path.join(TEMPLATE_DIR, name))
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
