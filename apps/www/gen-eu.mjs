// EU 스포크 가이드 생성기 — germany-pet-travel-guide.json 을 원형 템플릿으로 삼아
// 나라별 고유 슬롯(리드·단계·견종/현지규칙·직항·도착·귀국항체·공식자료)만 갈아끼운다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { SPECS as ALL } from './specs.mjs'
const ONLY = process.argv.slice(2)
const SPECS = ONLY.length ? ALL.filter((s) => ONLY.includes(s.slug)) : ALL

const ROOT = 'C:/dev/petmove/apps/www'
const DOCS = path.join(ROOT, 'content/docs')
const IMG_DIR = path.join(ROOT, 'public/content/images/2026/08')
const PORTAL = 'C:/dev/petmove/apps/portal/public/destinations'

const base = JSON.parse(readFileSync(path.join(DOCS, 'germany-pet-travel-guide.json'), 'utf8'))
const H = base.html

const hid = (t) => encodeURIComponent(t.replace(/\s+/g, '-'))
const h2 = (t) => `<h2 id="${hid(t)}"><strong>${t}</strong></h2>`
const cut = (s, from, to) => {
  const a = s.indexOf(from)
  const b = s.indexOf(to, a + from.length)
  if (a < 0 || b < 0) throw new Error('marker missing: ' + from.slice(0, 40) + ' / ' + to.slice(0, 40))
  return [s.slice(0, a), s.slice(a, b), s.slice(b)]
}
const need = (s, needle) => { if (!s.includes(needle)) throw new Error('needle missing: ' + needle.slice(0, 60)); return s }

