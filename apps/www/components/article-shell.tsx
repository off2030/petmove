// 글 본문 셸 — article-sample.html(손편집 truth)의 crumb·art-head·prose·CTA 구조 이식.
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AppLink } from '@/components/app-link'
import { Toc } from '@/components/toc'
import type { Article } from '@/lib/content'
import { relatedPosts } from '@/lib/related'
import { postPath } from '@/lib/site-data'

export function ArticleShell({ article }: { article: Article }) {
  const related = relatedPosts(article.slug)
  return (
    <div className="pg pg-article">
      <SiteHeader active="guide" />
      <article className="article">
        <div className="crumb">
          <a href="/guide/">가이드</a>
          <span className="sep">›</span>
          <a href="/guide/">{article.category}</a>
        </div>
        <div className="art-head">
          <span className="art-cat">{article.category}</span>
          <h1>{article.title}</h1>
          <div className="art-meta">
            마지막 업데이트 {article.updated} · 읽는 데 약 {article.minutes}분
          </div>
        </div>

        {/* 본문 = 변환기 출력 HTML(자체 콘텐츠, 신뢰 소스). 커버·인트로·유용한 자료 포함. */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: article.html }} />
        <Toc />

        <hr className="cta-sep" />
        <div className="cta2">
          <a className="svc" href="/contact/">
            <i className="ti ti-message-circle" />
            전문가에게 맡기기
          </a>
          <AppLink className="app">
            <i className="ti ti-download" />
            무료 앱으로 시작하기
          </AppLink>
        </div>

        {/* 같은 여행지 글 묶음 — CTA 아래(전환 동선을 가리지 않는 위치). 데이터=lib/related.ts */}
        {related.length > 0 && (
          <div className="related">
            <div className="rel-h">함께 보면 좋은 글</div>
            {related.map((p) => (
              <a key={p.slug} href={postPath(p)}>
                <span>{p.title}</span>
                <i className="ti ti-arrow-right" />
              </a>
            ))}
          </div>
        )}
      </article>
      <SiteFooter />
    </div>
  )
}
