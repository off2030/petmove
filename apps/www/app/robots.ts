import type { MetadataRoute } from 'next'
import { BLOCKED_CRAWLER_TOKENS, SEARCH_CRAWLER_TOKENS } from '@/lib/crawler-policy'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Search discovery remains enabled, including Google, Naver, Bing, and
      // answer-engine search crawlers. Training crawlers are handled below.
      { userAgent: [...SEARCH_CRAWLER_TOKENS], allow: '/' },
      { userAgent: [...BLOCKED_CRAWLER_TOKENS], disallow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: 'https://www.petmove.co.kr/sitemap.xml',
  }
}
