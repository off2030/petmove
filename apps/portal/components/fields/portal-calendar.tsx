'use client'


import { C as PM } from '@/lib/palette'
import { useEffect, useRef, useState } from 'react'

/**
 * Portal 전용 월 달력 그리드. Stone 팔레트 — @petmove/ui 의 Editorial(clay/olive)
 * Calendar 와 별개. 정보 탭의 날짜 필드(생년월일·출국일 등)가 바텀시트 안에서 사용.
 *
 * 순수 그리드 + 월 이동만 담당. '오늘'·'지우기' 액션은 호출 측(CalendarSheet)이 둠.
 * 모바일 전용 — hover 없이 selected/today 상태만으로 표현.
 *
 * 헤더 가운데 '2026년 7월'을 탭하면 연도 → 월 빠른 점프 모드로 전환된다 — 생년월일처럼
 * 먼 과거는 화살표로 100번+ 눌러야 했던 문제 해결(2026-07-13). 화살표는 모드별로
 * 일=±1개월 / 월=±1년 / 연=±12년 이동.
 */

const C = {
  ...PM,
  sun: 'var(--pm-danger)',
} as const

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** Date → 'YYYY-MM-DD' (로컬 타임존 — UTC shift 회피). */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' → Date (로컬). 형식·유효성 불일치 시 null. */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  // 2월 31일 등 overflow 한 값 차단.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return d
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function PortalCalendar({
  value,
  onSelect,
}: {
  /** 'YYYY-MM-DD' 또는 빈 문자열. */
  value: string
  onSelect: (ymd: string) => void
}) {
  const selected = parseYmd(value)
  const today = new Date()

  const [view, setView] = useState(() => {
    const base = selected ?? today
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  // 'day'=날짜 그리드(기본), 'year'=연도 12칸, 'month'=월 12칸. 연→월→일 순 드릴다운.
  const [mode, setMode] = useState<'day' | 'year' | 'month'>('day')
  const year = view.getFullYear()
  const month = view.getMonth()

  // 6주(42칸) — 해당 월 1일이 속한 주의 일요일부터.
  const first = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }

  const navBtn: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: 0,
    background: 'transparent',
    color: C.ink2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  }

  // 연도 목록 — 최신이 위, 미래 5년 ~ 과거 50년. 스크롤 한 줄 리스트(드롭다운 느낌).
  const thisYear = today.getFullYear()
  const YEARS: number[] = []
  for (let y = thisYear + 5; y >= thisYear - 50; y--) YEARS.push(y)
  const YEAR_ROW_H = 44
  const yearListRef = useRef<HTMLDivElement | null>(null)
  // 연도 모드 진입 시 현재 view 연도가 목록 가운데 오도록 스크롤.
  useEffect(() => {
    if (mode !== 'year') return
    const el = yearListRef.current
    if (!el) return
    const idx = YEARS.indexOf(year)
    if (idx >= 0) el.scrollTop = idx * YEAR_ROW_H - el.clientHeight / 2 + YEAR_ROW_H / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // 화살표 이동량 — 일=±1개월, 월=±1년. 연도 모드는 스크롤로 이동(화살표 숨김).
  function nav(dir: -1 | 1) {
    if (mode === 'day') setView(new Date(year, month + dir, 1))
    else setView(new Date(year + dir, month, 1))
  }

  const headerLabel =
    mode === 'year' ? '연도 선택'
    : mode === 'month' ? `${year}년`
    : `${year}년 ${month + 1}월`

  // 연/월 선택 12칸 그리드 공통 셀 스타일.
  const jumpCell = (active: boolean): React.CSSProperties => ({
    height: 44,
    borderRadius: 12,
    border: '1px solid transparent',
    background: active ? C.accent : 'transparent',
    color: active ? '#fff' : C.ink,
    fontFamily: 'var(--pm-font-display)',
    fontSize: 15,
    fontWeight: active ? 600 : 400,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    transition: 'background .12s, color .12s',
  })

  return (
    <div style={{ userSelect: 'none' }}>
      {/* 이동 헤더 — 가운데 라벨 탭 = 연도 점프 모드 진입 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        {/* 연도 모드는 스크롤이 이동 수단 — 화살표 자리는 유지(가운데 라벨 흔들림 방지)하되 숨김 */}
        <button
          type="button"
          aria-label={mode === 'day' ? '이전 달' : '이전 해'}
          onClick={() => nav(-1)}
          style={{ ...navBtn, visibility: mode === 'year' ? 'hidden' : 'visible' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="연도·월 바로 선택"
          onClick={() => setMode(mode === 'day' ? 'year' : 'day')}
          style={{
            border: 0,
            background: 'transparent',
            padding: '4px 10px',
            borderRadius: 10,
            fontFamily: 'var(--pm-font-display)',
            fontSize: 17,
            fontWeight: 500,
            color: mode === 'day' ? C.ink : C.accent,
            fontVariantNumeric: 'tabular-nums',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {headerLabel}
          {/* 탭 가능함을 알리는 작은 셰브론 — 점프 모드에선 접기(위) 방향 */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
            {mode === 'day' ? <polyline points="6 9 12 15 18 9" /> : <polyline points="6 15 12 9 18 15" />}
          </svg>
        </button>
        <button
          type="button"
          aria-label={mode === 'day' ? '다음 달' : '다음 해'}
          onClick={() => nav(1)}
          style={{ ...navBtn, visibility: mode === 'year' ? 'hidden' : 'visible' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* 연도 선택 — 한 줄 스크롤 목록(드롭다운). 진입 시 현재 연도가 가운데. 탭하면 월 선택으로. */}
      {mode === 'year' && (
        <div
          ref={yearListRef}
          style={{
            height: YEAR_ROW_H * 7, // 7줄 보임 — 날짜 그리드와 비슷한 높이
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '0 48px', // 좌우 여백 — 가운데 열 하나만
            // 위·아래 가장자리 페이드 — 더 있음을 암시.
            maskImage: 'linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 28px, #000 calc(100% - 28px), transparent 100%)',
          }}
        >
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setView(new Date(y, month, 1))
                setMode('month')
              }}
              style={{
                ...jumpCell(y === (selected?.getFullYear() ?? -1)),
                display: 'block',
                width: '100%',
                height: YEAR_ROW_H,
              }}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* 월 선택 — 12칸. 탭하면 날짜 그리드로 복귀. */}
      {mode === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, padding: '4px 0 8px' }}>
          {Array.from({ length: 12 }, (_, i) => i).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setView(new Date(year, m, 1))
                setMode('day')
              }}
              style={jumpCell(
                selected != null && year === selected.getFullYear() && m === selected.getMonth(),
              )}
            >
              {m + 1}월
            </button>
          ))}
        </div>
      )}

      {mode === 'day' && (
        <>
      {/* 요일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.04em',
              color: i === 0 ? C.sun : C.ink3,
              paddingBottom: 6,
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
        {cells.map((d) => {
          const outside = d.getMonth() !== month
          const isSel = selected != null && sameDay(d, selected)
          const isToday = sameDay(d, today)
          const isSunday = d.getDay() === 0
          let color: string = C.ink
          if (outside) color = C.ink3
          else if (isSunday) color = C.sun
          return (
            <div
              key={ymdLocal(d)}
              style={{ display: 'flex', justifyContent: 'center', padding: '1px 0' }}
            >
              <button
                type="button"
                onClick={() => onSelect(ymdLocal(d))}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  border: isToday && !isSel ? `1px solid ${C.accent}` : '1px solid transparent',
                  background: isSel ? C.accent : 'transparent',
                  color: isSel ? '#fff' : color,
                  opacity: outside ? 0.45 : 1,
                  fontFamily: 'var(--pm-font-display)',
                  fontSize: 15,
                  fontWeight: isSel ? 600 : 400,
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'background .12s, color .12s',
                }}
              >
                {d.getDate()}
              </button>
            </div>
          )
        })}
      </div>
        </>
      )}
    </div>
  )
}
