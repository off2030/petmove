#!/usr/bin/env tsx
/**
 * **같은 뜻인데 표현이 갈린 문구**를 전 층에서 한 번에 찾아내는 스윕.
 *
 * 배경(2026-07-19): "새 여행지 할 때마다, 카드 하나 손볼 때마다 계속 새로운 게 나온다"는
 * 사용자 지적. 실제로 하루 동안 마이크로칩 순서 4가지, 최소 일령 3가지, 유효기간 만료 3가지,
 * 항체 순서 3가지가 차례로 발견됐다. 원인은 **발견 방식이 우연**이라는 것 —
 * 화면을 보다가 눈에 띄어야만 알 수 있었다.
 *
 * 기존 도구가 못 잡는 이유:
 *   - `lint:copy` / `lint:checks` = 세로(시간) 비교. "이전과 달라졌나"만 본다.
 *   - `copy:outliers`            = 가로(목적지) 비교. 단, **카드 설명문**만, **한 나라에만
 *                                  있는 줄**만 본다.
 *   → "여러 나라에 흩어져 있는데 표현만 다른" 경우는 어느 쪽에도 안 걸린다.
 *
 * 이 스크립트는 **모든 고객 노출 문구를 한 통에 넣고 유사도로 군집**한다. 한 군집에 표현이
 * 2가지 이상이면 통일 후보로 보고한다. 대상 3층:
 *   ① 안내   — 여정 카드 description (목적지별 최종 해석 결과)
 *   ② 주의   — procedure-check 의 ok:false 문구 (audience:customer 만)
 *   ③ 입력불가 — date-rules 의 validate* 반환 문구
 *
 * 자동 수정은 하지 않는다 — 나라 고유 사실(중국 GACC 지정 기관, 대만 불활화 백신)이 섞여 있어
 * 기계가 합치면 틀린 안내가 된다. 찾아주고 사람이 정한다.
 *
 * Usage:  pnpm copy:variants [최소군집크기]
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import {
  STEP_DESTINATION_OVERRIDES,
  resolveStepForDestination,
} from '../packages/domain/src/journey-steps/destination-overrides'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECKS_DIR = path.join(ROOT, 'packages', 'domain', 'src', 'procedure-checks')
const SKIP_FILES = new Set(['types.ts', 'utils.ts', 'registry.ts', 'index.ts', 'messages.ts', 'common.ts'])
const THRESHOLD = 0.55

interface Item {
  layer: '안내' | '주의' | '입력불가'
  where: string
  text: string
}

/**
 * 나라명·숫자·기관 약어를 지운 정규형.
 *
 * 이게 같으면 **같은 템플릿에 나라 이름만 다른 것**이라 정상이다
 * ('중국 입국 때 면역 유효기간이…' vs '대만 입국 때 면역 유효기간이…').
 * 규정 수치가 다른 것도 여기서 같아진다('생후 91일' vs '생후 90일') — 나라마다 실제로
 * 다른 값이므로 통일 대상이 아니다. **정규형까지 다를 때만** 표현이 갈린 것으로 본다.
 */
