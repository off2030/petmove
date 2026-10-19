'use client'

// 플랫폼형 홈 시안(/lab/home) — 비공개. 첫 화면 = "어디로 떠나시나요?" 검색.
// 앱 다운로드가 아니라 검색·바로 답이 맨 앞이고, 앱·직영 서비스는 맨 뒤로 내려간다.
// 광고(업체 찾기)는 규정 정보와 섞이지 않게 자기 구역에만 둔다.
import { useEffect, useMemo, useState } from 'react'
import { LogoMark } from '@/components/logo-mark'
import { SiteFooter } from '@/components/site-footer'
import { AppLink } from '@/components/app-link'
import {
  COUNTRIES,
  OTHER_GROUPS,
  CONTACT,
  buildSearchIndex,
  postPath,
} from '@/lib/site-data'
import {
  QUICK_FACTS,
  TIER_LABEL,
  TIER_COUNTRIES,
  POPULAR,
  RULE_NEWS,
  HUB_CATEGORIES,
  type QuickFact,
  type Species,
  type PrepTier,
} from '@/lib/lab-home-data'

const APP_URL = 'https://app.petmove.co.kr/'
const YEARS = new Date().getFullYear() - 2006
const TIERS: PrepTier[] = ['long', 'mid', 'short']

const countryKo = (slug: string) => COUNTRIES.find((c) => c.slug === slug)?.ko ?? slug
const guideHref = (slug: string) => `/docs/${slug}-pet-travel-guide/`

function findFact(q: string): QuickFact | null {
  if (!q) return null
  for (const f of QUICK_FACTS) {
    const names = [f.ko, ...f.aliases]
    // 문장 속 나라 이름("일본 항체검사") 또는 입력 중인 앞부분("일") 둘 다 잡는다.
    if (names.some((n) => q.includes(n) || n.startsWith(q))) return f
  }
  return null
}

