'use client'

import { useState } from 'react'

/**
 * Portal 전용 월 달력 그리드. Stone 팔레트 — @petmove/ui 의 Editorial(clay/olive)
 * Calendar 와 별개. 정보 탭의 날짜 필드(생년월일·출국일 등)가 바텀시트 안에서 사용.
 *
 * 순수 그리드 + 월 이동만 담당. '오늘'·'지우기' 액션은 호출 측(CalendarSheet)이 둠.
 * 모바일 전용 — hover 없이 selected/today 상태만으로 표현.
 */

const C = {
  surface: '#FBF7F1',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)',
  accent: '#B89968',
  soft: '#E8DCC4',
  sun: '#C26A4A',
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

  return (
    <div style={{ userSelect: 'none' }}>
      {/* 월 이동 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setView(new Date(year, month - 1, 1))}
          style={navBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          style={{
            fontFamily: 'var(--pm-font-display)',
            fontSize: 17,
            fontWeight: 500,
            color: C.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {year}년 {month + 1}월
        </div>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setView(new Date(year, month + 1, 1))}
          style={navBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

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
    </div>
  )
}
