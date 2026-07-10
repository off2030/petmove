'use client'


import { C as PM } from '@/lib/palette'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CaseHeader } from '@/components/cases/case-header'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { useCases } from '@/components/portal-shell/case-data-provider'
import type { JourneyData, JourneyStage } from '@/lib/journey/scenario'

/** 목적지별 히어로 사진 — public/destinations 에 번들(무료 라이선스 큐레이션).
    없는 목적지는 null — 히어로 카드가 사진 밴드 없이 메타 행으로 대체한다. */
const DEST_PHOTOS: Record<string, string> = {
  // 색감 비교 테스트 중 — 후보: japan.jpg(파스텔 후지) / japan-bright.jpg(쨍한 후지)
  // / japan-sakura.jpg(벚꽃 클로즈업, 하늘색 배경) / japan-tokyo-tower.jpg(도쿄타워 노을 항공뷰).
  // 하나로 정리할 것.
  일본: '/destinations/japan-sakura.jpg',
}

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
    fontSize: 12,
    color: C.ink3,
    fontWeight: 600,
  }

  // 히어로 카드의 주의 스트립 펼침 상태 — 평소엔 한 줄, 탭하면 상세 목록.
  const [alertsOpen, setAlertsOpen] = useState(false)

  const heroPhoto = DEST_PHOTOS[trip.toCity] ?? null

  // 다목적지 전환 — 헤더의 라우트(한국 ⇄ 일본) 버튼을 없애고 히어로의 목적지 칩이 담당.
  // 목적지 2개 이상이면 칩에 꺾쇠가 붙고, 탭하면 바텀시트로 활성 목적지를 바꾼다.
  const { cases } = useCases()
  const case_ = cases.find((c) => c.id === caseId) ?? null
  const destTokens = (case_?.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const multiDest = destTokens.length > 1
  const [destSheetOpen, setDestSheetOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDestResolved = activeDest ?? searchParams.get('dest') ?? destTokens[0] ?? ''
  const tripTypeRaw = (case_?.data as Record<string, unknown> | null | undefined)?.trip_type
  const tripTypeByDest =
    tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
      ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
      : {}

  function selectDest(dest: string) {
    setDestSheetOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('dest', dest)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // 사진 위 목적지·D-day 칩 공통 스타일 — 반투명 흰 배경(사진은 테마 무관 고정이라 하드코딩).
  const destChipStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#212124',
    lineHeight: 1.4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: 'none',
  }

  const dDayLabel = formatDDay(trip.daysLeft)
  // 링 둘째 줄 '상태' — 출국일 있으면 D-day(카운트다운), 없으면 'N일째' 카운트업(생성일 기준).
  // 항상 '단계' 줄 아래 별도 줄로, 한 단계 짙게(ink2) 강조 — 가장 actionable 한 정보.
  // (출국일 없을 때 일본 prep 힌트(trip.prep)는 잠시 보류 — 되돌릴 땐 아래 한 줄만 복구.)
  const prepCountupLabel = trip.elapsedDays != null ? `${trip.elapsedDays}일째` : null
  const ringStatus = dDayLabel ?? prepCountupLabel

  // 완료 배너 날짜 — 왕복은 출발~도착(귀국) 범위, 편도는 도착일만.
  const arrivalText = journeyCompleteDate ? formatKoreanDate(journeyCompleteDate) : ''
  const journeyDateText =
    trip.tripType === 'round' && trip.departureDate && journeyCompleteDate
      ? formatDateRange(trip.departureDate, journeyCompleteDate)
      : arrivalText

  // 일정 한 행 — 동그라미(번호·상태) + 항목명 + 날짜. index 는 전체 일정 기준 0-based.
  // 카드 면 없이 세로 레일(타임라인)로 잇는다 — 완료 구간은 진한 선, 남은 구간은 흐린 선.
  // first/last 는 소속 구간(zone) 내 위치(레일 시작·끝), prevDone 은 직전 행 완료 여부
  // (윗선 채움 판단).
  const renderStageRow = (
    s: JourneyStage,
    index: number,
    opts: { first: boolean; last: boolean; prevDone: boolean },
  ) => {
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
    // 세로 레일 — 완료(지나온 길)는 진하게, 남은 길은 흐리게. 위 반절은 직전 행,
    // 아래 반절은 이 행의 완료 상태를 따른다.
    const railDone = 'rgb(var(--pm-ink-rgb) / .28)'
    const railTodo = 'rgb(var(--pm-ink-rgb) / .09)'
    const padY = s.desc ? 13 : 18
    return (
      <Link
        key={s.id}
        href={stageHref(s)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          // 보조줄(desc) 없는 행은 제목 한 줄이라 빽빽해진다 — 설명문 숨김 모드 등에서
          // 세로 여백을 키워 호흡을 준다. 보조줄 있는 행은 기존 간격 유지.
          padding: `${padY}px 0`,
          textDecoration: 'none',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        {!opts.first && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: 0,
              height: padY,
              width: 2,
              background: opts.prevDone && isDone ? railDone : railTodo,
            }}
          />
        )}
        {!opts.last && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: padY + 22,
              bottom: 0,
              width: 2,
              background: isDone ? railDone : railTodo,
            }}
          />
        )}
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
            // upcoming 은 레일이 원 뒤로 비치지 않게 페이지 배경으로 채운다.
            background: hasWarn ? C.warn : isDone ? C.sage : isCurr ? C.accent : hasInfo ? C.info : C.bg,
            border: !hasWarn && !isDone && !isCurr && !hasInfo ? `1px solid rgb(var(--pm-ink-rgb) / .14)` : 'none',
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
                fontSize: 16,
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
                    background: 'rgba(33,33,36,0.08)',
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
                    background: isOverdueDeadline ? C.warnBg : 'rgba(33,33,36,0.08)',
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
        // 섹션 리듬 32 (여백 중시 톤) / 라벨→콘텐츠 12. 하단은 nav 여백이 더해져 24 유지.
        paddingTop: 32,
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

        {/* 히어로 카드 — 첫 화면의 얼굴. 상단은 목적지 사진(스크림 없이 원본 밝기 그대로,
            칩 2개: 목적지·D-day / 진행률), 아래는 흰 본문이 직선으로 이어지며 다음 할 일과
            주의를 담는다. 텍스트는 전부 사진 밖 흰 영역 — 사진 톤과 무관하게 항상 읽힌다.
            기존 진행률 링·다음 할 일·주의 카드 3장을 합친 것 — 여정 완료 후엔 완료 배너가
            이 역할을 대신하므로 가린다. */}
        {!journeyComplete && (
          <div
            style={{
              marginTop: 32,
              borderRadius: 16,
              overflow: 'hidden',
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            {heroPhoto && (
              <div style={{ position: 'relative', height: 200 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 정적 번들 사진, cover 크롭이라 img 로 충분 */}
                <img
                  src={heroPhoto}
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {multiDest ? (
                  <button
                    type="button"
                    onClick={() => setDestSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={destSheetOpen}
                    aria-label="목적지 전환"
                    className="pm-pressable"
                    style={{
                      ...destChipStyle,
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {trip.toCity}
                    {ringStatus ? ` · ${ringStatus}` : ''}
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        transform: destSheetOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .18s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                ) : (
                  <span style={{ ...destChipStyle, position: 'absolute', top: 12, left: 12 }}>
                    {trip.toCity}
                    {ringStatus ? ` · ${ringStatus}` : ''}
                  </span>
                )}
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: 'rgba(255,255,255,0.92)',
                    borderRadius: 999,
                    padding: '5px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 3,
                      borderRadius: 2,
                      background: 'rgba(33,33,36,0.18)',
                      overflow: 'hidden',
                      display: 'inline-block',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${Math.round(pct * 100)}%`,
                        height: '100%',
                        background: '#212124',
                      }}
                    />
                  </span>
                  <span style={{ ...num, fontSize: 12, color: '#212124' }}>
                    {done}/{total}
                  </span>
                </span>
              </div>
            )}

            <div style={{ padding: '14px 18px 18px' }}>
              {/* 헤더 행 — 사진 있으면 '다음 할 일' 라벨만(목적지·D-day·진행률은 사진 칩에),
                  없으면 목적지·D-day + 진행률 을 먼저 놓고 라벨은 아래에. */}
              {heroPhoto ? (
                <div style={{ fontSize: 12, color: C.ink3 }}>다음 할 일</div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    {multiDest ? (
                      <button
                        type="button"
                        onClick={() => setDestSheetOpen(true)}
                        aria-haspopup="dialog"
                        aria-expanded={destSheetOpen}
                        aria-label="목적지 전환"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.ink2,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          fontFamily: 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                      >
                        {trip.toCity}
                        {ringStatus ? ` · ${ringStatus}` : ''}
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{
                            flexShrink: 0,
                            transform: destSheetOpen ? 'rotate(180deg)' : 'none',
                            transition: 'transform .18s',
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}>
                        {trip.toCity}
                        {ringStatus ? ` · ${ringStatus}` : ''}
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 48,
                          height: 4,
                          borderRadius: 2,
                          background: 'rgb(var(--pm-ink-rgb) / .12)',
                          overflow: 'hidden',
                          display: 'inline-block',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            width: `${Math.round(pct * 100)}%`,
                            height: '100%',
                            background: C.accent,
                          }}
                        />
                      </span>
                      <span style={{ ...num, fontSize: 12, color: C.ink3 }}>
                        {done}/{total}
                      </span>
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.ink3, marginTop: 14 }}>다음 할 일</div>
                </>
              )}

              {nextStages.length > 0 && (
                <>
                  <Link
                    href={stageHref(nextStages[0])}
                    className="pm-pressable"
                    style={{ display: 'block', textDecoration: 'none', color: 'inherit', marginTop: 4 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <h3
                        style={{
                          ...serif,
                          margin: 0,
                          fontSize: 19,
                          lineHeight: 1.2,
                          color: C.ink,
                          fontWeight: 500,
                          textWrap: 'balance' as React.CSSProperties['textWrap'],
                        }}
                      >
                        {nextStages[0].label}
                      </h3>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: C.ink3, flexShrink: 0 }}
                        aria-hidden
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                    {(nextStages[0].cardDesc ?? nextStages[0].desc) && (
                      <p
                        style={{
                          margin: '5px 0 0',
                          fontSize: 13,
                          lineHeight: 1.55,
                          color: 'rgb(var(--pm-ink-rgb) / .65)',
                        }}
                      >
                        {nextStages[0].cardDesc ?? nextStages[0].desc}
                      </p>
                    )}
                    {nextStages[0].infoMessage &&
                      ((nextStages[0].infoChecks ?? 0) > 0 || nextStages[0].advisory) &&
                      nextStages[0].infoMessage !== (nextStages[0].cardDesc ?? nextStages[0].desc) && (
                        <p
                          style={{
                            margin: '8px 0 0',
                            fontSize: 13,
                            lineHeight: 1.55,
                            color: C.info,
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {nextStages[0].infoMessage}
                        </p>
                      )}
                  </Link>
                  {/* 이어서 — 둘째 할 일부터는 압축 행. */}
                  {nextStages.slice(1).map((stage) => (
                    <Link
                      key={stage.id}
                      href={stageHref(stage)}
                      className="pm-pressable"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: `.5px solid ${C.line}`,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink2 }}>
                        {stage.label}
                      </span>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: C.ink3, flexShrink: 0 }}
                        aria-hidden
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  ))}
                </>
              )}

              {/* 주의 스트립 — 케이스 차원 결격(견종·마릿수·거주 등). 평소엔 존재하지 않고,
                  발생 시 한 줄 앰버 스트립. 탭하면 카드 안에서 상세를 펼친다. */}
              {caseAlerts.length > 0 && (
                <div
                  style={{
                    marginTop: nextStages.length > 0 ? 14 : 0,
                    borderRadius: 10,
                    background: C.warnBg,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAlertsOpen((v) => !v)}
                    className="pm-pressable"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: C.warn,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                      aria-hidden
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      주의 {caseAlerts.length}건 — {caseAlerts.map((a) => a.title).join(' · ')}
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        flexShrink: 0,
                        transform: alertsOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .18s ease',
                      }}
                      aria-hidden
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {alertsOpen && (
                    <div style={{ padding: '0 12px 12px' }}>
                      {caseAlerts.map((alert, i) => (
                        <div
                          key={alert.id}
                          style={{
                            marginTop: i === 0 ? 2 : 12,
                            paddingTop: i === 0 ? 0 : 12,
                            borderTop: i === 0 ? 'none' : `.5px solid ${C.line}`,
                          }}
                        >
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                            {alert.title}
                          </div>
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: C.ink2,
                            }}
                          >
                            {alert.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 목적지 전환 바텀시트 — 히어로 목적지 칩(다목적지)에서 연다. UI 는 헤더 시절과 동일. */}
        {multiDest && (
          <BottomSheet
            open={destSheetOpen}
            onClose={() => setDestSheetOpen(false)}
            title="목적지"
          >
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
              {destTokens.map((t) => {
                const isActive = t === activeDestResolved
                const arrow = (tripTypeByDest[t] ?? 'round') === 'round' ? '⇄' : '→'
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectDest(t)}
                    aria-pressed={isActive}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      width: '100%',
                      padding: '15px 0',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '.5px solid var(--pm-line)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 16,
                        color: isActive ? C.ink : C.ink2,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <span>{trip.fromCity}</span>
                      <span style={{ color: C.ink3 }}>{arrow}</span>
                      <span>{t}</span>
                    </span>
                    {isActive && (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={C.ink}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        style={{ flexShrink: 0 }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </BottomSheet>
        )}

        {/* 주의 카드 — 여정 완료 후에만 별도 카드로 (완료 중 히어로가 없으므로).
            진행 중엔 히어로 카드의 주의 스트립이 담당한다. */}
        {journeyComplete && caseAlerts.length > 0 && (
          <div
            style={{
              marginTop: 18,
              padding: 22,
              borderRadius: 16,
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
              borderRadius: 16,
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
                color: 'rgb(var(--pm-ink-rgb) / .6)',
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
                  <span style={{ color: 'rgb(var(--pm-ink-rgb) / .3)', margin: '0 6px' }}>·</span>
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
              borderRadius: 16,
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
                borderRadius: 16,
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

        {/* 안내 카드 — 다음 할 일 카드와 같은 톤·구조. 단 헤더 라벨은 info 색으로 구분.
            안내별 카드 1장씩 (다건이면 N장) — step 이름 + 안내문 첫 줄 + 해당 step 링크.
            여정 완료 후엔 완료 배너에 집중하도록 가린다. */}
        {!journeyComplete && infoStages.length > 0 && (
          <div
            style={{
              marginTop: nextStages.length > 0 ? 14 : 22,
              padding: 22,
              borderRadius: 16,
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
                  borderTop: i === 0 ? 0 : '1px solid rgb(var(--pm-ink-rgb) / .12)',
                }}
              >
                <h3
                  style={{
                    ...serif,
                    margin: 0,
                    fontSize: 19,
                    lineHeight: 1.18,
                    color: 'var(--pm-ink)',
                    fontWeight: 500,
                    textWrap: 'balance' as React.CSSProperties['textWrap'],
                  }}
                >
                  {stage.label}
                </h3>
                {stage.infoMessage && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'rgb(var(--pm-ink-rgb) / .65)' }}>
                    {stage.infoMessage}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* 단계 리스트 — 한국(출국 준비)·일본·한국(귀국) 구간별. 카드 면 없이 페이지 배경
            위에 바로, 세로 레일(타임라인)이 구간 안의 행들을 잇는다. */}
        <h3 style={{ ...serif, margin: '32px 0 4px', fontSize: 17 }}>전체 일정</h3>
        {stageZones.flatMap((zone, zi) => {
          const list = (
            <div key={`zone-${zi}`}>
              {zone.rows.map(({ stage, index }, k) =>
                renderStageRow(stage, index, {
                  first: k === 0,
                  last: k === zone.rows.length - 1,
                  prevDone: k > 0 && zone.rows[k - 1].stage.state === 'done',
                }),
              )}
            </div>
          )
          // caption 이 있는 구간(일본·귀국)은 '이동' 노드로 잇는다 — 단계 동그라미들과
          // 같은 세로축에 비행기 아이콘, 옆에 캡션. 소제목이 아니라 여정 경로 위에서
          // 실제로 건너가는 마디로 읽히도록.
          if (!zone.caption) return [list]
          return [
            <div
              key={`zone-${zi}-cap`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                margin: '24px 0',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.ink3,
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                </svg>
              </span>
              <span style={{ ...monoCap }}>{zone.caption}</span>
            </div>,
            list,
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

