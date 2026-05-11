'use client'

import { useEffect, useRef, useState } from 'react'
import type { JourneyData, JourneyStage } from '@/lib/journey/scenario'

/**
 * Calm 디자인 시스템의 여정 화면.
 *
 * 시각 소스: docs/portal-preview/timeline.jsx (TimelineCalm) — Stone 팔레트는 portal-only
 * 라 인라인 style 로 유지. 디자인 freeze 단계에서 portal-preview JSX 가 truth, 이 코드는
 * 그것을 비교적 충실히 옮긴 것.
 */
export function TimelineCalm({ data }: { data: JourneyData }) {
  const { stages, trip, pet, nextStage } = data
  const total = stages.length
  const done = stages.filter((s) => s.state === 'done').length
  const pct = done / total

  // Stone palette — scoped to this view (globals.css 의 --pm-* 와 같은 값, 인라인 fidelity).
  const C = {
    bg: '#F2EDE6',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.10)',
    accent: '#B89968',
    sage: '#8FA68C',
  } as const

  const serif: React.CSSProperties = {
    fontFamily: "'Fraunces', 'Pretendard Variable', serif",
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }
  const num: React.CSSProperties = {
    fontFamily: "'Fraunces', 'Inter', serif",
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 10.5,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  const R = 100
  const CIRC = 2 * Math.PI * R

  // Entry animations — ring draws + number counts up.
  const [animPct, setAnimPct] = useState(0)
  const [animNum, setAnimNum] = useState(0)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const start = performance.now()
    const dur = 1400
    const ease = (x: number) => 1 - Math.pow(1 - x, 3)
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur)
      const e = ease(k)
      setAnimPct(pct * e)
      setAnimNum(Math.round(pct * 100 * e))
      if (k < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [pct])
  const animOffset = CIRC * (1 - animPct)

  const dDayLabel = formatDDay(trip.daysLeft)

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 24,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {/* Header */}
        <div style={{ paddingTop: 8, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ alignSelf: 'center' }}>
            <PetAvatar size={36} />
          </span>
          <h1 style={{ ...serif, fontSize: 30, lineHeight: 1.12, margin: 0, color: C.ink }}>{pet.name}</h1>
          <div
            style={{
              fontSize: 12.5,
              color: C.ink2,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transform: 'translateY(-2px)',
            }}
          >
            <span>{trip.fromCity}</span>
            <span style={{ color: C.ink3 }}>→</span>
            <span>{trip.toCity}</span>
          </div>
        </div>

        {/* 다음 할 일 카드 */}
        {nextStage && (
          <div
            style={{
              marginTop: 22,
              padding: 18,
              borderRadius: 18,
              background: 'rgba(251,247,241,.55)',
              border: `.5px solid ${C.line}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={monoCap}>다음 할 일</div>
              {dDayLabel && (
                <span style={{ ...monoCap, fontSize: 9.5, color: C.accent, fontWeight: 600 }}>{dDayLabel}</span>
              )}
            </div>
            <h3
              style={{
                ...serif,
                margin: '10px 0 0',
                fontSize: 22,
                lineHeight: 1.2,
                color: C.ink,
                fontWeight: 500,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              {nextStage.label}
            </h3>
            {nextStage.desc && (
              <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: C.ink2 }}>{nextStage.desc}</p>
            )}
          </div>
        )}

        {/* 진행률 링 */}
        <div
          style={{
            marginTop: 22,
            padding: '28px 18px 22px',
            borderRadius: 22,
            background: C.surface,
            border: `.5px solid ${C.line}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 220, height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(42,38,32,.08)" strokeWidth="10" />
              <circle
                cx="110"
                cy="110"
                r={R}
                fill="none"
                stroke={C.accent}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={animOffset}
                transform="rotate(-90 110 110)"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ ...num, fontSize: 56, lineHeight: 1, color: C.ink, letterSpacing: '-0.02em' }}>
                {animNum}
                <span style={{ fontSize: 22, color: C.ink3, marginLeft: 2 }}>%</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: C.ink3 }}>
                <span style={num}>{done}</span>
                <span> / {total} 단계{dDayLabel ? ` · ${dDayLabel}` : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 단계 리스트 */}
        <h3 style={{ ...serif, margin: '24px 0 12px', fontSize: 16 }}>전체 여정</h3>
        <div
          style={{
            background: C.surface,
            border: `.5px solid ${C.line}`,
            borderRadius: 18,
            padding: '4px 14px',
          }}
        >
          {stages.map((s, i) => {
            const isDone = s.state === 'done'
            const isCurr = s.state === 'current'
            const last = i === stages.length - 1
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 0',
                  borderBottom: last ? 'none' : `.5px solid ${C.line}`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone ? C.sage : isCurr ? C.accent : 'transparent',
                    border: !isDone && !isCurr ? `1px solid ${C.line}` : 'none',
                    color: isDone || isCurr ? C.surface : C.ink3,
                    ...num,
                    fontSize: 11,
                  }}
                >
                  {isDone ? (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: isCurr ? C.ink : isDone ? C.ink2 : C.ink3,
                      fontWeight: isCurr ? 600 : 500,
                    }}
                  >
                    {s.label}
                  </div>
                  {s.desc && (
                    <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
                  )}
                </div>
                <div
                  style={{
                    ...monoCap,
                    fontSize: 9.5,
                    color: isCurr ? C.accent : C.ink3,
                    fontWeight: isCurr ? 700 : 500,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {isCurr ? (dDayLabel ?? '진행 중') : formatStageDate(s)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatDDay(daysLeft: number | null): string | null {
  if (daysLeft == null) return null
  if (daysLeft > 0) return `D-${daysLeft}`
  if (daysLeft === 0) return 'D-DAY'
  return `D+${-daysLeft}`
}

function formatStageDate(stage: JourneyStage): string {
  if (!stage.date) return '—'
  // 'YYYY-MM-DD' → 'MM·DD'
  return stage.date.slice(5).replace('-', '·')
}

function PetAvatar({ size = 44 }: { size?: number }) {
  // docs/portal-preview/shared.jsx 의 SVG 그대로. shiba 실루엣 placeholder.
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #F2C9A4 0%, #E5A776 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,.4), 0 1px 2px rgba(0,0,0,.06)',
      }}
    >
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40">
        <path
          d="M20 8c-7 0-12 4.5-12 11 0 5 3 9 8 10.5 1.2.3 2.6.5 4 .5s2.8-.2 4-.5c5-1.5 8-5.5 8-10.5 0-6.5-5-11-12-11z"
          fill="#FFF6EE"
        />
        <path d="M11 11l3.5 5.5L9 16l2-5z" fill="#C9824D" />
        <path d="M29 11l-3.5 5.5L31 16l-2-5z" fill="#C9824D" />
        <path d="M11.5 12l2.5 4L10.5 16l1-4z" fill="#FFD9B5" />
        <path d="M28.5 12l-2.5 4L29.5 16l-1-4z" fill="#FFD9B5" />
        <path
          d="M14 18c-1 3-1 6 0 8 1 2 3.5 3 6 3s5-1 6-3c1-2 1-5 0-8-2-1-4-1.5-6-1.5s-4 .5-6 1.5z"
          fill="#F5DCC1"
        />
        <circle cx="16" cy="20" r="1.2" fill="#1F1B2E" />
        <circle cx="24" cy="20" r="1.2" fill="#1F1B2E" />
        <ellipse cx="20" cy="24" rx="1.4" ry="1" fill="#1F1B2E" />
        <path
          d="M20 25v1.5M18 27c.5.5 1.2.7 2 .7s1.5-.2 2-.7"
          stroke="#1F1B2E"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
