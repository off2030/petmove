import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleShell } from '@/components/article-shell'
import { getArticle, listSlugs } from '@/lib/content'

// 구 Ghost /blog/* 슬러그 29개 — content/blog 파일 목록이 곧 라우트(URL 100% 보존).
export const dynamicParams = false

export function generateStaticParams() {
  return listSlugs('blog').map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = getArticle('blog', slug)
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

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle('blog', slug)
  if (!article) notFound()
  return <ArticleShell article={article} />
}
