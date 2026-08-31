// 구조화 데이터(JSON-LD) — 검색엔진에 사이트·글의 성격을 알려준다.
//
// 넣은 것과 이유:
//  · Organization  — 발행처가 로잔동물의료센터임을 명시. 사이트명·로고·연락처.
//  · WebSite       — 사이트 이름 확정(검색결과 상단 표기가 도메인 대신 '펫무브'로).
//  · BreadcrumbList — 검색결과에 '펫무브 > 가이드 > 지역별 가이드' 경로가 표시된다.
//                    구글이 지금도 실제로 렌더하는 몇 안 되는 리치 결과.
//  · Article       — 문서 성격·발행일·수정일·발행처 전달. datePublished 는 이 사이트에서
//                    처음 발행한 글에만 넣는다(고스트 이관분은 원 발행일을 알 수 없어 생략).
//
// ⚠️ FAQPage 는 넣지 않았다. 이 사이트엔 문답형 소제목이 1,400개 넘어 형식은 딱 맞지만,
//    구글이 2023년 8월부터 FAQ 리치 결과를 정부·의료 기관 사이트에만 노출하도록 축소해
//    표시될 가능성이 낮다. 마크업만 늘고 효과가 없어 보류한다(정책이 바뀌면 재검토).
import type { Article } from '@/lib/content'

const BASE = 'https://www.petmove.co.kr'
const ORG_ID = `${BASE}/#organization`
const SITE_ID = `${BASE}/#website`

function Ld({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // 자체 생성 데이터라 신뢰 소스. </script> 이스케이프만 방어한다.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

/** 사이트 전역 — 발행처·사이트명. 모든 페이지 공통(layout). */
export function SiteJsonLd() {
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': ORG_ID,
            name: '펫무브',
            alternateName: 'PETMOVE',
            url: BASE,
            logo: `${BASE}/img/og.png`,
            description: '반려동물 해외 이동·검역 준비를 돕는 서비스. 로잔동물의료센터 운영.',
            parentOrganization: { '@type': 'VeterinaryCare', name: '로잔동물의료센터' },
            address: {
              '@type': 'PostalAddress',
              streetAddress: '관악로29길 3',
              addressLocality: '관악구',
              addressRegion: '서울',
              addressCountry: 'KR',
            },
            contactPoint: {
              '@type': 'ContactPoint',
              telephone: '+82-2-872-7588',
              contactType: 'customer service',
              areaServed: 'KR',
              availableLanguage: 'Korean',
            },
            sameAs: ['https://blog.naver.com/petmove'],
          },
          {
            '@type': 'WebSite',
            '@id': SITE_ID,
            url: BASE,
            name: '펫무브',
            inLanguage: 'ko-KR',
            publisher: { '@id': ORG_ID },
          },
        ],
      }}
    />
  )
}

/** "2026.08.04" → "2026-08-04". 형식이 어긋나면 undefined(속성 자체를 뺀다). */
function isoDate(updated: string | undefined): string | undefined {
  if (!updated) return undefined
  const d = updated.replace(/\./g, '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined
}

/** 글 페이지 — 문서 성격 + 검색결과 경로 표시. */
export function ArticleJsonLd({ article }: { article: Article }) {
  const url = `${BASE}/${article.kind}/${article.slug}/`
  const modified = isoDate(article.updated)
  const published = isoDate(article.published)
  return (
    <Ld
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            '@id': `${url}#article`,
            mainEntityOfPage: url,
            headline: article.title,
            description: article.description,
            inLanguage: 'ko-KR',
            ...(article.feature_image ? { image: `${BASE}${article.feature_image}` } : {}),
            ...(published ? { datePublished: published } : {}),
            ...(modified ? { dateModified: modified } : {}),
            author: { '@id': ORG_ID },
            publisher: { '@id': ORG_ID },
            isPartOf: { '@id': SITE_ID },
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${url}#breadcrumb`,
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: '가이드', item: `${BASE}/guide/` },
              { '@type': 'ListItem', position: 2, name: article.category, item: `${BASE}/guide/` },
              { '@type': 'ListItem', position: 3, name: article.title },
            ],
          },
        ],
      }}
    />
  )
}
