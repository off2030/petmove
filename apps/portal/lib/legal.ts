import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { marked } from 'marked'

/**
 * docs/legal/{slug}.md 를 읽어 HTML 로 렌더링.
 *
 * 경로: monorepo 루트의 docs/legal/. portal 앱이 cwd 이므로 ../../ 로 거슬러 올라간다.
 * Vercel 배포 시엔 next.config.mjs 의 outputFileTracingIncludes 가 이 파일을 함수 번들에 포함.
 *
 * 1차 초안 placeholder (`[운영주체 법인명]` 등) 가 그대로 들어 있어도 페이지는 렌더 — 게시 전
 * 사용자가 placeholder 채우고 외부 법무 검토 마치는 것이 사용자 액션 (docs/portal-plan.md §10).
 */
export async function renderLegalDoc(slug: 'terms' | 'privacy'): Promise<string> {
  const filePath = path.join(process.cwd(), '..', '..', 'docs', 'legal', `${slug}.md`)
  const md = await readFile(filePath, 'utf-8')
  return marked.parse(md, { gfm: true, async: false }) as string
}
