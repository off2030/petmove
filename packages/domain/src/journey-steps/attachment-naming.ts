/**
 * 첨부 파일 표시 이름 결정. step 에 attachmentLabel 이 설정돼 있으면
 * 원본 파일명을 무시하고 그 라벨로 표시 — 같은 step 의 기존 업로드 개수에 따라
 * '_2', '_3' 접미사로 중복 방지.
 *
 * label 미설정 step 은 원본 파일명 그대로. 메모 섹션의 직접 업로드 등 stepId
 * 없는 경로도 원본 유지.
 *
 * storage path 는 별개 — 호출자가 항상 unique path 를 만들어 사용.
 */

import { JOURNEY_STEP_CATALOG } from './catalog'

/** 'foo.bar.jpg' → '.jpg'. 확장자 없으면 ''. */
function extractExtension(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i)
}

/**
 * 기존 이름이 label 패턴(label 또는 label_N) 과 매칭되면 N 반환, 아니면 null.
 * label = '광견병 항체가 검사 결과지'
 *   '광견병 항체가 검사 결과지.jpg' → 1
 *   '광견병 항체가 검사 결과지_3.pdf' → 3
 *   'IMG_001.jpg' → null
 */
function parseLabelNumber(name: string, label: string): number | null {
  const ext = extractExtension(name)
  const base = ext ? name.slice(0, -ext.length) : name
  if (base === label) return 1
  const prefix = `${label}_`
  if (!base.startsWith(prefix)) return null
  const rest = base.slice(prefix.length)
  const n = Number(rest)
  return Number.isInteger(n) && n >= 2 ? n : null
}

/**
 * 첨부 표시 이름 결정 — pure. 카탈로그 의존 없음.
 *
 * @param attachmentLabel step.attachmentLabel (undefined 면 원본 사용)
 * @param originalFileName 사용자가 올린 파일 이름 (확장자 보존용)
 * @param existingNames 같은 step 의 기존 파일 이름 목록 (gap-fill 용)
 * @returns 저장할 표시 이름
 */
export function resolveAttachmentName(
  attachmentLabel: string | undefined,
  originalFileName: string,
  existingNames: string[],
): string {
  if (!attachmentLabel) return originalFileName
  const ext = extractExtension(originalFileName)
  const used = new Set<number>()
  for (const n of existingNames) {
    const m = parseLabelNumber(n, attachmentLabel)
    if (m !== null) used.add(m)
  }
  // 빈 자리 채우기 — 삭제 후 재업로드 시 gap 우선 사용.
  let n = 1
  while (used.has(n)) n++
  const base = n === 1 ? attachmentLabel : `${attachmentLabel}_${n}`
  return base + ext
}

/**
 * 카탈로그를 참조하는 편의 함수. stepId 로 attachmentLabel 조회 + 동일 stepId 의
 * 기존 documents 이름만 추려 resolveAttachmentName 위임.
 */
export function resolveStepAttachmentName(
  stepId: string,
  originalFileName: string,
  existingDocs: Array<{ stepId?: string; name?: string }>,
): string {
  const step = JOURNEY_STEP_CATALOG.find((s) => s.id === stepId)
  const label = step?.attachmentLabel
  if (!label) return originalFileName
  const sameStepNames = existingDocs
    .filter((d) => d.stepId === stepId && typeof d.name === 'string')
    .map((d) => d.name as string)
  return resolveAttachmentName(label, originalFileName, sameStepNames)
}
