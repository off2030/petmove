// 랜딩(/) — 구 prototype-mobile.html 이식. 섹션 배경 교차:
// 흰(스트립) → 회(앱) → 흰(여행지) → 회(서비스) → 흰(후기) → 밴드 → 하늘 CTA → 흰 푸터.
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AppLink } from '@/components/app-link'
import { DestGrid } from '@/components/dest-grid'
import {
  APP_FEATURES,
  SERVICE_CARDS,
  APP_DEST_SOON,
  APP_DEST_TOTAL,
  REVIEWS,
  CONTACT,
} from '@/lib/site-data'
import { STORE_IOS, STORE_ANDROID } from '@/lib/store-links'

// 경험 연차 — 2006년 개원 기준(프로토타입 #yrs JS 이식, 빌드 시점 계산).
const YEARS = new Date().getFullYear() - 2006

export default function LandingPage() {
  return (
    <div className="pg pg-landing">
      <SiteHeader />

      <section className="hero">
        <div className="scrim">
          <div className="container">
            <div className="hero-content">
              <span className="eyebrow">반려동물 해외여행 · 검역 준비</span>
              <h1>
                우리 아이 해외여행,
                <br />
                펫무브가 챙겨줘요
              </h1>
              <p>
                앱으로 쉽게 준비하고, <br className="mbr" />
                복잡한 절차는 전문가에게 맡기세요
              </p>
              <div className="cta">
                <AppLink className="btn-primary" fallbackHref="#download">
                  <i className="ti ti-download" style={{ fontSize: 17 }} />
                  무료 앱으로 시작하기
                </AppLink>
                <a className="btn-ghost" href="#service">
                  <i className="ti ti-message-circle" style={{ fontSize: 17 }} />
                  전문가에게 맡기기
                </a>
              </div>
            </div>
            <div className="hero-photo" />
          </div>
        </div>
      </section>

      <div className="trust">
        <div>
          <div className="n">
            5,300<span>+</span>
          </div>
          <div className="l">누적 출국</div>
        </div>
        <div>
          {/* 손으로 적은 '50+' 였다 — 목적지를 올려도 안 따라와서 site-data 목록에서 파생. */}
          <div className="n">{APP_DEST_TOTAL}</div>
          <div className="l">지원 여행지</div>
        </div>
        <div>
          <div className="n">
            {YEARS}년<span>+</span>
          </div>
          <div className="l">경험</div>
        </div>
      </div>

      <section id="app">
        <div className="container">
          <div className="kicker">펫무브 앱 소개</div>
          <h2 className="h2">복잡한 준비, 앱으로 관리해요</h2>
          <div className="alist">
            {APP_FEATURES.map((f) => (
              <div className="acard" key={f.title}>
                <div className="acard-h">
                  <span className="ai">
                    <i className={`ti ${f.icon}`} />
                  </span>
                  <span className="at">{f.title}</span>
                </div>
                <p className="ad">{f.desc}</p>
              </div>
            ))}
            <div className="acard more">
              <i className="ti ti-dots" />이 외에도 다양한 기능이 있어요
            </div>
          </div>
          <div className="appcta-wrap">
            <AppLink className="appcta" fallbackHref="#download">
              <i className="ti ti-download" />
              무료 앱 받기
            </AppLink>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--surface)', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
        <div className="container">
          <div className="kicker">앱 지원 여행지</div>
          <h2 className="h2">앞으로 계속 추가돼요</h2>
          <DestGrid />
          {/* '추가 예정' 목록이 비면 블록째 감춘다 — 빈 칩 줄만 남으면 준비 중인 게 없는데도
              뭔가 빠진 화면으로 보인다(2026-07-27 호주·뉴질랜드 승격으로 목록이 비었다). */}
          {APP_DEST_SOON.length > 0 && (
            <div className="soon-block">
              <div className="soon-label">
                <i className="ti ti-calendar-plus" />
                2026년 추가 예정
              </div>
              <div className="soon-chips">
                {APP_DEST_SOON.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="service">
        <div className="container">
          <div className="kicker">펫무브 서비스 소개</div>
          <h2 className="h2">전문가에게 안심하고 맡기세요</h2>
          <div className="score-list">
            {SERVICE_CARDS.map((s) => (
              <div className="score" key={s.title}>
                <div className="score-h">
                  <i className={`ti ${s.icon} si`} style={{ color: '#E9A800' }} />
                  <span className="st">{s.title}</span>
                </div>
                <p className="sd">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="svc-cta-wrap">
            <a className="svc-cta" href={CONTACT.kakao} target="_blank" rel="noopener">
              <i className="ti ti-message-circle" />
              서비스 의뢰하기
            </a>
            <div className="svc-sub">
              <a className="nv" href={CONTACT.naverBooking} target="_blank" rel="noopener">
                <span className="nlogo">N</span>네이버예약
              </a>
              <span className="sep">·</span>
              <a href={`tel:${CONTACT.tel}`}>
                <span className="tlogo">TEL</span>
                {CONTACT.tel}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--surface)', borderTop: '0.5px solid var(--border)' }}>
        <div className="container">
          <div className="kicker">고객 후기</div>
          <h2 className="h2">펫무브와 함께한 이야기</h2>
          <div className="rlist">
            {REVIEWS.map((r) => (
              <div className="rcard" key={r.initial}>
                <div className="rhead">
                  <span className="ravatar">{r.initial}</span>
                  <div>
                    <div className="rname">{r.name}</div>
                    <div className="rmeta">{r.meta}</div>
                  </div>
                </div>
                <p className="rtext">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="band">
        <div className="scrim">
          <div className="container">
            <h2>가족이니까, 언제나 함께</h2>
            <p>펫무브가 챙길게요</p>
          </div>
        </div>
      </div>

      <div className="final" id="download">
        <div className="container">
          <h2>무료 앱으로 시작하세요</h2>
          <div className="store-row">
            <a className="store" href={STORE_IOS} target="_blank" rel="noopener">
              <i className="ti ti-brand-apple" style={{ fontSize: 18 }} />
              App Store
            </a>
            <a className="store" href={STORE_ANDROID} target="_blank" rel="noopener">
              <i className="ti ti-brand-google-play" style={{ fontSize: 16 }} />
              Google Play
            </a>
          </div>
        </div>
        <svg className="clouds" viewBox="-6 92 208 68" aria-hidden>
          <g transform="translate(0,26)">
            <circle cx="46" cy="168" r="52" fill="#fff" />
            <circle cx="72" cy="120" r="48" fill="#fff" />
            <circle cx="112" cy="148" r="34" fill="#fff" />
            <circle cx="146" cy="138" r="38" fill="#fff" />
            <circle cx="178" cy="154" r="24" fill="#fff" />
          </g>
        </svg>
      </div>

      <SiteFooter />
    </div>
  )
}
