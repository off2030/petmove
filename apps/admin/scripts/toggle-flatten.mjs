#!/usr/bin/env node
/**
 * pdf-field-mappings.json 의 form 별 "flatten" 플래그를 surgical 토글.
 * 기존 JSON 포맷(인라인 객체 등) 보존 위해 정규식 in-place 편집.
 *
 * 사용:
 *   node scripts/toggle-flatten.mjs on   # OFFICIAL_CERTS 전체 ON (없으면 추가)
 *   node scripts/toggle-flatten.mjs off  # 전체 OFF (해당 라인 삭제)
 *
 * 추가 위치: 각 form 의 "dateFormat": "..." 라인 바로 뒤. dateFormat 이 없는
 * form 은 "filename": "..." 뒤에 추가.
 *
 * flatten=true 면 발급 PDF 가 폼 필드 평탄화되어 편집 불가 (위변조 방지).
 * 사용자 편집이 필요한 form (예: CH BLV 신청서) 은 OFFICIAL_CERTS 에서 제외.
 */
import { readFileSync, writeFileSync } from 'node:fs'

// flatten 적용 = 발급 PDF 의 폼 필드를 페이지 컨텐트로 굳혀 발급 후 편집
// 차단. 공식 제출용 증명서는 모두 ON.
//
// 제외 대상 (의도적):
//  - Invoice: preserveTemplateText 와의 상호작용 미검증 — 별도 점검 후 결정
const OFFICIAL_CERTS = [
  // 호주
  'AU', 'AU_2', 'AU_Cat', 'AU_Cat_2',
  'IdentificationDeclaration',
  // 뉴질랜드
  'NZ', 'NZ_2', 'OVD',
  // 한국 발급
  'Form25', 'Form25AuNz',
  'APQA_HQ', 'APQA_HQ_En',
  // 일본
  'FormRE', 'FormAC',
  // EU·영국·스위스
  'AnnexIII', 'UK', 'CH',
  // 기타 국가
  'SGP', 'AQS_279', 'Form_R11', 'VHC',
  // 검사 의뢰서
  'KSVDL', 'VBDDL',
]

const mode = process.argv[2]
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage: node scripts/toggle-flatten.mjs <on|off>')
  process.exit(1)
}

const path = 'apps/admin/data/pdf-field-mappings.json'
let src = readFileSync(path, 'utf8')

let changed = 0
for (const key of OFFICIAL_CERTS) {
  // form 블록 시작 위치 찾기 — 그 form 안에서만 dateFormat / filename / flatten 행 매칭.
  const formHeader = `  "${key}": {`
  const start = src.indexOf(formHeader)
  if (start < 0) {
    console.warn(`  · ${key}: not found`)
    continue
  }
  // 다음 form (또는 파일 끝) 까지가 이 form 의 영역.
  const nextHeaderRx = /\n  "[A-Za-z0-9_]+": \{/g
  nextHeaderRx.lastIndex = start + formHeader.length
  const m = nextHeaderRx.exec(src)
  const end = m ? m.index : src.length
  const block = src.slice(start, end)

  if (mode === 'on') {
    if (/"flatten":\s*true/.test(block)) continue
    // 삽입 anchor: dateFormat → filename → 첫 줄(template) 순으로 후보.
    const anchorRx = [
      /("dateFormat":\s*"[^"]+",?)\r?\n/,
      /("filename":\s*"[^"]+",?)\r?\n/,
      /("template":\s*"[^"]+",?)\r?\n/,
    ]
    let inserted = false
    for (const rx of anchorRx) {
      const am = rx.exec(block)
      if (!am) continue
      const insertAt = start + am.index + am[0].length
      // anchor 라인이 콤마 없이 끝났을 가능성 — 보장.
      const anchorWithComma = am[1].endsWith(',') ? am[1] : `${am[1]},`
      const replacement = `${anchorWithComma}\n    "flatten": true,\n`
      src = src.slice(0, start + am.index) + replacement + src.slice(start + am.index + am[0].length)
      console.log(`  ✓ ${key}: flatten ON`)
      changed++
      inserted = true
      break
    }
    if (!inserted) console.warn(`  ! ${key}: no anchor found, skipped`)
  } else {
    // OFF — flatten: true 행만 삭제 (콤마 처리 포함).
    const offRx = /\r?\n\s*"flatten":\s*true,?/
    if (!offRx.test(block)) continue
    const om = offRx.exec(block)
    if (!om) continue
    const absStart = start + om.index
    src = src.slice(0, absStart) + src.slice(absStart + om[0].length)
    console.log(`  ✗ ${key}: flatten OFF`)
    changed++
  }
}

if (changed === 0) {
  console.log('No changes.')
  process.exit(0)
}

// 안전망 — JSON 유효성 검증 후 저장.
try {
  JSON.parse(src)
} catch (e) {
  console.error('JSON 파싱 실패 — 변경 폐기:', e.message)
  process.exit(1)
}

writeFileSync(path, src, 'utf8')
console.log(`\n${changed} form(s) updated.`)
