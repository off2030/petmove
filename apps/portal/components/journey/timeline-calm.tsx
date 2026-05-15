'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { JourneyData, JourneyStage } from '@/lib/journey/scenario'

/**
 * Calm 디자인 시스템의 여정 화면.
 *
 * 시각 소스: docs/portal-preview/timeline.jsx (TimelineCalm) — Stone 팔레트는 portal-only
 * 라 인라인 style 로 유지. 디자인 freeze 단계에서 portal-preview JSX 가 truth, 이 코드는
 * 그것을 비교적 충실히 옮긴 것.
 */
export function TimelineCalm({ data, caseId }: { data: JourneyData; caseId: string }) {
  const { stages, trip, pet, nextStage, totalFailedChecks } = data
  const total = stages.length
  const done = stages.filter((s) => s.state === 'done').length
  const pct = done / total

  // Stone palette — scoped to this view (globals.css 의 --pm-* 와 같은 값, 인라인 fidelity).
  const C = {
    bg: '#F5EFE8',
    surface: '#FBF7F1',
    ink: '#2A2620',
    ink2: '#6B6457',
    ink3: '#9A9286',
    line: 'rgba(42,38,32,.07)',
    accent: '#8A7355',
    sage: '#8FA68C',
    warn: '#C26A4A',
    warnBg: 'rgba(194,106,74,0.08)',
    cardSoft: 'linear-gradient(160deg, #F0E8DB 0%, #EDE4D7 50%, #E6DDCD 100%)',
    cardList: 'linear-gradient(160deg, #F5EDE0 0%, #F2E9DC 50%, #ECE3D3 100%)',
    cardHero: 'radial-gradient(140% 100% at 80% 18%, #E8DECC 0%, #DCD2BD 45%, #CBC1AB 100%)',
  } as const

  // 주의가 발생한 stage 들 — 배너에 항목명을 모두 나열하고, 링크는 첫 항목으로.
  const warnedStages = stages.filter((s) => (s.failedChecks ?? 0) > 0)
  const firstWarnedStage = warnedStages[0] ?? null

  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  }
  const num: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
  }
  const monoCap: React.CSSProperties = {
    fontSize: 11,
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
          <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: 0, color: C.ink }}>{pet.name}</h1>
          <div
            style={{
              fontSize: 12,
              color: C.ink2,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transform: 'translateY(-2px)',
            }}
          >
            <span>{trip.fromCity}</span>
            <span style={{ color: C.ink3 }}>{trip.tripType === 'round' ? '⇄' : '→'}</span>
            <span>{trip.toCity}</span>
          </div>
        </div>

        {/* 주의 알림 — 한 줄 배너. 첫 주의 stage 로 이동. */}
        {totalFailedChecks > 0 && firstWarnedStage && (
          <Link
            href={`/cases/${caseId}/journey/${firstWarnedStage.id}`}
            className="pm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 18,
              padding: '10px 14px',
              borderRadius: 12,
              background: C.warnBg,
              border: `.5px solid ${C.warn}33`,
              color: C.warn,
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>주의 {totalFailedChecks}건 — {warnedStages.map((s) => s.label).join(', ')}</span>
          </Link>
        )}

        {/* 다음 할 일 카드 — soft taupe gradient. 클릭 시 해당 단계 상세로 이동. */}
        {nextStage && (
          <Link
            href={`/cases/${caseId}/journey/${nextStage.id}`}
            className="pm-pressable"
            style={{
              display: 'block',
              marginTop: 22,
              padding: 22,
              borderRadius: 22,
              background: C.cardSoft,
              boxShadow: '0 1px 0 rgba(255,255,255,.45) inset',
              textDecoration: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ ...monoCap, color: 'rgba(45,38,28,.55)' }}>다음 할 일</div>
              {dDayLabel && (
                <span style={{ ...monoCap, color: 'rgba(45,38,28,.75)', fontWeight: 600 }}>{dDayLabel}</span>
              )}
            </div>
            <h3
              style={{
                ...serif,
                margin: '12px 0 0',
                fontSize: 22,
                lineHeight: 1.18,
                color: '#2A2620',
                fontWeight: 500,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              {nextStage.label}
            </h3>
            {nextStage.desc && (
              <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'rgba(45,38,28,.65)' }}>{nextStage.desc}</p>
            )}
          </Link>
        )}

        {/* 진행률 링 — taupe radial gradient hero */}
        <div
          style={{
            marginTop: 22,
            padding: '28px 18px 22px',
            borderRadius: 22,
            background: C.cardHero,
            boxShadow: '0 1px 0 rgba(255,255,255,.35) inset',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 220, height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(184,153,104,.14)" strokeWidth="14" />
              <circle
                cx="110"
                cy="110"
                r={R}
                fill="none"
                stroke={C.accent}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={animOffset}
                transform="rotate(-90 110 110)"
                style={{ filter: 'drop-shadow(0 0 6px rgba(184,153,104,.5))' }}
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
              <div style={{ marginTop: 8, fontSize: 12, color: C.ink3 }}>
                <span style={num}>{done}</span>
                <span> / {total} 단계{dDayLabel ? ` · ${dDayLabel}` : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 단계 리스트 — light cream gradient */}
        <h3 style={{ ...serif, margin: '24px 0 12px', fontSize: 20 }}>전체 일정</h3>
        <div
          style={{
            background: C.cardList,
            borderRadius: 20,
            boxShadow: '0 1px 0 rgba(255,255,255,.45) inset',
            padding: '4px 14px',
          }}
        >
          {stages.map((s, i) => {
            const isDone = s.state === 'done'
            const isCurr = s.state === 'current'
            const hasWarn = (s.failedChecks ?? 0) > 0
            const last = i === stages.length - 1
            return (
              <Link
                key={s.id}
                href={`/cases/${caseId}/journey/${s.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '13px 0',
                  borderBottom: last ? 'none' : `.5px solid ${C.line}`,
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
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
                    // 주의가 있으면 sage/accent 대신 warn 색으로 — 체크/번호 자리에 ⚠.
                    background: hasWarn ? C.warn : isDone ? C.sage : isCurr ? C.accent : 'transparent',
                    border: !hasWarn && !isDone && !isCurr ? `1px solid ${C.line}` : 'none',
                    color: hasWarn || isDone || isCurr ? C.surface : C.ink3,
                    ...num,
                    fontSize: 11,
                  }}
                >
                  {hasWarn ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-label="주의"
                    >
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    </svg>
                  ) : isDone ? (
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
                      // 동그라미(22px)와 같은 높이로 baseline center 정렬 — label 의 line-height
                      // 를 22 로 맞춰 row 자체가 22 가 되도록.
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      minHeight: 22,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 17,
                        lineHeight: '22px',
                        color: hasWarn ? C.warn : isCurr ? C.ink : isDone ? C.ink2 : C.ink3,
                        fontWeight: isCurr || hasWarn ? 600 : 500,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        ...monoCap,
                        color: hasWarn ? C.warn : isCurr ? C.accent : C.ink3,
                        fontWeight: isCurr || hasWarn ? 700 : 500,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {hasWarn ? '주의' : isCurr ? (dDayLabel ?? '예정') : formatStageDate(s)}
                    </div>
                  </div>
                  {s.desc && (
                    <div style={{ fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
                  )}
                </div>
              </Link>
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
  // 'YYYY-MM-DD' → 항상 'YY·MM·DD'. 연도가 같든 다르든 일관 표기.
  const parts = stage.date.split('-')
  if (parts.length !== 3) return '—'
  const [yyyy, mm, dd] = parts
  return `${yyyy.slice(2)}·${mm}·${dd}`
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
