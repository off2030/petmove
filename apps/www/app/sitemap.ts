import type { MetadataRoute } from 'next'
import { listSlugs } from '@/lib/content'

const BASE = 'https://www.petmove.co.kr'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/guide/', '/contact/'].map((p) => ({ url: `${BASE}${p || '/'}` }))
  const docs = listSlugs('docs').map((s) => ({ url: `${BASE}/docs/${s}/` }))
  const blog = listSlugs('blog').map((s) => ({ url: `${BASE}/blog/${s}/` }))
  return [...pages, ...docs, ...blog]
}
