// 신규 스포크 등록: EU 허브(귀국 항체 표 링크화 + 개별 가이드 목록) · site-data COUNTRIES · 가이드 수
import { readFileSync, writeFileSync } from 'node:fs'
import { SPECS as ALL } from './specs.mjs'
const ONLY = process.argv.slice(2)
const SPECS = ONLY.length ? ALL.filter((s) => ONLY.includes(s.slug)) : ALL

const ROOT = 'C:/dev/petmove/apps/www'
const hubPath = ROOT + '/content/docs/eu-pet-travel-guide.json'
const hub = JSON.parse(readFileSync(hubPath, 'utf8'))
let h = hub.html
const sd = ROOT + '/lib/site-data.ts'
let sdt = readFileSync(sd, 'utf8')
const gp = ROOT + '/app/guide/page.tsx'
let gpt = readFileSync(gp, 'utf8')

let added = 0
for (const s of SPECS) {
  const href = `/docs/${s.slug}-pet-travel-guide/`
  if (h.includes(href)) continue
  // 귀국 항체 표: 평문 나라명 → 링크 (표 셀 안에서 ", 나라," / ", 나라</td>" / "<td>나라," 패턴)
  const re = new RegExp(`(<td>|, )${s.ko}(, |</td>)`)
  if (!re.test(h)) console.warn('허브 표에서 못 찾음:', s.ko)
  h = h.replace(re, `$1<a href="${href}">${s.ko}</a>$2`)
  // 개별 가이드 목록 끝에 추가
  const item = `<a href="${href}"><span class="it">${s.ko} 입국 준비 총정리 <i class="ti ti-arrow-right"></i></span></a>\n`
  const anchorEnd = '</span></a>\n</div>\n<hr/><h2 id="%EA%B8%B0%ED%83%80'
  const cutAt = h.indexOf(anchorEnd)
  if (cutAt < 0) throw new Error('개별 가이드 목록 끝 못 찾음')
  const insertAt = cutAt + '</span></a>\n'.length
  h = h.slice(0, insertAt) + item + h.slice(insertAt)
  // COUNTRIES — 유럽 그룹 마지막(러시아) 앞에 삽입
  const line = `  { ko: '${s.ko}', slug: '${s.slug}', region: '유럽' },\n`
  if (!sdt.includes(line)) {
    const anchor = `  { ko: '러시아', slug: 'russia', region: '유럽' },`
    if (!sdt.includes(anchor)) throw new Error('COUNTRIES 앵커 없음')
    sdt = sdt.replace(anchor, line + anchor)
  }
  added++
}
hub.html = h
hub.updated = '2026.08.17'
writeFileSync(hubPath, JSON.stringify(hub, null, 1) + '\n')

const count = (sdt.match(/\{ ko: '/g) || []).length
sdt = sdt.replace(/나라별 가이드 \d+개국/, `나라별 가이드 ${count}개국`)
gpt = gpt.replace(/등 \d+개국의/, `등 ${count}개국의`)
writeFileSync(sd, sdt)
writeFileSync(gp, gpt)
console.log('등록', added, '건 · 총', count, '개국')
