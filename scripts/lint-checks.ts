#!/usr/bin/env tsx
/**
 * 절차 검증 룰(procedure-checks)의 **고객 노출 문구** 가드 + 골든 스냅샷.
 *
 * 배경(2026-07-18): 대만 작업 중 `마이크로칩(2026-02-13)이 광견병 1차 접종(2026-01-01)보다
 * 늦어요` 같은 문구가 고객 화면에 뜨는 것을 사용자가 발견. 조사해보니 25개국이 같은 규칙에
 * 4가지 표현을 쓰고 그중 20개국이 날짜를 그대로 노출하고 있었다. 원인은 두 가지였다:
 *   1) 고객이 보는 주의 문구가 어떤 스냅샷에도 없어 바뀌어도 리뷰에 안 뜸
 *      (lint:copy 는 카드 설명문만 지킨다)
 *   2) "고객이 보는가"가 선언돼 있지 않아(severity + 억제목록 + relatedCases 조합) 반복 오판
 *
 * 이 스크립트가 잡는 것:
 *   A. audience:'customer' 룰의 ok:false 문구에 날짜·이름 보간이 있으면 실패
 *      (날짜가 정보 자체인 룰은 `allowDate: true` 선언으로 통과)
 *   B. 고객 노출 문구 전체를 골든 스냅샷과 비교 — 새 문구·변경이 diff 로 보인다
 *
 * 사용:
 *   pnpm lint:checks         검사
 *   pnpm lint:checks:write   스냅샷 갱신(변경 의도 확인 후)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECKS_DIR = path.join(ROOT, 'packages', 'domain', 'src', 'procedure-checks')
const SNAPSHOT = path.join(ROOT, 'scripts', 'checks-copy.snapshot.txt')
const WRITE = process.argv.includes('--write')

const SKIP_FILES = new Set(['types.ts', 'utils.ts', 'registry.ts', 'index.ts', 'messages.ts', 'common.ts'])

/** 날짜·개인정보성 보간으로 볼 식별자 — 문구에 그대로 박히면 안 되는 값들. */
const DATE_LIKE = /\$\{[^}]*\b(date|dep|entry|filed|until|validUntil|anchor|threshold|birth|customer_name|latest|first|newest|earliest|days|age|gap|cushion)\b[^}]*\}/i

interface Rule {
  file: string
  id: string
  audience: string
  allowDate: boolean
  severity: string
  messages: string[]
}

