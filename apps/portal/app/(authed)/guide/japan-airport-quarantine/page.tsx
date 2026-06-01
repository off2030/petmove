'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { JAPAN_AIRPORTS, type AirportMap } from '@/lib/japan-airport-quarantine'

/**
 * 일본 공항 동물검역소 위치 — '일본 수입 동물검역' step 에서 진입하는 내부 leaf 페이지.
 * 4탭(일정·서류·정보·프로필)에 추가하지 않고 step 링크로만 진입. Stone/Calm 톤.
 * 검역 카운터 위치 안내도(공식 PDF→PNG)를 공항·터미널별로 정리. 안내도 탭 시 전체화면 확대.
 */

const C = {
  bg: 'var(--pm-bg)',
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  line: 'var(--pm-line)',
  accent: 'var(--pm-accent)',
} as const

const serif: React.CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

export default function JapanAirportQuarantinePage() {
  const router = useRouter()
  const [zoom, setZoom] = useState<AirportMap | null>(null)

  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        paddingBottom: 32,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'transparent',
            border: 0,
            padding: '6px 0',
            fontFamily: 'inherit',
            fontSize: 13,
            color: C.ink2,
            cursor: 'pointer',
          }}
        >
          ← 뒤로
        </button>

        <h1 style={{ ...serif, fontSize: 26, lineHeight: 1.15, margin: '8px 0 0', color: C.ink }}>
          일본 공항 동물검역소 위치
        </h1>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '8px 0 0', lineHeight: 1.6 }}>
          안내도를 탭하면 크게 볼 수 있습니다.
        </p>

        {JAPAN_AIRPORTS.map((ap) => (
          <section key={ap.name} style={{ marginTop: 28 }}>
            <h2 style={{ ...serif, fontSize: 18, margin: 0, color: C.ink }}>{ap.name}</h2>
            <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 3, letterSpacing: '0.01em' }}>
              {ap.nameSub}
            </div>
            {ap.phone ? <PhoneLink phone={ap.phone} /> : null}
            <div style={{ marginTop: 13 }}>
              {ap.maps.map((m) => (
                <MapCard key={m.src} map={m} onZoom={() => setZoom(m)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {zoom ? <Lightbox map={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  )
}

/** 공항별 동물검역소(공항지소) 문의 전화 — 표시 원문 그대로, tel 링크는 숫자·'+'만. */
function PhoneLink({ phone }: { phone: string }) {
  const dial = phone.replace(/[^0-9+]/g, '')
  return (
    <a
      href={`tel:${dial}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginTop: 7,
        fontSize: 13,
        color: C.accent,
        textDecoration: 'none',
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {phone}
    </a>
  )
}

/** 검역 카운터 안내도 1장 — 캡션 + 이미지. 탭하면 onZoom 으로 전체화면 확대. */
function MapCard({ map, onZoom }: { map: AirportMap; onZoom: () => void }) {
  return (
    <figure style={{ margin: '0 0 14px' }}>
      <figcaption
        style={{ fontSize: 13, fontWeight: 600, color: C.ink2, margin: '0 0 7px', padding: '0 2px' }}
      >
        {map.label}
      </figcaption>
      <button
        type="button"
        onClick={onZoom}
        aria-label={`${map.label} 안내도 확대`}
        style={{
          display: 'block',
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          borderRadius: 14,
          cursor: 'zoom-in',
        }}
      >
        <img
          src={map.src}
          alt={`${map.label} 동물검역소 위치 안내도`}
          width={map.width}
          height={map.height}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            borderRadius: 14,
            border: `.5px solid ${C.line}`,
            background: '#fff',
          }}
        />
      </button>
    </figure>
  )
}

/**
 * 안내도 전체화면 확대 — document.body 로 portal 해 셸(TopBar·BottomNav) 위에 덮음.
 * 가로 안내도는 화면보다 넓게, 세로는 높게 띄워 스크롤·핀치로 탐색. 어디든 탭하면 닫힘.
 */
function Lightbox({ map, onClose }: { map: AirportMap; onClose: () => void }) {
  const portrait = map.height > map.width
  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(20,18,15,.96)',
          overflow: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <img
          src={map.src}
          alt={`${map.label} 동물검역소 위치 안내도`}
          style={{
            display: 'block',
            margin: '0 auto',
            width: portrait ? 'auto' : '176vw',
            height: portrait ? '162vh' : 'auto',
            maxWidth: 'none',
          }}
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 14,
          zIndex: 101,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 0,
          background: 'rgba(0,0,0,.55)',
          color: '#fff',
          fontSize: 17,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </>,
    document.body,
  )
}
