/**
 * Crawlers that should keep access to public pages for search discovery.
 *
 * User-Agent checks preserve discoverability, but they are not identity
 * verification because a scraper can spoof these values. Production traffic
 * should additionally use the hosting provider's verified-bot WAF signal.
 */
export const SEARCH_CRAWLER_TOKENS = [
  'Googlebot',
  'Google-InspectionTool',
  'bingbot',
  'BingPreview',
  'Yeti',
  'Daumoa',
  'DuckDuckBot',
  'Applebot',
  'OAI-SearchBot',
  'Claude-SearchBot',
  'PerplexityBot',
] as const

/** Crawlers used for model training, bulk datasets, or commercial SEO collection. */
export const BLOCKED_CRAWLER_TOKENS = [
  'GPTBot',
  'ClaudeBot',
  'Claude-Web',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'cohere-ai',
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  'Diffbot',
  'ImagesiftBot',
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'BLEXBot',
  'DataForSeoBot',
] as const

function containsToken(userAgent: string, tokens: readonly string[]): boolean {
  const normalized = userAgent.toLowerCase()
  return tokens.some((token) => normalized.includes(token.toLowerCase()))
}

export function isSearchCrawler(userAgent: string): boolean {
  return containsToken(userAgent, SEARCH_CRAWLER_TOKENS)
}

export function isBlockedCrawler(userAgent: string): boolean {
  return containsToken(userAgent, BLOCKED_CRAWLER_TOKENS)
}
