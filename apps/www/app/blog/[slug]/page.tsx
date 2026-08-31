import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleShell } from '@/components/article-shell'
import { ArticleJsonLd } from '@/components/structured-data'
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
    title: a.title,
    description: a.description,
    // trailingSlash: true 라 /blog/x 와 /blog/x/ 가 함께 존재할 수 있다 — 정본을 명시한다.
    alternates: { canonical: `/blog/${slug}/` },
    openGraph: {
      type: 'article',
      siteName: '펫무브',
      url: `/blog/${slug}/`,
      title: a.title,
      description: a.description,
      ...(a.feature_image ? { images: [a.feature_image] } : {}),
    },
  }
}

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticle('blog', slug)
  if (!article) notFound()
  return (
    <>
      <ArticleJsonLd article={article} />
      <ArticleShell article={article} />
    </>
  )
}
