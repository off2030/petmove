import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleShell } from '@/components/article-shell'
import { getArticle, listSlugs } from '@/lib/content'

// 구 Ghost /docs/* 슬러그 40개 — content/docs 파일 목록이 곧 라우트(URL 100% 보존).
export const dynamicParams = false

export function generateStaticParams() {
  return listSlugs('docs').map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = getArticle('docs', slug)
  if (!a) return {}
  return {
    title: `${a.title} · 펫무브`,
    description: a.description,
    openGraph: {
      type: 'article',
      title: `${a.title} · 펫무브`,
      description: a.description,
      ...(a.feature_image ? { images: [a.feature_image] } : {}),
    },
  }
}

export default async function DocsArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle('docs', slug)
  if (!article) notFound()
  return <ArticleShell article={article} />
}
