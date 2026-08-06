#!/usr/bin/env node
/**
 * 설정 화면 크기 규격 검사 (2026-08-06 신설).
 *
 * 펫무브워크 설정은 컨트롤·칩 크기를 sm(22px) / md(32px) / lg(44px) 세 단으로만 쓴다.
 * 규격은 `components/settings/settings-layout.tsx` 한 곳에 있고, 각 화면은
 * `SettingsControlGroup` 으로 무리의 크기를 선언한 뒤 부품이 물려받게 한다.
 *
 * 그런데 부품을 안 쓰고 클래스를 직접 적으면 규격 밖 크기가 조용히 늘어난다 —
 * 실제로 h-8 / h-[28px] / h-7 / h-9 / h-[22px] 다섯 종류가 섞여 한 줄 안에서
 * 22px 배지와 32px 드롭다운이 나란히 서는 상태였다. 그래서 **설정 폴더에서
 * 높이 클래스를 직접 쓰는 것 자체를 막는다.**
 *
 * 걸리면 고치는 법:
 *   - 버튼·칩·드롭다운  → SettingsActionButton / SettingsChip / SettingsSelectTrigger …
 *   - 무리의 크기 선언  → <SettingsControlGroup size="sm|md|lg">
 *   - 테두리 있는 입력  → SETTINGS_BOXED_INPUT_CLASS
 *   - 아이콘 크기(h-3, h-4 등)는 검사 대상이 아니다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIR = path.join(ROOT, 'apps/admin/components/settings')

/** 규격이 사는 곳 — 여기서만 높이를 직접 적는다. */
const ALLOWED_FILES = new Set(['settings-layout.tsx'])

/**
 * 컨트롤 높이로 쓰이는 클래스. h-5 이하는 아이콘·체크박스라 대상 밖.
 * (h-6 = 24px 부터가 "컨트롤" 영역.)
 */
const HEIGHT_RE = /\bh-(?:(?:[6-9]|1[0-9]|2[0-9])(?:\.5)?|\[\d+(?:\.\d+)?px\])\b/g

/** 라인 단위 예외 — 뒤에 이유를 적는다. */
const IGNORE_MARK = 'settings-size-ok'

const problems = []

for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith('.tsx') || ALLOWED_FILES.has(file)) continue
  const full = path.join(DIR, file)
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes(IGNORE_MARK)) return
    const hits = line.match(HEIGHT_RE)
    if (!hits) return
    problems.push({
      file: `apps/admin/components/settings/${file}`,
      line: i + 1,
      hits: [...new Set(hits)].join(', '),
      text: line.trim().slice(0, 120),
    })
  })
}

if (problems.length === 0) {
  console.log('설정 크기 규격 ✓ — 높이 클래스를 직접 쓴 곳 없음')
  process.exit(0)
}

console.error(`\n설정 크기 규격 위반 ${problems.length}건 — 높이를 직접 적지 말고 공용 부품을 쓸 것\n`)
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  [${p.hits}]`)
  console.error(`    ${p.text}`)
}
console.error(`
  고치는 법
    버튼·칩·드롭다운   → SettingsActionButton / SettingsChip / SettingsSelectTrigger / SettingsIconButton
    무리의 크기 선언    → <SettingsControlGroup size="sm|md|lg">
    테두리 있는 입력    → SETTINGS_BOXED_INPUT_CLASS
    정말 예외라면       → 해당 줄에 ${IGNORE_MARK} 주석 + 이유
`)
process.exit(1)
