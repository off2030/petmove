import { writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import sharp from 'sharp'

const DIR = 'C:\\dev\\petmove\\tmp-fg'
const OUT = DIR + '\\out'
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const FONT = "font-family=\"'Pretendard', 'Malgun Gothic', -apple-system, sans-serif\""

const HEAD = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg" ${FONT}>`
const LOGO = `<g transform="translate(80,110) scale(0.92)"><rect width="100" height="100" rx="22.5" fill="#D99A58"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/></g>`
const WORD = `<text x="194" y="177" font-size="56" font-weight="600" fill="#2A2620" letter-spacing="1">PETMOVE</text>`
const TAG = `<text x="82" y="258" font-size="30" font-weight="600" fill="#2A2620">반려동물과 함께하는 해외여행</text><text x="82" y="304" font-size="22" fill="#6B6457">복잡한 검역·서류 준비를 앱 하나로,</text><text x="82" y="336" font-size="22" fill="#6B6457">단계별로 안내해 드려요.</text>`
const chips = (last) => `<g font-size="18" font-weight="500"><rect x="82" y="372" width="86" height="38" rx="19" fill="#FBF7F1" stroke="#E0D4C2"/><text x="125" y="397" text-anchor="middle" fill="#6B6457">일본</text><rect x="178" y="372" width="86" height="38" rx="19" fill="#FBF7F1" stroke="#E0D4C2"/><text x="221" y="397" text-anchor="middle" fill="#6B6457">태국</text><rect x="274" y="372" width="100" height="38" rx="19" fill="#FBF7F1" stroke="#E0D4C2"/><text x="324" y="397" text-anchor="middle" fill="#6B6457">필리핀</text><rect x="384" y="372" width="86" height="38" rx="19" fill="#FBF7F1" stroke="#E0D4C2"/><text x="427" y="397" text-anchor="middle" fill="#6B6457">${last}</text><rect x="480" y="372" width="58" height="38" rx="19" fill="#E8A55A"/><text x="509" y="397" text-anchor="middle" fill="#FBF7F1">···</text></g>`
const BG = `<rect width="1024" height="500" fill="#F5EFE8"/>`
const cloudsA = `<g fill="#FFFFFF" opacity="0.6"><circle cx="648" cy="178" r="14"/><circle cx="670" cy="170" r="19"/><circle cx="694" cy="180" r="13"/><rect x="648" y="180" width="48" height="13" rx="6.5"/></g><g fill="#FFFFFF" opacity="0.5"><circle cx="932" cy="356" r="12"/><circle cx="952" cy="350" r="16"/><circle cx="970" cy="358" r="11"/></g>`
const FLIGHT = `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"`
const roughMap = `<ellipse cx="795" cy="265" rx="120" ry="42" fill="none" stroke="#A6CAD9" stroke-width="1.1"/><ellipse cx="795" cy="265" rx="46" ry="120" fill="none" stroke="#A6CAD9" stroke-width="1.1"/><path d="M686 244 C 682 210 702 188 734 186 C 758 184 776 196 800 192 C 818 189 832 198 840 212 C 847 224 840 236 828 241 C 836 248 830 260 816 262 C 802 264 792 256 778 258 C 760 261 748 256 736 260 C 716 266 690 266 686 244 Z" fill="#9FC08C"/><path d="M742 260 C 748 280 754 298 760 302 C 766 296 768 280 770 262 C 760 259 750 258 742 260 Z" fill="#9FC08C"/><path d="M794 262 C 796 280 800 296 805 305 C 810 297 812 282 811 268 C 805 264 799 263 794 262 Z" fill="#9FC08C"/><ellipse cx="826" cy="314" rx="20" ry="5" fill="#9FC08C" transform="rotate(-10 826 314)"/><circle cx="840" cy="300" r="5" fill="#9FC08C"/><circle cx="846" cy="311" r="4" fill="#9FC08C"/><circle cx="812" cy="322" r="5" fill="#9FC08C"/><circle cx="800" cy="330" r="4" fill="#9FC08C"/><circle cx="824" cy="330" r="4" fill="#9FC08C"/><ellipse cx="850" cy="236" rx="4" ry="11" fill="#9FC08C" transform="rotate(-32 850 236)"/><ellipse cx="860" cy="256" rx="4" ry="10" fill="#9FC08C" transform="rotate(-32 860 256)"/><ellipse cx="868" cy="274" rx="3" ry="7" fill="#9FC08C" transform="rotate(-32 868 274)"/><path d="M848 338 C 854 327 876 325 886 334 C 894 342 890 355 879 360 C 867 364 851 361 846 350 C 843 344 844 343 848 338 Z" fill="#9FC08C"/><ellipse cx="744" cy="210" rx="28" ry="14" fill="#FFFFFF" opacity="0.2"/>`

const svgs = {}

svgs['01_first_draft'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="300" ry="300" fill="#EFE3CF"/><ellipse cx="800" cy="250" rx="232" ry="170" fill="none" stroke="#D99A58" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round"/><circle cx="800" cy="250" r="150" fill="#FBF7F1" stroke="#E8A55A" stroke-width="2.5"/><ellipse cx="800" cy="288" rx="46" ry="38" fill="#E8A55A"/><circle cx="760" cy="240" r="17" fill="#E8A55A"/><circle cx="789" cy="222" r="17" fill="#E8A55A"/><circle cx="819" cy="223" r="17" fill="#E8A55A"/><circle cx="846" cy="243" r="16" fill="#E8A55A"/><circle cx="800" cy="80" r="11" fill="#C98B45"/><circle cx="800" cy="80" r="4" fill="#FBF7F1"/><circle cx="1006" cy="282" r="11" fill="#C98B45"/><circle cx="1006" cy="282" r="4" fill="#FBF7F1"/><circle cx="648" cy="346" r="11" fill="#C98B45"/><circle cx="648" cy="346" r="4" fill="#FBF7F1"/><path d="M958 150 l24 -9 -7 23 -10 -4 -7 -10z" fill="#8FA68C"/><rect x="80" y="120" width="74" height="74" rx="20" fill="#E8A55A"/><path d="M104 178 v-44 h22 a12 12 0 0 1 0 24 h-22" fill="none" stroke="#FBF7F1" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><text x="170" y="175" font-size="56" font-weight="600" fill="#2A2620" letter-spacing="1">PETMOVE</text>` +
TAG + chips('호주') + `</svg>`

svgs['02_logo_paw_globe'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="300" ry="300" fill="#EFE3CF"/><ellipse cx="800" cy="250" rx="232" ry="170" fill="none" stroke="#D99A58" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round"/><circle cx="800" cy="250" r="150" fill="#FBF7F1" stroke="#E8A55A" stroke-width="2.5"/><ellipse cx="800" cy="288" rx="46" ry="38" fill="#E8A55A"/><circle cx="760" cy="240" r="17" fill="#E8A55A"/><circle cx="789" cy="222" r="17" fill="#E8A55A"/><circle cx="819" cy="223" r="17" fill="#E8A55A"/><circle cx="846" cy="243" r="16" fill="#E8A55A"/><circle cx="800" cy="80" r="11" fill="#C98B45"/><circle cx="800" cy="80" r="4" fill="#FBF7F1"/><circle cx="1006" cy="282" r="11" fill="#C98B45"/><circle cx="1006" cy="282" r="4" fill="#FBF7F1"/><circle cx="648" cy="346" r="11" fill="#C98B45"/><circle cx="648" cy="346" r="4" fill="#FBF7F1"/><path d="M958 150 l24 -9 -7 23 -10 -4 -7 -10z" fill="#8FA68C"/>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

svgs['03_progress_ring'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="215" ry="215" fill="#EFE3CF"/><circle cx="800" cy="250" r="138" fill="none" stroke="#EADFC9" stroke-width="22"/><circle cx="800" cy="250" r="138" fill="none" stroke="#E8A55A" stroke-width="22" stroke-linecap="round" stroke-dasharray="711 156" transform="rotate(-90 800 250)"/><text x="800" y="216" font-size="18" font-weight="500" fill="#9A8E7C" text-anchor="middle">출국 준비</text><text x="800" y="276" font-size="66" font-weight="600" fill="#2A2620" text-anchor="middle">85%</text><text x="800" y="308" font-size="17" fill="#9A8E7C" text-anchor="middle">11 / 14 단계</text>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

svgs['04_route_globe'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="215" ry="215" fill="#EFE3CF"/><circle cx="808" cy="250" r="150" fill="#FBF7F1" stroke="#E8A55A" stroke-width="2.5"/><line x1="658" y1="250" x2="958" y2="250" stroke="#E7DAC2" stroke-width="1.5"/><ellipse cx="808" cy="250" rx="150" ry="104" fill="none" stroke="#E7DAC2" stroke-width="1.5"/><ellipse cx="808" cy="250" rx="58" ry="150" fill="none" stroke="#E7DAC2" stroke-width="1.5"/><path d="M712 338 Q 792 122 918 214" fill="none" stroke="#D99A58" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/><circle cx="712" cy="338" r="10" fill="#C98B45"/><circle cx="712" cy="338" r="3.5" fill="#FBF7F1"/><circle cx="800" cy="166" r="10" fill="#C98B45"/><circle cx="800" cy="166" r="3.5" fill="#FBF7F1"/><circle cx="918" cy="214" r="10" fill="#C98B45"/><circle cx="918" cy="214" r="3.5" fill="#FBF7F1"/><path d="M858 176 l30 -7 -10 25 -9 -8 -11 -10z" fill="#8FA68C"/>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

svgs['05_cute_smile_globe'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="218" ry="218" fill="#EFE3CF"/>` + cloudsA +
`<circle cx="795" cy="265" r="120" fill="#BAD6E2" stroke="#9CC0D1" stroke-width="2.5"/><defs><clipPath id="g5"><circle cx="795" cy="265" r="120"/></clipPath></defs><g clip-path="url(#g5)"><ellipse cx="742" cy="212" rx="32" ry="16" fill="#FFFFFF" opacity="0.22"/><ellipse cx="752" cy="238" rx="34" ry="22" fill="#9FC08C" transform="rotate(-18 752 238)"/><ellipse cx="834" cy="230" rx="22" ry="15" fill="#9FC08C" transform="rotate(12 834 230)"/><ellipse cx="822" cy="314" rx="38" ry="21" fill="#9FC08C" transform="rotate(-8 822 314)"/><ellipse cx="736" cy="312" rx="17" ry="12" fill="#9FC08C"/></g><ellipse cx="772" cy="268" rx="5" ry="8" fill="#4A4036"/><ellipse cx="818" cy="268" rx="5" ry="8" fill="#4A4036"/><circle cx="758" cy="285" r="8" fill="#F2C4B7"/><circle cx="832" cy="285" r="8" fill="#F2C4B7"/><path d="M784 289 Q 795 301 806 289" fill="none" stroke="#4A4036" stroke-width="3.5" stroke-linecap="round"/><path d="M800 185 l-11 -16 a13 13 0 1 1 22 0 z" fill="#E8A55A"/><circle cx="800" cy="162" r="5" fill="#FBF7F1"/><path d="M838 206 Q 862 176 874 160" fill="none" stroke="#D99A58" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round"/><g transform="translate(908,150) rotate(-12)"><ellipse cx="-4" cy="15" rx="30" ry="10" fill="#D99A58"/><path d="M-44 -6 L-62 -34 L-30 -14 Z" fill="#E8A55A"/><path d="M-46 8 L-62 18 L-34 12 Z" fill="#E8A55A"/><ellipse cx="0" cy="0" rx="50" ry="21" fill="#FBF7F1" stroke="#E4D8C4" stroke-width="2"/><ellipse cx="6" cy="-13" rx="22" ry="8" fill="#E8A55A"/><circle cx="-16" cy="-2" r="5" fill="#BAD6E2" stroke="#9CC0D1"/><circle cx="0" cy="-2" r="5" fill="#BAD6E2" stroke="#9CC0D1"/><circle cx="16" cy="-2" r="5" fill="#BAD6E2" stroke="#9CC0D1"/><circle cx="34" cy="-1" r="6" fill="#BAD6E2" stroke="#9CC0D1"/></g>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

svgs['06_map_flight_icon'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="218" ry="218" fill="#EFE3CF"/>` + cloudsA +
`<circle cx="795" cy="265" r="120" fill="#BAD6E2" stroke="#9CC0D1" stroke-width="2.5"/><defs><clipPath id="g6"><circle cx="795" cy="265" r="120"/></clipPath></defs><g clip-path="url(#g6)">` + roughMap + `</g><path d="M812 238 l-11 -16 a13 13 0 1 1 22 0 z" fill="#E8A55A"/><circle cx="812" cy="215" r="5" fill="#FBF7F1"/><path d="M822 210 Q 845 192 860 178" fill="none" stroke="#D99A58" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round"/><g transform="translate(892,146) rotate(42) scale(1.55) translate(-12,-12)">` + FLIGHT + ` fill="#E8A55A" stroke="#E8A55A" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></g>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

svgs['07_arc_over_globe'] = HEAD + BG +
`<ellipse cx="800" cy="250" rx="218" ry="218" fill="#EFE3CF"/>` + cloudsA +
`<circle cx="795" cy="265" r="120" fill="#BAD6E2" stroke="#9CC0D1" stroke-width="2.5"/><defs><clipPath id="g7"><circle cx="795" cy="265" r="120"/></clipPath></defs><g clip-path="url(#g7)">` + roughMap + `</g><path d="M712 322 C 706 132 904 140 896 252" fill="none" stroke="#D99A58" stroke-width="3" stroke-dasharray="2 11" stroke-linecap="round"/><path d="M712 322 l-10 -15 a12 12 0 1 1 20 0 z" fill="#E8A55A"/><circle cx="712" cy="300" r="4.5" fill="#FBF7F1"/><path d="M896 252 l-10 -15 a12 12 0 1 1 20 0 z" fill="#E8A55A"/><circle cx="896" cy="230" r="4.5" fill="#FBF7F1"/><g transform="translate(805,170) rotate(81) scale(1.35) translate(-12,-12)">` + FLIGHT + ` fill="#E8A55A" stroke="#E8A55A" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></g>` +
LOGO + WORD + TAG + chips('유럽') + `</svg>`

for (const [name, svg] of Object.entries(svgs)) {
  const svgPath = `${DIR}\\${name}.svg`
  const pngPath = `${OUT}\\${name}.png`
  writeFileSync(svgPath, svg, 'utf8')
  try {
    execFileSync(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=1','--no-first-run','--no-default-browser-check',`--screenshot=${pngPath}`,'--window-size=1024,500', svgPath], { stdio: 'ignore' })
    const m = await sharp(pngPath).metadata()
    console.log(name, m.width + 'x' + m.height)
  } catch (e) {
    console.log(name, 'ERR', e.message)
  }
}
