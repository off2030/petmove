#!/usr/bin/env tsx
/**
 * 목적지별 안내 문구 **아웃라이어 리포트** — "이 나라에만 있는 줄"을 찾아준다.
 *
 * 배경(2026-07-18): 대만 항체검사 카드에 `수의사가 마이크로칩을 스캔해 신원을 확인한 후
 * 채혈해야 해요.` 한 줄이 들어갔다. 웹 가이드에 "반드시"라고 강조돼 있어 대만 고유 요건으로
 * 판단해 옮긴 것인데, 실제로는 전 목적지 공통 절차이고 보호자가 할 일도 아니었다. 다른 12개
 * 목적지 어디에도 없는 줄이었지만 **아무 신호도 없었다** — lint:copy 는 "이전 스냅샷과
 * 달라졌는가"만 보지, "다른 나라와 견줘 튀는가"는 보지 않기 때문이다.
 *
 * 이 스크립트가 채우는 자리:
 *   각 줄을 **같은 카드의 다른 목적지 문구들과 비교**해 가장 비슷한 것과의 유사도를 낸다.
 *     - 유사도 높음  → 같은 취지의 변형(나라명·수치만 다름). 정상.
 *     - 유사도 낮음  → 그 나라에만 있는 내용. **검토 대상** — 진짜 고유 규정일 수도,
 *                      위처럼 잘못 들어간 줄일 수도 있다. 사람이 판단한다.
 *
 * 자동 수정은 하지 않는다. 나라별 차이 중엔 정당한 것(중국 GACC 지정 기관, 대만 불활화 백신
 * 등)이 섞여 있어 기계가 지우면 틀린 안내가 된다. "찾아주고 사람이 정한다"가 맞는 모델.
 *
 * Usage:
 *   pnpm copy:outliers            # 전 목적지
 *   pnpm copy:outliers taiwan     # 한 목적지만 (새 여행지 9단계 점검 4번 '안내'에서 사용)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import {
  STEP_DESTINATION_OVERRIDES,
  resolveStepForDestination,
} from '../packages/domain/src/journey-steps/destination-overrides'

const target = process.argv[2]?.trim()
const DESTS = Object.keys(STEP_DESTINATION_OVERRIDES)

/** 문구 → 비교용 토큰. 나라명·숫자·기관명은 지워 '취지'만 남긴다. */
function tokens(line: string): Set<string> {
  const norm = line
    .replace(/[가-힣A-Za-z]*\(([A-Z]{2,10})\)/g, ' ') // (GACC) (APHIA) 등 기관 약어
    .replace(/일본|중국|대만|태국|필리핀|유럽연합|영국|아일랜드|몰타|노르웨이|핀란드|키프로스|스위스|EU/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
  return new Set(norm.split(/\s+/).filter((w) => w.length >= 2))
}

function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

/** (목적지, 카드) → description 을 줄 단위로. */
function linesFor(dest: string, stepId: string): string[] {
  const base = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  if (!base) return []
  const step = resolveStepForDestination(base, dest)
  const desc = typeof step.description === 'string' ? step.description : ''
  return desc.split('\n').map((l) => l.trim()).filter(Boolean)
}

const THRESHOLD = 0.5
let flagged = 0

for (const dest of target ? [target] : DESTS) {
  if (!STEP_DESTINATION_OVERRIDES[dest]) {
    console.error(`✗ 모르는 목적지: ${dest}\n  가능: ${DESTS.join(', ')}`)
    process.exit(1)
  }
  const rows: string[] = []
  let count = 0
  for (const stepId of Object.keys(STEP_DESTINATION_OVERRIDES[dest]!)) {
    const mine = linesFor(dest, stepId)
    if (mine.length === 0) continue
    // 같은 카드의 다른 목적지 문구 전부
    const others = DESTS.filter((d) => d !== dest).flatMap((d) => linesFor(d, stepId))
    if (others.length === 0) continue
    const hits = mine.filter(
      (line) => others.reduce((mx, o) => Math.max(mx, similarity(line, o)), 0) < THRESHOLD,
    )
    if (hits.length === 0) continue
    rows.push(`  ▸ ${stepId}`)
    for (const line of hits) rows.push(`      ${line.slice(0, 110)}${line.length > 110 ? '…' : ''}`)
    count += hits.length
  }
  if (rows.length) {
    flagged += count
    console.log(`\n[${dest}] 이 목적지에만 있는 안내 ${count}건`)
    console.log(rows.join('\n'))
  }
}

console.log(
  flagged === 0
    ? '\n✓ 다른 목적지와 견줘 튀는 안내 문구 없음'
    : `\n총 ${flagged}건 — 그 나라 고유 규정이면 정상, 아니면 빼세요(자동 수정 안 함).`,
)