function fmt(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function verdict(fact: QuickFact, depart: string, today: Date | null) {
  if (!depart || !today) return null
  const d = new Date(`${depart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const left = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  const earliest = new Date(today.getTime() + fact.prepDays * 86_400_000)
  if (left < 0) return { tone: 'bad', title: '이미 지난 날짜예요', sub: '출국 예정일을 다시 골라 주세요' }
  if (left >= fact.prepDays * 1.2)
    return { tone: 'ok', title: `출국까지 ${left}일, 여유 있어요`, sub: `최소 준비 기간 ${fact.prepLabel}` }
  if (left >= fact.prepDays)
    return { tone: 'warn', title: `출국까지 ${left}일, 빠듯해요`, sub: '오늘 바로 시작하는 게 좋아요' }
  return {
    tone: 'bad',
    title: '이 날짜엔 어려울 수 있어요',
    sub: `처음부터 준비하면 가장 빠른 출국은 ${fmt(earliest)} 무렵이에요`,
  }
}

export function LabHome() {
  const [query, setQuery] = useState('')
  const [species, setSpecies] = useState<Species>('dog')
  const [depart, setDepart] = useState('')
  const [today, setToday] = useState<Date | null>(null)
  const index = useMemo(() => buildSearchIndex(), [])

  // 오늘 날짜는 클라이언트에서만 — 정적 빌드 시점 날짜가 박히면 계산이 틀어진다.
  useEffect(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    setToday(t)
  }, [])

  const q = query.trim().toLowerCase()
  const fact = findFact(q)
  const plainCountry = !fact && q ? COUNTRIES.find((c) => c.ko.startsWith(q) || q.includes(c.ko)) : undefined
  const hits = q
    ? index
        .filter((p) => {
          const hay = `${p.t} ${p.g}`.toLowerCase()
          // 여러 낱말 질문("일본 항체")은 낱말마다 하나라도 맞으면 후보로 둔다.
          return q.split(/\s+/).every((w) => hay.includes(w)) || (fact && p.g === fact.ko)
        })
        .slice(0, 6)
    : []
  const v = fact ? verdict(fact, depart, today) : null

  return (
    <div className="pg pg-lab">
      <header className="lh">
        <div className="container">
          <a href="/lab/home/" className="lh-logo">
            <LogoMark />
            <span className="wm">펫무브</span>
            <span className="lab-pill">비공개 시안</span>
          </a>
          <nav className="lh-nav">
            <a href="/guide/">나라별 검역</a>
            <a href="#tools">검역 도구</a>
            <a href="#hub">업체 찾기</a>
            <a href="#news">소식</a>
          </nav>
          <a className="lh-me" href={APP_URL}>
            <i className="ti ti-route" />
            내 여정
          </a>
        </div>
      </header>

      <section className="lhero">
        <div className="container">
          <span className="eyebrow">62개국 반려동물 검역 정보 · 수의사 감수</span>
          <h1>어디로 떠나시나요?</h1>
          <p className="lead">나라를 고르면 필요한 접종·검사·서류와 준비 기간을 바로 알려드려요</p>

          <div className="qbox">
            <label className="qsearch">
              <i className="ti ti-search" />
              <input
                type="search"
                placeholder="나라 또는 궁금한 점 (일본 항체검사)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="나라 또는 궁금한 점 검색"
              />
              {query && (
                <button className="qclear" onClick={() => setQuery('')} aria-label="지우기">
                  <i className="ti ti-x" />
                </button>
              )}
            </label>
            <div className="qopts">
              <div className="seg" role="group" aria-label="반려동물 종류">
                <button className={species === 'dog' ? 'on' : ''} onClick={() => setSpecies('dog')}>강아지</button>
                <button className={species === 'cat' ? 'on' : ''} onClick={() => setSpecies('cat')}>고양이</button>
              </div>
              <label className="qdate">
                <span>출국 예정일</span>
                <input
                  type="date"
                  value={depart}
                  min={today ? today.toISOString().slice(0, 10) : undefined}
                  onChange={(e) => setDepart(e.target.value)}
                />
              </label>
            </div>
          </div>

          {!q && (
            <div className="popular">
              {POPULAR.map((s) => (
                <button key={s} onClick={() => setQuery(countryKo(s))}>{countryKo(s)}</button>
              ))}
            </div>
          )}

          {fact && (
            <div className="answer">
              <div className="ans-h">
                <div>
                  <div className="ans-t">
                    {fact.ko} · {species === 'dog' ? '강아지' : '고양이'}
                    {fact.oneWayOnly && <span className="tag">편도 이주형</span>}
                  </div>
                  <div className="ans-s">처음부터 준비하면 최소 {fact.prepLabel}</div>
                </div>
                <a className="ans-link" href={guideHref(fact.slug)}>
                  총정리 <i className="ti ti-chevron-right" />
                </a>
              </div>
              <dl className="facts">
                {fact.rows
                  .filter((r) => !r.species || r.species === species)
                  .map((r) => (
                    <div key={r.label}>
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
              </dl>
              {v ? (
                <div className={`verdict ${v.tone}`}>
                  <i className="ti ti-calendar-plus" />
                  <div>
                    <b>{v.title}</b>
                    <span>{v.sub}</span>
                  </div>
                </div>
              ) : (
                <p className="ans-hint">
                  <i className="ti ti-calendar-plus" /> 출국 예정일을 넣으면 일정이 되는지 알려드려요
                </p>
              )}
              <div className="ans-cta">
                <a className="btn-main" href={APP_URL}>
                  이 일정으로 준비 시작 <i className="ti ti-arrow-right" />
                </a>
                <span className="ans-note">앱 설치 없이 웹에서 바로 · 이미 접종했다면 기간이 짧아져요</span>
              </div>
            </div>
          )}

          {!fact && plainCountry && (
            <a className="answer answer-plain" href={guideHref(plainCountry.slug)}>
              <span>{plainCountry.ko} 입국 준비 총정리</span>
              <i className="ti ti-chevron-right" />
            </a>
          )}

          {q && hits.length > 0 && (
            <div className="hits">
              <div className="hits-h">관련 글</div>
              {hits.map((h) => (
                <a key={h.u} href={h.u}>
                  <span>{h.t}</span>
                  <span className="rtag">{h.g}</span>
                </a>
              ))}
            </div>
          )}
          {q && !fact && !plainCountry && hits.length === 0 && (
            <p className="nohit">찾는 내용이 없어요. 나라 이름으로 검색해 보세요.</p>
          )}
        </div>
      </section>

      <div className="ltrust">
        <div className="container">
          <div><b>{COUNTRIES.length}개국</b><span>나라별 가이드</span></div>
          <div><b>5,300+</b><span>누적 출국</span></div>
          <div><b>{YEARS}년+</b><span>검역 경험</span></div>
          <div><b>수의사</b><span>직접 감수</span></div>
        </div>
      </div>

      <section className="lsec">
        <div className="container">
          <div className="sec-head">
            <h2>준비 기간으로 보는 나라</h2>
            <a href="/guide/">전체 {COUNTRIES.length}개국 <i className="ti ti-chevron-right" /></a>
          </div>
          <div className="tiers">
            {TIERS.map((t) => (
              <div className={`tier tier-${t}`} key={t}>
                <div className="tier-t">{TIER_LABEL[t].title}</div>
                <div className="tier-s">{TIER_LABEL[t].sub}</div>
                <div className="chips">
                  {TIER_COUNTRIES[t].map((s) => (
                    <a key={s} href={guideHref(s)}>{countryKo(s)}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lsec alt" id="tools">
        <div className="container">
          <div className="sec-head">
            <h2>검역 도구</h2>
          </div>
          <div className="tools">
            <button className="tool" onClick={() => {
              if (!q) setQuery('일본')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}>
              <i className="ti ti-calendar-plus" />
              <b>출국 가능일 계산</b>
              <span>출국일까지 준비가 되는지 확인해요</span>
            </button>
            <div className="tool soon">
              <i className="ti ti-clock" />
              <b>항체검사 유효기간</b>
              <span>입국용·귀국용 만료일을 함께 계산해요</span>
              <em>준비 중</em>
            </div>
            <div className="tool soon">
              <i className="ti ti-clipboard-check" />
              <b>나라 비교</b>
              <span>두 나라 요건을 나란히 비교해요</span>
              <em>준비 중</em>
            </div>
          </div>
        </div>
      </section>

      <section className="lsec">
        <div className="container two">
          <div id="news">
            <div className="sec-head">
              <h2>규정 변경 소식</h2>
            </div>
            <div className="news">
              {RULE_NEWS.map((n) => (
                <a key={n.href} href={n.href}>
                  <span className="when">{n.when}</span>
                  <span className="what"><b>{n.country}</b> {n.title}</span>
                  <i className="ti ti-chevron-right" />
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="sec-head">
              <h2>주제별 가이드</h2>
            </div>
            <div className="topics">
              {OTHER_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="topic-t">{g.label}</div>
                  {g.items.map((p) => (
                    <a key={p.slug} href={postPath(p)}>{p.title}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lsec alt" id="hub">
        <div className="container">
          <div className="sec-head">
            <h2>업체 찾기</h2>
            <span className="sec-note">규정 정보와 별개로 운영되는 구역이에요</span>
          </div>
          <div className="hub">
            {HUB_CATEGORIES.map((c) =>
              c.href ? (
                <a className="hcat" key={c.title} href={c.href}>
                  <b>{c.title}</b>
                  <span>{c.desc}</span>
                </a>
              ) : (
                <div className="hcat soon" key={c.title}>
                  <b>{c.title}</b>
                  <span>{c.desc}</span>
                  <em>준비 중</em>
                </div>
              ),
            )}
          </div>
          <div className="sponsor">
            <span className="ad">광고</span>
            <div>
              <b>협찬 자리 (시안)</b>
              <span>업종마다 최대 2곳 · 같은 크기 카드 · 규정 카드 안에는 넣지 않아요</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lsec">
        <div className="container two">
          <div className="pcard dark">
            <i className="ti ti-device-mobile" />
            <h3>PC·모바일·앱, 어디서나 같은 여정</h3>
            <p>설치 없이 웹에서 바로 시작하고, 일정 알림은 앱으로 받아요</p>
            <div className="pbtns">
              <a className="btn-main" href={APP_URL}>웹에서 시작하기</a>
              <AppLink className="btn-line" fallbackHref="/download/">
                <i className="ti ti-download" /> 앱 받기
              </AppLink>
            </div>
          </div>
          <div className="pcard">
            <i className="ti ti-heart-plus" />
            <h3>복잡하면 전문가에게 맡기세요</h3>
            <p>로잔동물의료센터 수의사가 전 과정을 직접 준비해요</p>
            <div className="pbtns">
              <a className="btn-line" href={CONTACT.kakao} target="_blank" rel="noopener">
                <i className="ti ti-message-circle" /> 상담하기
              </a>
              <a className="btn-line" href={`tel:${CONTACT.tel}`}>
                <i className="ti ti-phone" /> {CONTACT.tel}
              </a>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
