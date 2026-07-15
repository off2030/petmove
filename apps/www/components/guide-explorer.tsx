'use client'

// 가이드 허브 본문 — 검색(전체 69글) + 인기 가이드 + 여행지별/주제별 칩→목록 패널.
// 프로토타입의 vanilla JS(칩 토글·전체 검색)를 React 상태로 이식.
import { useMemo, useState } from 'react'
import {
  FEATURED,
  REGIONS,
  COUNTRIES,
  COUNTRY_POSTS,
  OTHER_GROUPS,
  countryGuideSlug,
  postPath,
  buildSearchIndex,
  type PostRef,
} from '@/lib/site-data'

function PostRows({ posts, mainFirst = false }: { posts: PostRef[]; mainFirst?: boolean }) {
  return (
    <div className="cpanel">
      {posts.map((p, i) => (
        <a className={`cprow${mainFirst && i === 0 ? ' main' : ''}`} href={postPath(p)} key={p.slug}>
          <span>{p.title}</span>
          <i className="ti ti-chevron-right" />
        </a>
      ))}
    </div>
  )
}

export function GuideExplorer() {
  const [query, setQuery] = useState('')
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const index = useMemo(() => buildSearchIndex(), [])

  const q = query.trim().toLowerCase()
  const hits = q ? index.filter((p) => `${p.t} ${p.g} ${p.u}`.toLowerCase().includes(q)) : null

  const toggle = (id: string) => setOpenPanel((cur) => (cur === id ? null : id))
  const chipKeyDown = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(id)
    }
  }

  return (
    <>
      <div className="phead">
        <div className="container">
          <h1>가이드</h1>
          <p className="lead">여행지별 검역 준비 방법을 확인하세요</p>
          <div className="search">
            <i className="ti ti-search" />
            <input
              type="text"
              placeholder="가이드 검색 (예: 일본, 검역)"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpenPanel(null)
              }}
            />
          </div>
        </div>
      </div>

      {hits && (
        <section>
          <div className="container">
            <h2 className="sec-h">검색 결과</h2>
            {hits.length ? (
              <div className="cpanel" style={{ marginTop: 0 }}>
                {hits.map((p) => (
                  <a className="cprow" href={p.u} key={p.u}>
                    <span>{p.t}</span>
                    <span className="rtag">{p.g}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="no-hit">검색 결과가 없어요</div>
            )}
          </div>
        </section>
      )}

      {!hits && (
        <>
          <section>
            <div className="container">
              <h2 className="sec-h">인기 가이드</h2>
              <div className="feat">
                {FEATURED.map((f) => (
                  <a className="fcard" href={postPath(f)} key={f.slug}>
                    <span className="ftxt">
                      <span className="ft">{f.title}</span>
                      <span className="fx">{f.excerpt}</span>
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="fthumb" src={f.image} alt="" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          </section>

          <section style={{ background: 'var(--surface)', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
            <div className="container">
              <h2 className="sec-h">여행지별 가이드</h2>
              <div>
                {REGIONS.map((region) => {
                  const countries = COUNTRIES.filter((c) => c.region === region)
                  return (
                    <div key={region}>
                      <div className="region">{region}</div>
                      <div className="cgrid">
                        {countries.map((c) => {
                          const posts = COUNTRY_POSTS[c.slug]
                          if (!posts) {
                            return (
                              <a className="chip" href={`/docs/${countryGuideSlug(c)}/`} key={c.slug}>
                                {c.ko}
                              </a>
                            )
                          }
                          const id = `cp-${c.slug}`
                          return (
                            <a
                              className={`chip chip-m${openPanel === id ? ' on' : ''}`}
                              role="button"
                              tabIndex={0}
                              key={c.slug}
                              onClick={() => toggle(id)}
                              onKeyDown={chipKeyDown(id)}
                            >
                              {c.ko}
                              <span className="cnum">{posts.length}</span>
                            </a>
                          )
                        })}
                      </div>
                      {countries
                        .filter((c) => COUNTRY_POSTS[c.slug] && openPanel === `cp-${c.slug}`)
                        .map((c) => (
                          <PostRows posts={COUNTRY_POSTS[c.slug]} mainFirst key={c.slug} />
                        ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section>
            <div className="container">
              <h2 className="sec-h">주제별 가이드</h2>
              <div className="cgrid">
                {OTHER_GROUPS.map((grp) => {
                  const id = `tp-${grp.label}`
                  return (
                    <a
                      className={`chip chip-m${openPanel === id ? ' on' : ''}`}
                      role="button"
                      tabIndex={0}
                      key={grp.label}
                      onClick={() => toggle(id)}
                      onKeyDown={chipKeyDown(id)}
                    >
                      {grp.label}
                      <span className="cnum">{grp.items.length}</span>
                    </a>
                  )
                })}
              </div>
              {OTHER_GROUPS.filter((grp) => openPanel === `tp-${grp.label}`).map((grp) => (
                <PostRows posts={grp.items} key={grp.label} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}