// 로/으로 조사 — 받침 있으면 으로 (ㄹ 받침은 로)
function ro(name) {
  const c = name.charCodeAt(name.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return '로'
  const jong = (c - 0xac00) % 28
  return jong === 0 || jong === 8 ? '로' : '으로'
}
function eun(name) {
  const c = name.charCodeAt(name.length - 1)
  const jong = (c - 0xac00) % 28
  return jong === 0 ? '는' : '은'
}

import { q, B, more, ul } from './helpers.mjs'

const MARK = {
  summary: '<h2 id="%ED%95%B5%EC%8B%AC%EC%A0%88%EC%B0%A8-%EC%9A%94%EC%95%BD">핵심절차 요약</h2>',
  stepsH3: '<h3 id="%EB%8F%85%EC%9D%BC-%EC%9E%85%EA%B5%AD-%EC%A4%80%EB%B9%84-8%EB%8B%A8%EA%B3%84">독일 입국 준비 8단계</h3>',
  breedH2: '<h2 id="%EB%B0%98%EC%9E%85-%EA%B0%80%EB%8A%A5-%EA%B2%AC%EC%A2%85-%ED%99%95%EC%9D%B8">',
  chipH2: '<h2 id="%EB%A7%88%EC%9D%B4%ED%81%AC%EB%A1%9C%EC%B9%A9-%EC%9D%B4%EC%8B%9D">',
  returnTiter: '<p><span style="white-space: pre-wrap;">독일은 한국이 지정한 광견병 비발생 지역이라 <strong style="white-space: pre-wrap;">귀국할 때는 항체검사 결과지가 필요하지 않습니다</strong>. 이 검사는 입국용으로만 쓰입니다.</span></p>',
  flight: '<li>인천 - 프랑크푸르트 직항 - 대한항공·아시아나·루프트한자·티웨이 운항, 뮌헨 직항 - 루프트한자 운항</li>',
  arriveH2: '<h2 id="%EB%8F%85%EC%9D%BC-%EB%8F%84%EC%B0%A9-%EB%B0%8F-%EC%9E%85%EA%B5%AD-%EA%B2%80%EC%82%AC">',
  refsH2: '<hr/><h2 id="%EA%B8%B0%ED%83%80-%EC%9C%A0%EC%9A%A9%ED%95%9C-%EC%A0%95%EB%B3%B4">',
  officialLi: '<li>최신 요건은 독일 세관과 연방 농식품부 공식 안내에서 확인하실 수 있습니다. <a href="https://www.zoll.de/EN/Private-individuals/Travel/Entering-Germany/Restrictions/Dangerous-dogs/dangerous-dogs.html" rel="noreferrer">[독일 세관 위험견 반입 안내]</a> · <a href="https://www.bmleh.de/EN/topics/animals/pets-and-zoo-animals/pets-entry-regulation.html" rel="noreferrer">[연방 농식품부 반려동물 입국 안내]</a></li>',
}
for (const [k, v] of Object.entries(MARK)) need(H, v)

const RETURN_NEED = (n) =>
  `<p><span style="white-space: pre-wrap;">${n}에서 한국으로 돌아올 때도 항체검사 결과지가 필요합니다. <strong style="white-space: pre-wrap;">한국 입국용 유효기간은 채혈일로부터 2년</strong>이므로, 체류가 길어지면 귀국 시점에 결과지가 만료될 수 있습니다.</span></p>`
const RETURN_FREE = (n) =>
  `<p><span style="white-space: pre-wrap;">${n}${eun(n)} 한국이 지정한 광견병 비발생 지역이라 <strong style="white-space: pre-wrap;">귀국할 때는 항체검사 결과지가 필요하지 않습니다</strong>. 이 검사는 입국용으로만 쓰입니다.</span></p>`

// 귀국 FAQ (도착 섹션 안) — 원형 문구 그대로
export const RETURN_FAQ_FREE = (n) =>
  q(`${n}에서 한국으로 귀국할 때는 어떻게 하나요?`,
    `${n}${eun(n)} 한국이 지정한 ${B('광견병 비발생 지역')}이라 한국 입국 시 광견병 항체검사 결과지가 필요하지 않습니다.`,
    `귀국 증명서는 ${n} 정부 인증 건강증명서를 준비하되, ${B('EU 반려동물 여권이나 한국 수출 동물검역증이 있으면 새로 발급받지 않아도 됩니다')}. 장기 체류라면 현지 수의사에게 EU 반려동물 여권을 만들어 두면 이후 유럽 안 이동과 재입국 준비를 쉽게 할 수 있습니다. 광견병 비발생 지역 명단은 수시로 바뀌니 귀국 전 농림축산검역본부(054-912-0427)에 확인하는 것이 좋습니다.`)
export const RETURN_FAQ_NEED = (n) =>
  q(`${n}에서 한국으로 귀국할 때는 어떻게 하나요?`,
    `${n}${eun(n)} 한국이 지정한 광견병 비발생 지역이 ${B('아닙니다')}. 한국 입국 시 ${B('광견병 항체검사 결과지(채혈일로부터 2년 이내, 0.5 IU/ml 이상)')}가 필요합니다. ${n} 입국용으로 받아 둔 결과지를 그대로 쓸 수 있으나 유효기간은 2년입니다.`,
    `귀국 증명서는 ${n} 정부 인증 건강증명서를 준비하되, ${B('EU 반려동물 여권이나 한국 수출 동물검역증이 있으면 새로 발급받지 않아도 됩니다')}. 장기 체류라면 현지 수의사에게 EU 반려동물 여권을 만들어 두면 이후 유럽 안 이동과 재입국 준비를 쉽게 할 수 있습니다.`)

// 이/가 — 괄호 표기(예: '세관(Zoll)')는 떼고 앞 글자의 받침으로 판정
function iga(name) {
  const core = name.replace(/\([^)]*\)\s*$/, '').trim()
  const c = core.charCodeAt(core.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return '이'
  return (c - 0xac00) % 28 === 0 ? '가' : '이'
}

// 도착 FAQ 첫 문답(원형 리듬)
export const ARRIVE_FAQ = (n, authority, how) =>
  q('도착하면 어떤 절차를 거치나요?',
    `${n}${eun(n)} ${authority}${iga(authority)} 반려동물 입국 확인을 담당합니다. ${how} 서류·마이크로칩·날짜 요건이 맞으면 계류 없이 데리고 입국할 수 있습니다.`)

async function cover(spec) {
  const out = path.join(IMG_DIR, `${spec.slug}-pet-travel-cover.webp`)
  if (existsSync(out)) return
  const src = path.join(PORTAL, spec.photo)
  await sharp(src).resize(1365, 768, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toFile(out)
}

for (const spec of SPECS) {
  const n = spec.ko
  // 공통 문단의 '독일' 을 먼저 치환(조사 처리). 이후 삽입되는 나라별 슬롯 문구는 건드리지 않는다.
  const T = (x) => x.replaceAll('독일로', n + ro(n)).replaceAll('독일은', n + eun(n)).replaceAll('독일', n)
  const M = Object.fromEntries(Object.entries(MARK).map(([k, v]) => [k, T(v)]))
  let s = T(H)

  // 1) 헤더(커버+리드 콜아웃)
  const title = `[2026] 강아지·고양이 ${n} 입국 준비 총정리 | 동물검역 절차·서류·기간`
  const cover_ = `/content/images/2026/08/${spec.slug}-pet-travel-cover.webp`
  const lead = `<img class="art-cover" src="${cover_}" alt="${title}"><div class="callout-note">수의사가 직접 정리한 2026년 최신 가이드입니다. 100% 믿을 수 있는 강아지·고양이 ${n} 입국 준비 방법을 알려드립니다.<br/><br/>${spec.lead1}<br/><br/>${spec.lead2}<br/><br/>펫무브 앱을 설치하시면 단계별 가이드에 따라 준비를 하실 수 있습니다. <a href="/#download">[무료 앱 받기]</a></div>`
  {
    const i = s.indexOf(M.summary)
    s = lead + s.slice(i)
  }

  // 2) 단계 목록
  {
    const [pre, , post] = cut(s, M.stepsH3, '<hr/>')
    const steps = [
      ...(spec.breedStep ? [spec.breedStep] : []),
      '마이크로칩 이식', '광견병 예방접종', '광견병 항체검사', '대기기간 3개월', '항공권 구매',
      '출국 전 임상검사 및 서류 준비 - 출발일 기준 10일 이내', '수출동물검역', `${n} 도착 및 입국 검사`,
      ...(spec.extraStep ? [spec.extraStep] : []),
    ]
    const h3t = `${n} 입국 준비 ${steps.length}단계`
    s = pre + `<h3 id="${hid(h3t)}">${h3t}</h3><ol>${steps.map((x) => `<li>${x}</li>`).join('')}</ol>` + post
  }

  // 3) 견종 섹션 — 교체 또는 삭제
  {
    const [pre, , post] = cut(s, M.breedH2, M.chipH2)
    s = pre + (spec.breedSection ?? '') + post
  }

  // 4) 귀국 항체 문장(항체검사 섹션 안)
  s = s.replace(M.returnTiter, spec.returnFree ? RETURN_FREE(n) : RETURN_NEED(n))

  // 5) 직항
  s = s.replace(M.flight, `<li>${spec.flight}</li>`)

  // 6) 도착 섹션(+선택 현지 규칙 섹션)
  {
    const [pre, , post] = cut(s, M.arriveH2, M.refsH2)
    const arriveT = `${n} 도착 및 입국 검사`
    const faqs = [
      ARRIVE_FAQ(n, spec.authority, spec.arriveHow),
      ...(spec.arriveExtraFaq ?? []),
      spec.returnFree ? RETURN_FAQ_FREE(n) : RETURN_FAQ_NEED(n),
      ...(spec.afterReturnFaq ?? []),
    ]
    s = pre + h2(arriveT) + ul(...spec.arriveBullets) + more(...faqs) + (spec.localSection ?? '') + post
  }

  // 7) 공식 자료
  s = s.replace(M.officialLi, `<li>${spec.official}</li>`)

  // 8) 잔재 점검(원형 고유 표현)
  if (/독문|HundVerbrEinfG|Hundesteuer|레드 채널로 가서 반려동물과 서류를 제시하면 됩니다\. 서류·마이크로칩·날짜 요건이 맞으면 계류 없이 데리고 입국할 수 있습니다\.<\/span><\/p><br\/><p><b><strong style="white-space: pre-wrap;">요건이 미비하면/.test(s)) {
    console.warn('⚠️ 원형 잔재:', spec.slug)
  }

  // 최종 수정일은 이미 생성된 파일 값을 이어받는다(재생성이 날짜를 되돌리지 않도록).
  const outPath = path.join(DOCS, `${spec.slug}-pet-travel-guide.json`)
  const prevUpdated = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')).updated : null

  const json = {
    slug: `${spec.slug}-pet-travel-guide`,
    kind: 'docs',
    title,
    description: `수의사가 직접 정리한 2026년 최신 가이드입니다. 100% 믿을 수 있는 강아지·고양이 ${n} 입국 준비 방법을 알려드립니다. ${spec.desc}`,
    category: '지역별 가이드',
    updated: prevUpdated ?? '2026.08.17',
    minutes: 9,
    feature_image: cover_,
    html: s,
  }
  writeFileSync(outPath, JSON.stringify(json, null, 1) + '\n')
  await cover(spec)
  console.log('✔', json.slug, (s.length / 1000).toFixed(1) + 'k')
}
