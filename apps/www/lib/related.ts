// '함께 보면 좋은 글' — 여행지 묶음(COUNTRY_POSTS)을 단일 출처로 재사용.
// 글 하단(CTA 아래)에 같은 여행지의 나머지 글을 자동 노출한다. 새 글이 생기면
// site-data.ts 의 COUNTRY_POSTS 에만 추가하면 묶음 전체 글에 반영된다.
import { COUNTRY_POSTS, type PostRef } from './site-data'

const CLUSTER_BY_SLUG: Record<string, PostRef[]> = {}
for (const posts of Object.values(COUNTRY_POSTS)) {
  for (const p of posts) CLUSTER_BY_SLUG[p.slug] = posts
}

/** 현재 글을 뺀 같은 여행지 글 목록. 묶음이 없는 글(주제글·단일 가이드국)은 빈 배열. */
export function relatedPosts(slug: string): PostRef[] {
  const cluster = CLUSTER_BY_SLUG[slug]
  if (!cluster) return []
  return cluster.filter((p) => p.slug !== slug)
}