function parseRules(): Rule[] {
  const out: Rule[] = []
  for (const f of readdirSync(CHECKS_DIR).sort()) {
    if (!f.endsWith('.ts') || SKIP_FILES.has(f)) continue
    const src = readFileSync(path.join(CHECKS_DIR, f), 'utf-8')
    const ids = [...src.matchAll(/id: '([a-z]{2,3}\.[a-z0-9-]+)'/g)]
    for (let i = 0; i < ids.length; i++) {
      const start = ids[i].index! + ids[i][0].length
      // 룰 경계 = 다음 id / 배열 끝(`\n]`) / 파일 하단 빌더 함수 시작 중 가장 이른 것.
      // 끝까지 슬라이스하면 파일 끝 빌더 함수(buildExternalParasiteRule 등)의 문구가
      // 마지막 룰 것으로 오귀속돼 엉뚱한 룰이 실패로 뜬다(2026-07-18 발견).
      const bounds = [
        i + 1 < ids.length ? ids[i + 1].index! : src.length,
        ...['\n]', '\nfunction ', '\n/**\n * 외부구충', '\nconst '].map((t) => {
          const at = src.indexOf(t, start)
          return at < 0 ? src.length : at
        }),
      ]
      const end = Math.min(...bounds)
      const seg = src.slice(start, end)
      // ok:false 의 message = 실제 사용자에게 보이는 문구 (ok:true 는 내부 기록이라 제외).
      // 두 형태를 모두 잡는다:
      //  (1) message 에 문자열을 바로 넣는 경우
      //  (2) 위반을 배열에 push 해 join 하는 경우 — 이쪽을 빠뜨려 tw/cn 등 9건의 날짜 노출을
      //      처음 스캔에서 놓쳤다(2026-07-18). 최종 문구는 결국 사용자에게 그대로 보인다.
      const messages = [
        ...[...seg.matchAll(/ok: false,\s*\n\s*message:\s*(?:`([^`]{3,300})`|'([^']{3,300})')/g)]
          .map((m) => m[1] ?? m[2]),
        ...[...seg.matchAll(/(?:problems|issues|msgs|reasons|parts)\.push\(\s*`([^`]{3,300})`/g)]
          .map((m) => m[1]),
      ]
      out.push({
        file: f,
        id: ids[i][1],
        audience: /audience: 'staff'/.test(seg) ? 'staff' : 'customer',
        allowDate: /allowDate: true/.test(seg),
        severity: (seg.match(/severity: '(\w+)'/) ?? [])[1] ?? '?',
        messages,
      })
    }
  }
  return out
}

const rules = parseRules()

// ── A. 날짜 보간 가드 ────────────────────────────────────────────────
const violations: string[] = []
for (const r of rules) {
  if (r.audience !== 'customer' || r.allowDate) continue
  if (r.severity === 'info') continue // '안내'는 카드 설명문 쪽 — 여기선 주의·차단만
  for (const m of r.messages) {
    if (DATE_LIKE.test(m)) violations.push(`  ${r.id}\n      ${m.slice(0, 140)}`)
  }
}

// ── B. 골든 스냅샷 ───────────────────────────────────────────────────
const lines: string[] = [
  '# 고객 노출 주의 문구 스냅샷 — scripts/lint-checks.ts 로 자동 생성.',
  '# audience:customer + severity(warning|blocker) 룰의 ok:false 문구만. staff 전용은 제외.',
  '# 변경 의도가 맞는지 확인 후 `pnpm lint:checks:write` 로 갱신할 것.',
  '',
]
for (const r of rules.filter((x) => x.audience === 'customer' && x.severity !== 'info')) {
  if (r.messages.length === 0) continue
  lines.push(`[${r.id}]${r.allowDate ? '  (allowDate)' : ''}`)
  for (const m of r.messages) lines.push(`  ${m.replace(/\s+/g, ' ').trim()}`)
}
const next = lines.join('\n') + '\n'

if (WRITE) {
  writeFileSync(SNAPSHOT, next, 'utf-8')
  console.log(`✓ checks 스냅샷 갱신 — 고객 노출 문구 ${lines.filter((l) => l.startsWith('[')).length}건`)
} else if (violations.length > 0) {
  console.error(`✗ 고객 노출 문구에 날짜·개인정보 보간이 있습니다 (${violations.length}건)\n`)
  console.error(violations.join('\n'))
  console.error(`\n  → 날짜 없는 문구로 바꾸거나(packages/domain/src/procedure-checks/messages.ts 의 공용 문구 사용),`)
  console.error(`    날짜가 정보 자체라면 그 룰에 allowDate: true 를 선언하세요.`)
  process.exit(1)
} else if (!existsSync(SNAPSHOT)) {
  console.error('✗ 스냅샷이 없습니다. `pnpm lint:checks:write` 로 최초 생성하세요.')
  process.exit(1)
} else if (readFileSync(SNAPSHOT, 'utf-8').replace(/\r\n/g, '\n') !== next) {
  console.error('✗ 고객 노출 주의 문구가 스냅샷과 다릅니다. 변경 의도를 확인하세요:\n')
  const prev = readFileSync(SNAPSHOT, 'utf-8').replace(/\r\n/g, '\n').split('\n')
  const cur = next.split('\n')
  const prevSet = new Set(prev)
  const curSet = new Set(cur)
  for (const l of prev) if (!curSet.has(l) && l.trim()) console.error(`  - ${l.trim().slice(0, 130)}`)
  for (const l of cur) if (!prevSet.has(l) && l.trim()) console.error(`  + ${l.trim().slice(0, 130)}`)
  console.error('\n  → 의도한 변경이면 `pnpm lint:checks:write`')
  process.exit(1)
} else {
  console.log(`✓ checks lint: 고객 노출 문구 ${rules.filter((r) => r.audience === 'customer' && r.severity !== 'info').length}개 룰 — 날짜 노출 없음 + 스냅샷 일치`)
}
