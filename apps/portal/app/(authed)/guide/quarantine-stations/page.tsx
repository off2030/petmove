'use client'

import { useRouter } from 'next/navigation'
import { QUARANTINE_REGIONS, type QuarantineStation } from '@/lib/quarantine-stations'

/**
 * 동물검역소 위치 안내 — '한국 수출 동물검역' step 에서 진입하는 내부 leaf 페이지.
 * 4탭(일정·서류·정보·프로필)에 추가하지 않고 step 링크로만 진입. Stone/Calm 톤.
 */

const C = {
  bg: '#F5EFE8',
  surface: '#FBF7F1',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)',
  accent: '#B89968',
} as const

const serif: React.CSSProperties = {
  fontFamily: 'var(--pm-font-display)',
  fontWeight: 500,
  letterSpacing: '-0.01em',
}

const monoCap: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.ink3,
  fontWeight: 500,
}

const boxStyle: React.CSSProperties = {
  background: C.surface,
  border: `.5px solid ${C.line}`,
  borderRadius: 16,
  padding: '2px 16px',
}

export default function QuarantineStationsPage() {
  const router = useRouter()
  const featured = QUARANTINE_REGIONS.flatMap((r) =>
    r.stations.filter((s) => s.featured != null).map((s) => ({ station: s, hq: r.hq })),
  ).sort((a, b) => (a.station.featured ?? 0) - (b.station.featured ?? 0))

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
          동물검역소 위치
        </h1>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '6px 0 0', lineHeight: 1.5 }}>
          전국 동물검역소 위치와 연락처입니다. 방문 전 전화로 검역 가능 여부, 시간 등을 확인하세요.
        </p>

        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>주요 동물검역소</div>
        <div style={boxStyle}>
          {featured.map((f, i) => (
            <StationRow
              key={`${f.hq}-${f.station.office}`}
              station={f.station}
              hq={f.hq}
              last={i === featured.length - 1}
            />
          ))}
        </div>

        <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>전국 동물검역소</div>
        {QUARANTINE_REGIONS.map((r) => (
          <div key={r.hq} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink2, margin: '0 0 6px', padding: '0 4px' }}>
              {r.hq}
            </div>
            <div style={boxStyle}>
              {r.stations.map((s, i) => (
                <StationRow key={s.office} station={s} last={i === r.stations.length - 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 검역소 1곳 — 부서명(주요 섹션은 지역본부 포함) + 주소 + 전화(tel 링크). */
function StationRow({
  station,
  hq,
  last,
}: {
  station: QuarantineStation
  hq?: string
  last?: boolean
}) {
  // 전화 표시는 원문 그대로, tel 링크는 첫 번호만 (예: '032-740-2660~2' → 0327402660).
  const telDigits = station.phone.split(/[,~]/)[0].replace(/\D/g, '')
  return (
    <div style={{ padding: '12px 0', borderBottom: last ? 'none' : `.5px solid ${C.line}` }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>
        {hq ? `${hq} · ${station.office}` : station.office}
      </div>
      <div style={{ fontSize: 13, color: C.ink2, marginTop: 3, lineHeight: 1.5 }}>{station.address}</div>
      <a
        href={`tel:${telDigits}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 5,
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
        {station.phone}
      </a>
    </div>
  )
}
