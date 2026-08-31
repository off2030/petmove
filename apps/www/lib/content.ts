// 글 데이터 로더 — scripts/www_export_content.py 가 만든 content/{docs,blog}/<slug>.json.
// 전부 빌드 타임(SSG)에서만 호출된다.
import fs from 'node:fs'
import path from 'node:path'

export interface Article {
  slug: string
  kind: 'docs' | 'blog'
  title: string
  description: string
  category: string
  /** 최초 발행일 "2026.08.01". 고스트에서 이관한 글은 원 발행일을 알 수 없어 비워 둔다. */
  published?: string
  updated: string
  minutes: number
  feature_image: string | null
  html: string
}

const ROOT = path.join(process.cwd(), 'content')

export function listSlugs(kind: 'docs' | 'blog'): string[] {
  return fs
    .readdirSync(path.join(ROOT, kind))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
}

export function getArticle(kind: 'docs' | 'blog', slug: string): Article | null {
  const p = path.join(ROOT, kind, `${slug}.json`)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Article
}
