import type { MetadataRoute } from 'next'
import { getArticle, listSlugs } from '@/lib/content'

const BASE = 'https://www.petmove.co.kr'

// content JSON 의 updated("2026.08.01") → Date. 파싱 실패 시 lastModified 생략.
function toDate(updated: string | undefined): Date | undefined {
  if (!updated) return undefined
  const d = new Date(updated.replace(/\./g, '-'))
  return Number.isNaN(d.getTime()) ? undefined : d
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/guide/', '/contact/'].map((p) => ({ url: `${BASE}${p || '/'}` }))
  const docs = listSlugs('docs').map((s) => ({
    url: `${BASE}/docs/${s}/`,
    lastModified: toDate(getArticle('docs', s)?.updated),
  }))
  const blog = listSlugs('blog').map((s) => ({
    url: `${BASE}/blog/${s}/`,
    lastModified: toDate(getArticle('blog', s)?.updated),
  }))
  return [...pages, ...docs, ...blog]
}
