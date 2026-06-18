'use client'


import { C as PM } from '@/lib/palette'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CaseHeader } from '@/components/cases/case-header'
import type { JourneyData, JourneyStage } from '@/lib/journey/scenario'

/** 이름 + 와/과 — 마지막 글자 받침 유무로 결정. 한글 음절이 아니면(영문 등) '와' 기본. */
function withWaGwa(name: string): string {
  if (!name) return name
  const last = name.charCodeAt(name.length - 1)
  if (last >= 0xac00 && last <= 0xd7a3) {
    return (last - 0xac00) % 28 !== 0 ? `${name}과` : `${name}와`
  }
  return `${name}와`
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문. 완료 배너 도착일 표기용. */
function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 'YYYY-MM-DD' 두 날짜 → 'YYYY년 M월 D일 ~ M월 D일' (같은 해면 연도 1회). 왕복 완료 기간용. */
function formatDateRange(startIso: string, endIso: string): string {
  const sy = startIso.slice(0, 4)
  const ey = endIso.slice(0, 4)
  const end = sy === ey ? formatKoreanDate(endIso).replace(/^\d+년\s*/, '') : formatKoreanDate(endIso)
  return `${formatKoreanDate(startIso)} ~ ${end}`
}

/**
 * Calm 디자인 시스템의 여정 화면.
 *
 * 시각 소스: docs/portal-preview/timeline.jsx (TimelineCalm) — Stone 팔레트는 portal-only
 * 라 인라인 style 로 유지. 디자인 freeze 단계에서 portal-preview JSX 가 truth, 이 코드는
 * 그것을 비교적 충실히 옮긴 것.
 */
export function TimelineCalm({
  data,
  caseId,
  activeDest,
  canFinishJourney = false,
  finishing = false,
  onFinishJourney,
}: {
  data: JourneyData
  caseId: string
  /** 활성 목적지(?dest=) — step 상세 링크에 붙여 다중 목적지에서 선택 목적지를 유지. */
  activeDest?: string | null
  /** 완료된 이 여정을 '지난 여정'으로 내릴 수 있는지(다중 목적지 + 완료). 완료 카드 아래 버튼 노출. */
  canFinishJourney?: boolean
  /** 마무리 처리 중(버튼 비활성). */
  finishing?: boolean
  /** '여정 마무리하기' 클릭 — 페이지가 finishJourney + 되돌리기 토스트를 담당. */
  onFinishJourney?: () => void
}) {
  const { stages, trip, pet, nextStages, caseAlerts, journeyComplete, journeyCompleteDate } = data
  // step 상세로 넘어갈 때 활성 목적지를 유지하기 위한 쿼리. 단일 목적지면 빈 문자열.
  const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
  // 행 링크 — 보통은 step 상세, 서류 체크리스트(linkToDocs)는 서류 페이지로 직행.
  const stageHref = (s: JourneyStage) =>
    s.linkToDocs
      ? `/cases/${caseId}/docs${destQuery}`
      : `/cases/${caseId}/journey/${s.id}${destQuery}`
  const total = stages.length
  const done = stages.filter((s) => s.state === 'done').length
  const pct = done / total

  // Stone palette — scoped to this view (globals.css 의 --pm-* 와 같은 값, 인라인 fidelity).
  const C = {
    ...PM,
    line: 'rgb(var(--pm-ink-rgb) / .07)',
  } as const

  // 주의가 발생한 stage 들 — 실패한 비-info 체크(실제 문제)가 있는 경우만.
  const warnedStages = stages.filter((s) => (s.failedChecks ?? 0) > 0)
  const firstWarnedStage = warnedStages[0] ?? null
  // 안내 stage 들 — info 체크가 있거나, advisory step(추가 백신·추가 검사)이 미완료인 경우.
  // advisory 는 면역이 아직 유효한 '미래 만료 대비' reminder — 문제(주의)가 아니라
  // 차분한 안내 톤으로 묶는다. 이미 주의로 잡힌 stage 는 제외(한 stage = 한 배너).
  // 또한 '다음 할 일' 카드에 같은 stage 가 노출되면 거기에 안내가 인라인으로 붙으므로
  // 별도 '안내' 카드로 중복 노출하지 않는다.
  const warnedIds = new Set(warnedStages.map((s) => s.id))
  const nextStageIds = new Set(nextStages.map((s) => s.id))
  const infoStages = stages.filter(
    (s) =>
      !warnedIds.has(s.id) &&
      !nextStageIds.has(s.id) &&
      ((s.infoChecks ?? 0) > 0 || (!!s.advisory && s.state !== 'done')),
  )
  const firstInfoStage = infoStages[0] ?? null

  // 전체 일정을 물리적 위치 기준 구간으로 나눈다 — 한국(출국 준비)·일본·한국(귀국).
  // 'departure'(출국·도착) 앞에서 일본 구간이, 'kr-import-quarantine' 앞에서 한국 귀국
  // 구간이 시작된다. 해당 step 이 없으면 그 구간은 생기지 않는다(편도·단순 케이스).
  const stageZones = (() => {
    const departureIdx = stages.findIndex((s) => s.id === 'departure')
    const krReturnIdx = stages.findIndex((s) => s.id === 'kr-import-quarantine')
    const cuts: { index: number; caption: string | null }[] = [{ index: 0, caption: null }]
    if (departureIdx > 0) {
      cuts.push({ index: departureIdx, caption: `${withRo(trip.toCity)} 떠나요` })
      if (krReturnIdx > departureIdx) {
        cuts.push({ index: krReturnIdx, caption: `${withRo(trip.fromCity)} 돌아와요` })
      }
    }
    return cuts.map((cut, ci) => {
      const next = cuts[ci + 1]
      return {
        caption: cut.caption,
        rows: stages
          .slice(cut.index, next ? next.index : stages.length)
          .map((stage, k) => ({ stage, index: cut.index + k })),
      }
    })
  })()

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
  // 링 둘째 줄 '상태' — 출국일 있으면 D-day, 없으면 일본 최소 준비기간/입국 가능일 힌트(trip.prep).
  // 항상 '단계' 줄 아래 별도 줄로, 한 단계 짙게(ink2) 강조 — 가장 actionable 한 정보.
  const ringStatus = dDayLabel ?? trip.prep?.label ?? null

  // 완료 배너 날짜 — 왕복은 출발~도착(귀국) 범위, 편도는 도착일만.
  const arrivalText = journeyCompleteDate ? formatKoreanDate(journeyCompleteDate) : ''
  const journeyDateText =
    trip.tripType === 'round' && trip.departureDate && journeyCompleteDate
      ? formatDateRange(trip.departureDate, journeyCompleteDate)
      : arrivalText

  // 일정 카드 한 행 — 동그라미(번호·상태) + 항목명 + 날짜. index 는 전체 일정 기준
  // 0-based, isLast 는 소속 카드 내 마지막 행 여부(구분선 생략).
  const renderStageRow = (s: JourneyStage, index: number, isLast: boolean) => {
    const isDone = s.state === 'done'
    const isCurr = s.state === 'current'
    // advisory(추가 백신·추가 검사) 가 미완료면 본 흐름의 다음 단계는 못 가리지만 미래
    // 만료 대비 reminder 이므로 안내 톤으로 표시 — 보호자가 인지하되 '문제'는 아니다.
    const hasWarn = (s.failedChecks ?? 0) > 0
    const hasInfo = (s.infoChecks ?? 0) > 0 || (!!s.advisory && !isDone)
    // 날짜가 내일 이후 — 상태(done/current/upcoming) 무관하게 '예정 28·01·03' 칩으로 명시.
    // advisory(추가 백신·검사)로 좌측 i·안내문은 그대로 두되, 미래 날짜가 있으면 우측 칩은
    // '예정 [날짜]'로(아래 칩 분기에서 hasInfo 보다 hasFutureDate 를 우선).
    const hasFutureDate = isFuture(s.date)
    // 마감 라벨 + 날짜가 있는 미완 step (사전 신고 등). 과거/미래 무관하게 항상 표시 —
    // 마감일은 단순 '예정 일자'가 아니라 보호자가 인지해야 할 시점이고, 지난 경우엔
    // warn 색으로 'overdue' 신호를 줘야 한다.
    const showDeadlinePill = s.dateLabel === '마감' && !!s.date && !isDone
    const isOverdueDeadline = showDeadlinePill && !hasFutureDate
    return (
      <Link
        key={s.id}
        href={stageHref(s)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          // 보조줄(desc) 없는 행은 제목 한 줄이라 빽빽해진다 — 설명문 숨김 모드 등에서
          // 세로 여백을 키워 호흡을 준다. 보조줄 있는 행은 기존 간격 유지.
          padding: s.desc ? '13px 0' : '18px 0',
          borderBottom: isLast ? 'none' : `.5px solid ${C.line}`,
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
            // 우선순위: 주의(실제 문제) > done(완료 체크) > current(다음 할 일 톤) > 안내 > upcoming.
            // current 와 안내가 동시이면 current 톤 유지 — 보호자의 다음 액션이 시각의 무게중심.
            // 안내는 우측 칩 + 별도 카드로 보조 노출.
            background: hasWarn ? C.warn : isDone ? C.sage : isCurr ? C.accent : hasInfo ? C.info : 'transparent',
            border: !hasWarn && !isDone && !isCurr && !hasInfo ? `1px solid ${C.line}` : 'none',
            color: hasWarn || isDone || isCurr || hasInfo ? C.surface : C.ink3,
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
          ) : isCurr ? (
            index + 1
          ) : hasInfo ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="안내"
            >
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="12" y1="7" x2="12.01" y2="7" />
            </svg>
          ) : (
            index + 1
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
                color: hasWarn ? C.warn : hasInfo ? C.info : isCurr ? C.accent : C.ink3,
                fontWeight: hasWarn ? 700 : hasInfo ? 600 : isCurr ? 700 : 500,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {hasWarn ? (
                '주의'
              ) : s.inProgress ? (
                '진행 중'
              ) : hasFutureDate ? (
                // 미래 날짜가 있으면 우측 칩은 '예정/마감 [날짜]'를 안내보다 우선 — advisory(추가
                // 백신 등)에 추가접종을 잡아둬도 '안내' 대신 잡아둔 예정일을 보여준다. (마감 라벨은
                // dateLabel 로 그대로 — 사전 신고 마감일 등.)
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(217,154,88,0.18)',
                    border: '.5px solid var(--pm-accent)',
                    color: C.accent,
                    fontWeight: 700,
                  }}
                >
                  {s.dateLabel ?? '예정'} {formatStageDate(s)}
                </span>
              ) : hasInfo ? (
                '안내'
              ) : showDeadlinePill ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: isOverdueDeadline ? C.warnBg : 'rgba(217,154,88,0.18)',
                    border: `.5px solid ${isOverdueDeadline ? `color-mix(in srgb, ${C.warn} 33%, transparent)` : 'var(--pm-accent)'}`,
                    color: isOverdueDeadline ? C.warn : C.accent,
                    fontWeight: 700,
                  }}
                >
                  마감 {formatStageDate(s)}
                </span>
              ) : isCurr ? (
                '예정'
              ) : (
                formatStageDate(s)
              )}
            </div>
          </div>
          {s.desc && (
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
          )}
        </div>
      </Link>
    )
  }

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
        <CaseHeader
          caseId={caseId}
          tab="journey"
          petName={pet.name}
          fromCity={trip.fromCity}
          toCity={trip.toCity}
          tripType={trip.tripType}
          ink={C.ink}
          ink2={C.ink2}
          ink3={C.ink3}
          serif={serif}
        />

        {/* 주의 카드 — 케이스 차원 결격 (견종·마릿수·거주·1년 라이선스 등).
            step 안에 묶이지 않고 보호자가 케이스 자체를 재검토해야 하는 신호라 별도 카드로.
            각 항목: title(serif) + message(설명). 링크 X — 가야 할 특정 step 이 없음. */}
        {caseAlerts.length > 0 && (
          <div
            style={{
              marginTop: 18,
              padding: 22,
              borderRadius: 22,
              background: C.warnBg,
              border: `.5px solid color-mix(in srgb, ${C.warn} 20%, transparent)`,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            <div style={{ ...monoCap, color: C.warn, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>주의</span>
            </div>
            {caseAlerts.map((alert, i) => (
              <div
                key={alert.id}
                style={{
                  marginTop: i === 0 ? 12 : 14,
                  paddingTop: i === 0 ? 0 : 14,
                  borderTop: i === 0 ? 0 : `1px solid color-mix(in srgb, ${C.warn} 13%, transparent)`,
                }}
              >
                <h3
                  style={{
                    ...serif,
                    margin: 0,
                    fontSize: 20,
                    lineHeight: 1.2,
                    color: C.ink,
                    fontWeight: 500,
                    textWrap: 'balance' as React.CSSProperties['textWrap'],
                  }}
                >
                  {alert.title}
                </h3>
                <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: C.ink2 }}>
                  {alert.message}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* (구) 주의 알림 — stage 차원 procedure-check 가 트리거되면 표시되던 한 줄 배너.
            severity 재분류 이후 stage-level 주의는 더 이상 발생하지 않지만, 향후
            입력 차단 외 stage-level 룰이 추가될 가능성을 위해 로직은 유지. */}
        {warnedStages.length > 0 && firstWarnedStage && (
          <Link
            href={stageHref(firstWarnedStage)}
            className="pm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 18,
              padding: '10px 14px',
              borderRadius: 12,
              background: C.warnBg,
              border: `.5px solid color-mix(in srgb, ${C.warn} 20%, transparent)`,
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
            <span>주의 {warnedStages.length}건 — {warnedStages.map((s) => s.label).join(', ')}</span>
          </Link>
        )}

        {/* 여정 완료 배너 — 마지막 절차가 끝나면 '다음 할 일' 자리에 노출. 옛 journey-complete
            마커 step 을 대체. 완료의 긍정 톤(sage)으로 다음 할 일·안내 카드와 구분. */}
        {journeyComplete && (
          <>
          <div
            style={{
              position: 'relative',
              marginTop: 22,
              padding: 22,
              borderRadius: 22,
              overflow: 'hidden',
              background: 'color-mix(in srgb, var(--pm-sage) 11%, var(--pm-card-sage-base))',
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            {/* 도착 도장 — 여권 스탬프 톤. 살짝 기울인 이중 링 + 텍스트, 반투명 sage. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 14,
                right: 12,
                width: 76,
                height: 76,
                borderRadius: '50%',
                border: `2px solid color-mix(in srgb, var(--pm-sage) 60%, transparent)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'rotate(-11deg)',
                color: 'color-mix(in srgb, var(--pm-sage) 78%, var(--pm-ink))',
                opacity: 0.7,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  border: `1px solid color-mix(in srgb, var(--pm-sage) 50%, transparent)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em' }}>도착</span>
                <span style={{ fontSize: 9, letterSpacing: '0.22em', fontWeight: 600 }}>ARRIVED</span>
              </div>
            </div>

            <div style={{ ...monoCap, color: C.sage }}>여정 완료</div>

            {/* 헤드라인 — 아바타는 상단 헤더와 중복이라 제외. */}
            <h3
              style={{
                ...serif,
                margin: '14px 0 0',
                fontSize: 21,
                lineHeight: 1.18,
                color: 'var(--pm-ink)',
                fontWeight: 500,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              {withWaGwa(pet.name)} 잘 도착했어요
            </h3>

            {/* 경로 + 날짜 — 경로 '한국 - 일본', 날짜는 왕복=출발~도착 / 편도=도착일만. */}
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                letterSpacing: '0.01em',
                color: 'rgba(45,38,28,.6)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                {trip.fromCity}
                <span style={{ color: C.sage, margin: '0 6px' }}>
                  {trip.tripType === 'round' ? '⇄' : '→'}
                </span>
                {trip.toCity}
              </span>
              {journeyDateText && (
                <>
                  <span style={{ color: 'rgba(45,38,28,.3)', margin: '0 6px' }}>·</span>
                  <span>{journeyDateText}</span>
                </>
              )}
            </div>
          </div>

          {/* 소감 카드 — 완료 카드에서 분리. 도착(완료)의 긍정 톤과 별개로, 차분한 taupe
              면에 소감 유도만 담는다. design journey-lifecycle §5. */}
          <div
            style={{
              marginTop: 14,
              padding: 22,
              borderRadius: 22,
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            <h3
              style={{
                ...serif,
                margin: 0,
                fontSize: 18,
                lineHeight: 1.25,
                color: 'var(--pm-ink)',
                fontWeight: 500,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              펫무브와 함께한 여정 어떠셨나요?
            </h3>
            <Link
              href={`/cases/${caseId}/feedback?dest=${encodeURIComponent(trip.toCity)}`}
              className="pm-pressable"
              style={{
                marginTop: 16,
                padding: '10px 16px',
                borderRadius: 999,
                border: `.5px solid color-mix(in srgb, var(--pm-sage) 45%, transparent)`,
                background: 'var(--pm-surface)',
                color: 'var(--pm-ink)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.005em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
              }}
            >
              의견 남기기
              <span style={{ color: C.sage }}>→</span>
            </Link>
          </div>

          {/* 여정 마무리하기 — 다중 목적지 중 이 여정이 완료됐을 때만. 누르면 '지난 여정'으로
              내리고 다른 진행 중 여정으로 전환. 소감은 내리기 전(위 카드)에 남긴다. design §6. */}
          {canFinishJourney && (
            <div
              style={{
                marginTop: 14,
                padding: 20,
                borderRadius: 22,
                background: C.cardSoft,
                boxShadow: 'var(--pm-card-rim)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: C.ink2,
                }}
              >
                이 여정을 마무리하면 <b style={{ color: C.ink }}>지난 여정</b>으로 정리되고, 진행
                중인 다른 여정으로 넘어가요.
              </p>
              <button
                type="button"
                onClick={onFinishJourney}
                disabled={finishing}
                className="pm-pressable"
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 14,
                  border: `.5px solid color-mix(in srgb, var(--pm-sage) 45%, transparent)`,
                  background: 'var(--pm-surface)',
                  color: 'var(--pm-ink)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                  cursor: finishing ? 'default' : 'pointer',
                  opacity: finishing ? 0.6 : 1,
                }}
              >
                {finishing ? '마무리하는 중…' : '여정 마무리하기'}
              </button>
            </div>
          )}
          </>
        )}

        {/* 다음 할 일 카드 — soft taupe. 헤더 1회 + 할 일 항목들(각 행이 링크, 구분선).
            non-blocking step 뒤엔 항목이 여럿 — 한 카드에 묶어 표시. 여정 완료 후엔 가린다. */}
        {!journeyComplete && nextStages.length > 0 && (
          <div
            style={{
              marginTop: 22,
              padding: 22,
              borderRadius: 22,
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            {/* D-day 는 진행률 링 카드에만 — 중복 방지로 헤더는 라벨만. */}
            <div style={{ ...monoCap, color: 'rgba(45,38,28,.55)' }}>다음 할 일</div>
            {nextStages.map((stage, i) => (
              <Link
                key={stage.id}
                href={stageHref(stage)}
                className="pm-pressable"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  marginTop: i === 0 ? 12 : 14,
                  paddingTop: i === 0 ? 0 : 14,
                  borderTop: i === 0 ? 0 : '1px solid rgba(45,38,28,.12)',
                }}
              >
                <h3
                  style={{
                    ...serif,
                    margin: 0,
                    fontSize: 22,
                    lineHeight: 1.18,
                    color: 'var(--pm-ink)',
                    fontWeight: 500,
                    textWrap: 'balance' as React.CSSProperties['textWrap'],
                  }}
                >
                  {stage.label}
                </h3>
                {(stage.cardDesc ?? stage.desc) && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'rgba(45,38,28,.65)' }}>
                    {stage.cardDesc ?? stage.desc}
                  </p>
                )}
                {/* 안내 — info 체크나 advisory step 의 안내문이 있으면 cardDesc 아래에 한 칸 띄고
                    별도 섹션으로 노출. '다음 할 일' 헤더와 동일한 monoCap 크기로, 같은 단계의
                    행동 안내와 묶어 표시. 별도 '안내' 카드 중복은 nextStageIds 필터로 방지.
                    카드 본문(desc/cardDesc)이 이미 안내문과 동일한 경우(예: 사전 신고 awaiting
                    — situational 이 cardDesc·infoMessage 동시에 채움)에는 한 번만 노출. */}
                {stage.infoMessage &&
                  ((stage.infoChecks ?? 0) > 0 || stage.advisory) &&
                  stage.infoMessage !== (stage.cardDesc ?? stage.desc) && (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ ...monoCap, color: C.info }}>안내</div>
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: 13,
                          lineHeight: 1.55,
                          color: 'rgba(45,38,28,.65)',
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {stage.infoMessage}
                      </p>
                    </div>
                  )}
              </Link>
            ))}
          </div>
        )}

        {/* 안내 카드 — 다음 할 일 카드와 같은 톤·구조. 단 헤더 라벨은 info 색으로 구분.
            안내별 카드 1장씩 (다건이면 N장) — step 이름 + 안내문 첫 줄 + 해당 step 링크.
            여정 완료 후엔 완료 배너에 집중하도록 가린다. */}
        {!journeyComplete && infoStages.length > 0 && (
          <div
            style={{
              marginTop: nextStages.length > 0 ? 14 : 22,
              padding: 22,
              borderRadius: 22,
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            <div style={{ ...monoCap, color: C.info }}>안내</div>
            {infoStages.map((stage, i) => (
              <Link
                key={stage.id}
                href={stageHref(stage)}
                className="pm-pressable"
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  marginTop: i === 0 ? 12 : 14,
                  paddingTop: i === 0 ? 0 : 14,
                  borderTop: i === 0 ? 0 : '1px solid rgba(45,38,28,.12)',
                }}
              >
                <h3
                  style={{
                    ...serif,
                    margin: 0,
                    fontSize: 22,
                    lineHeight: 1.18,
                    color: 'var(--pm-ink)',
                    fontWeight: 500,
                    textWrap: 'balance' as React.CSSProperties['textWrap'],
                  }}
                >
                  {stage.label}
                </h3>
                {stage.infoMessage && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'rgba(45,38,28,.65)' }}>
                    {stage.infoMessage}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* 진행률 링 — taupe radial gradient hero */}
        <div
          style={{
            marginTop: 22,
            padding: '28px 18px 22px',
            borderRadius: 22,
            background: C.cardHero,
            boxShadow: 'var(--pm-card-rim-soft)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 220, height: 220 }}>
            <svg width="220" height="220" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(217,154,88,.14)" strokeWidth="14" />
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
                style={{ filter: 'drop-shadow(0 0 6px rgba(217,154,88,.5))' }}
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
              <div style={{ marginTop: 8, fontSize: 12, color: C.ink3, textAlign: 'center', maxWidth: 200 }}>
                <div>
                  <span style={num}>{done}</span>
                  <span> / {total} 단계</span>
                </div>
                {ringStatus && <div style={{ marginTop: 3, color: C.ink2 }}>{ringStatus}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* 단계 리스트 — 한국(출국 준비)·일본·한국(귀국) 구간별 카드. */}
        <h3 style={{ ...serif, margin: '24px 0 12px', fontSize: 20 }}>전체 일정</h3>
        {stageZones.flatMap((zone, zi) => {
          const card = (
            <div
              key={`zone-${zi}`}
              style={{
                background: C.cardList,
                borderRadius: 20,
                boxShadow: 'var(--pm-card-rim)',
                padding: '4px 14px',
              }}
            >
              {zone.rows.map(({ stage, index }, k) =>
                renderStageRow(stage, index, k === zone.rows.length - 1),
              )}
            </div>
          )
          // caption 이 있는 구간(일본·귀국)은 카드 위에 구분 캡션을 얹는다.
          if (!zone.caption) return [card]
          return [
            <div key={`zone-${zi}-cap`} style={{ ...monoCap, margin: '22px 0 10px' }}>
              {zone.caption}
            </div>,
            card,
          ]
        })}
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

/** 주어진 YYYY-MM-DD 가 오늘 이후(내일~)인지. 디바이스 로컬 기준. */
function isFuture(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso > today
}

/** 한글 단어에 '으로/로' 조사를 붙인다 — 받침 없음·ㄹ받침은 '로', 그 외는 '으로'. */
function withRo(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (Number.isNaN(last) || last < 0xac00 || last > 0xd7a3) return `${word}로`
  const jong = (last - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`
}

