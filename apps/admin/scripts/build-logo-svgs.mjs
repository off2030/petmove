// PETMOVE / Work 워드마크를 SVG path 로 변환해서 public/logo/ + public/icon{*}.svg
// 들을 재생성. opentype.js 가 OTF 의 글리프를 베지어 path 로 추출한다.
//
// 결과 SVG 는 폰트 의존성 0 — 어떤 렌더러에서도 동일하게 그려진다 (Android Chrome 의
// PWA 아이콘 변환기 포함). 한번 실행 후 결과 파일을 커밋한다.
//
// 실행: node apps/admin/scripts/build-logo-svgs.mjs
//
// 디자인 spec:
//   배경 brown #A56D54, 글자 cream #F5F4ED. 둥근 사각 (rx=96 in 512 viewBox), 또는
//   full-bleed (maskable). 봇 아바타는 원형 (rx=256). PETMOVE / Work 두 줄 또는
//   PMW 한 줄 (봇 아바타).
import opentype from 'opentype.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..') // apps/admin

const FONT_PATH = path.join(ROOT, 'public/fonts/Alonzo-ExtraLight.otf')
const OUT_DIR_LOGO = path.join(ROOT, 'public/logo')
const OUT_DIR_PUBLIC = path.join(ROOT, 'public')

const COLOR_BG = '#A56D54'
const COLOR_FG = '#F5F4ED'

/**
 * 텍스트를 path d 로 변환. opentype 의 getPath 는 letterSpacing 옵션이 없어서
 * 글자 별 path 를 직접 누적하면서 사이에 추가 advance (em 단위) 를 끼워 넣는다.
 * 결과: { d, width, ascent, descent } — 호출자가 viewBox 안에 적절히 위치.
 */
function textToPath(font, text, fontSize, letterSpacingEm = 0) {
  const extraPerChar = letterSpacingEm * fontSize
  const fullPath = new opentype.Path()
  let x = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const glyph = font.charToGlyph(ch)
    const glyphPath = glyph.getPath(x, 0, fontSize)
    fullPath.extend(glyphPath)
    const advance = (glyph.advanceWidth / font.unitsPerEm) * fontSize
    x += advance
    if (i < text.length - 1) x += extraPerChar
  }
  // 마지막 글자에는 trailing letter-spacing 안 추가 (시각 중심에 더 자연)
  return {
    d: fullPath.toPathData(3),
    width: x,
    ascent: (font.ascender / font.unitsPerEm) * fontSize,
    descent: (font.descender / font.unitsPerEm) * fontSize,
  }
}

/**
 * "PETMOVE" 위, "Work" 아래 두 줄 워드마크 SVG 생성.
 * @param viewBox 정사각 viewBox 한 변 (예: 512)
 * @param rx 모서리 반지름 (full-bleed 면 0)
 * @param topSize PETMOVE 폰트 사이즈
 * @param topLs PETMOVE letter-spacing (em)
 * @param btmSize Work 폰트 사이즈
 * @param btmLs Work letter-spacing (em)
 * @param gap 두 줄 사이 간격 (px)
 */
function buildTwoLineSvg(font, {
  viewBox = 512,
  rx = 96,
  topSize,
  topLs = 0.06,
  btmSize,
  btmLs = 0.32,
  gap = 14,
  btmIndent = null,
} = {}) {
  const top = textToPath(font, 'PETMOVE', topSize, topLs)
  const btm = textToPath(font, 'Work', btmSize, btmLs)
  const totalH = top.ascent + gap + btm.ascent

  const cx = viewBox / 2
  const topY = (viewBox - totalH) / 2 + top.ascent
  const btmY = topY + gap + btm.ascent

  const topX = cx - top.width / 2
  const btmIndentVal = btmIndent ?? (btm.width * btmLs) / 2
  const btmX = cx - btm.width / 2 + btmIndentVal

  const bg = rx > 0
    ? `<rect width="${viewBox}" height="${viewBox}" rx="${rx}" fill="${COLOR_BG}"/>`
    : `<rect width="${viewBox}" height="${viewBox}" fill="${COLOR_BG}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">
  ${bg}
  <g fill="${COLOR_FG}">
    <path transform="translate(${topX.toFixed(2)},${topY.toFixed(2)})" d="${top.d}"/>
    <path transform="translate(${btmX.toFixed(2)},${btmY.toFixed(2)})" d="${btm.d}"/>
  </g>
</svg>
`
}

/** 한 줄 단일 텍스트 (봇 아바타 PMW) — 원형 또는 사각 배경. */
function buildOneLineSvg(font, text, {
  viewBox = 512,
  rx = 256, // 원형
  size,
  ls = 0.05,
} = {}) {
  const t = textToPath(font, text, size, ls)
  const cx = viewBox / 2
  const tx = cx - t.width / 2
  // path baseline 이 0 이고 ascent 만큼 위로 그려짐 → cap height 의 시각 중앙이
  // baseline - ascent * 0.65 정도. viewBox 중앙(viewBox/2) 에 두려면 baseline 을
  // viewBox/2 + ascent * 0.35 위치로.
  const ty = viewBox / 2 + t.ascent * 0.35
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">
  <rect width="${viewBox}" height="${viewBox}" rx="${rx}" fill="${COLOR_BG}"/>
  <path fill="${COLOR_FG}" transform="translate(${tx.toFixed(2)},${ty.toFixed(2)})" d="${t.d}"/>
</svg>
`
}

async function main() {
  const buf = await fs.readFile(FONT_PATH)
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  console.log(`Loaded font: ${font.names.fontFamily?.en} (${font.glyphs.length} glyphs)`)

  // PWA 일반 — 둥근 사각 (rx=96 in 512). PMW 한 줄, 작은 사이즈 가독성 우선.
  // 봇 아바타(size=180) 폭 ≈ 437px 기준으로 size 200 ≈ viewBox 폭 484, 양쪽 14px padding.
  const iconSvg = buildOneLineSvg(font, 'PMW', {
    viewBox: 512,
    rx: 96,
    size: 200,
    ls: 0.05,
  })
  await fs.writeFile(path.join(OUT_DIR_PUBLIC, 'icon.svg'), iconSvg)
  console.log('✓ public/icon.svg')

  // PWA maskable — full-bleed. 안전영역(중앙 80% ≈ 410px) 안에 들어가도록 작게.
  // size 160 ≈ 폭 388, 안전영역 410 안에 padding 11px 각자.
  const maskableSvg = buildOneLineSvg(font, 'PMW', {
    viewBox: 512,
    rx: 0,
    size: 160,
    ls: 0.05,
  })
  await fs.writeFile(path.join(OUT_DIR_PUBLIC, 'icon-maskable.svg'), maskableSvg)
  console.log('✓ public/icon-maskable.svg')

  // 봇 아바타 — 원형, PMW 한 줄. 시각 중앙 보정 강화.
  const botSvg = buildOneLineSvg(font, 'PMW', {
    viewBox: 512,
    rx: 256,
    size: 180,
    ls: 0.04,
  })
  await fs.writeFile(path.join(OUT_DIR_LOGO, 'bot-avatar.svg'), botSvg)
  console.log('✓ public/logo/bot-avatar.svg')

  console.log('\nAll SVGs regenerated as vector paths — font dependency 0.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