function normalize(line: string): string {
  return line
    .replace(/[가-힣A-Za-z]*\(([A-Z]{2,10})\)/g, ' ')
    .replace(/일본|중국|대만|태국|필리핀|유럽연합|영국|아일랜드|몰타|노르웨이|핀란드|키프로스|스위스|EU/g, ' ')
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 비교용 토큰 — 정규형에서 뽑는다. */
function tokens(line: string): Set<string> {
  return new Set(normalize(line).split(/\s+/).filter((w) => w.length >= 2))
}

function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

const items: Item[] = []

// ── ① 안내 (카드 설명문) ──
for (const dest of Object.keys(STEP_DESTINATION_OVERRIDES)) {
  for (const stepId of Object.keys(STEP_DESTINATION_OVERRIDES[dest]!)) {
    const base = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
    if (!base) continue
    const step = resolveStepForDestination(base, dest)
    const desc = typeof step.description === 'string' ? step.description : ''
    for (const line of desc.split('\n').map((l) => l.trim()).filter(Boolean)) {
      items.push({ layer: '안내', where: `${dest}/${stepId}`, text: line })
    }
  }
}

// ── ② 주의 (procedure-check ok:false, customer 만) ──
for (const f of readdirSync(CHECKS_DIR).sort()) {
  if (!f.endsWith('.ts') || SKIP_FILES.has(f)) continue
  const src = readFileSync(path.join(CHECKS_DIR, f), 'utf-8')
  const ids = [...src.matchAll(/id: '([a-z]{2,3}\.[a-z0-9-]+)'/g)]
  for (let i = 0; i < ids.length; i++) {
    const start = ids[i].index! + ids[i][0].length
    const end = i + 1 < ids.length ? ids[i + 1].index! : src.length
    const seg = src.slice(start, end)
    if (/audience: 'staff'/.test(seg)) continue
    if (/severity: 'info'/.test(seg)) continue
    const msgs = [
      ...[...seg.matchAll(/ok: false,\s*\n\s*message:\s*(?:`([^`]{3,300})`|'([^']{3,300})')/g)].map(
        (m) => m[1] ?? m[2],
      ),
      ...[...seg.matchAll(/(?:problems|issues|msgs|reasons|parts)\.push\(\s*`([^`]{3,300})`/g)].map((m) => m[1]),
    ]
    for (const t of msgs) items.push({ layer: '주의', where: ids[i][1], text: t })
  }
}

// ── ③ 입력불가 (date-rules validate* 반환 문구) ──
{
  const src = readFileSync(path.join(ROOT, 'packages', 'domain', 'src', 'journey-steps', 'date-rules.ts'), 'utf-8')
  const fns = [...src.matchAll(/export function (validate\w+)/g)]
  for (let i = 0; i < fns.length; i++) {
    const start = fns[i].index!
    const end = i + 1 < fns.length ? fns[i + 1].index! : src.length
    const seg = src.slice(start, end)
    for (const m of seg.matchAll(/return\s+(?:`([^`]{10,200})`|'([^']{10,200})')/g)) {
      items.push({ layer: '입력불가', where: fns[i][1], text: m[1] ?? m[2] })
    }
  }
}

// ── 군집 ──
const used = new Set<number>()
const clusters: Item[][] = []
for (let i = 0; i < items.length; i++) {
  if (used.has(i)) continue
  const group = [items[i]]
  used.add(i)
  for (let j = i + 1; j < items.length; j++) {
    if (used.has(j)) continue
    if (similarity(items[i].text, items[j].text) >= THRESHOLD) {
      group.push(items[j])
      used.add(j)
    }
  }
  clusters.push(group)
}

const minSize = Number(process.argv[2] ?? 2)
let reported = 0
for (const g of clusters) {
  // 정규형이 하나뿐이면 나라명·수치만 다른 정상 템플릿 — 보고하지 않는다.
  const forms = new Map<string, string[]>()
  for (const it of g) {
    const key = normalize(it.text)
    if (!forms.has(key)) forms.set(key, [])
    if (!forms.get(key)!.includes(it.text)) forms.get(key)!.push(it.text)
  }
  if (forms.size < minSize) continue
  reported++
  const layers = [...new Set(g.map((x) => x.layer))].join('·')
  console.log(`\n[${layers}] 같은 취지인데 표현이 ${forms.size}갈래`)
  for (const [, texts] of forms) {
    const v = texts[0]
    const wheres = [...new Set(g.filter((x) => texts.includes(x.text)).map((x) => x.where))]
    const head = wheres.slice(0, 3).join(', ') + (wheres.length > 3 ? ` 외 ${wheres.length - 3}` : '')
    console.log(`    · ${v.slice(0, 92)}${v.length > 92 ? '…' : ''}`)
    console.log(`        ${head}`)
  }
}
console.log(
  reported === 0
    ? `\n✓ 같은 취지에 표현이 갈린 곳 없음 (문구 ${items.length}건 검사)`
    : `\n총 ${reported}군집 — 규정이 실제로 다르면 정상, 표현만 다르면 messages.ts 로 통일하세요.`,
)
