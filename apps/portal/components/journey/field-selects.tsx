'use client'

import { C } from '@/lib/palette'

/**
 * step 입력 폼의 '선택자' 공용 컴포넌트 — 색·동작 단일 출처.
 *
 * 같은 모양·같은 선택색을 쓰는 선택자들이 파일마다 인라인으로 흩어져 있어 색이 어긋나기
 * 쉬웠다(검정 칩 vs 앰버 리스트). 여기로 모아서 **선택색을 한 곳(SELECTED)에서만** 관리한다.
 *
 *  - ChipSelect  : 가로 칩 세그먼트 (유효기간 1·2·3년 / 운송 방법 등 짧은 옵션)
 *  - YearSelect  : ChipSelect 위에 얹은 "N년" 전용 래퍼 (광견병·종합백신 면역 유효기간)
 *  - OptionList  : 세로 옵션 리스트 + 체크 (검사기관 등 라벨 긴 항목)
 *
 * 선택색을 바꾸려면 아래 SELECTED 한 곳만 고치면 모든 선택자에 반영된다.
 */

/** '선택됨' 상태 색 — 단일 출처. accentSoft 는 라이트/다크 자동 반전되도록 color-mix 사용. */
const SELECTED = {
  border: C.accent,
  bg: 'color-mix(in srgb, var(--pm-accent) 14%, transparent)',
  fg: C.ink,
  mark: C.accent,
} as const
const UNSELECTED = {
  border: C.line,
  bg: 'var(--pm-surface)',
  fg: C.ink2,
} as const

export interface SelectOption {
  value: string
  label: string
}

/**
 * 가로 칩 세그먼트. shape='block' 은 flex:1 균등폭(라운드 10), 'pill' 은 알약(라운드 999).
 * allowDeselect 면 선택된 칩을 다시 누를 때 ''(해제)를 전달.
 */
export function ChipSelect({
  options,
  value,
  onChange,
  shape = 'block',
  allowDeselect = false,
  disabledValues,
}: {
  options: readonly SelectOption[]
  value: string
  onChange: (next: string) => void
  shape?: 'block' | 'pill'
  allowDeselect?: boolean
  /** 선택 불가(입력불가)로 흐리게 처리할 옵션 value 목록. 클릭 무시. */
  disabledValues?: readonly string[]
}) {
  const pill = shape === 'pill'
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: pill ? 'wrap' : undefined, gap: 8 }}>
      {options.map((o) => {
        const disabled = disabledValues?.includes(o.value) ?? false
        const selected = value === o.value && !disabled
        const s = selected ? SELECTED : UNSELECTED
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              onChange(selected && allowDeselect ? '' : o.value)
            }}
            aria-pressed={selected}
            aria-disabled={disabled}
            style={{
              flex: pill ? undefined : 1,
              padding: pill ? '8px 16px' : '9px 0',
              borderRadius: pill ? 999 : 10,
              border: `1px solid ${disabled ? C.line : s.border}`,
              background: disabled ? 'rgb(var(--pm-ink-rgb) / .04)' : s.bg,
              color: disabled ? C.ink3 : s.fg,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              textDecoration: disabled ? 'line-through' : undefined,
              opacity: disabled ? 0.6 : 1,
              transition: 'background .12s, color .12s, border-color .12s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const YEAR_OPTIONS: readonly SelectOption[] = [
  { value: '1', label: '1년' },
  { value: '2', label: '2년' },
  { value: '3', label: '3년' },
]

/**
 * 면역 유효기간 1·2·3년 칩. value 는 "N년"/빈값, onChange 에 "N년" 문자열을 전달.
 * 빈값이면 기본 1년 선택 표시(저장은 사용자가 누를 때까지 빈값 유지), legacy 값은 미선택.
 */
export function YearSelect({
  value,
  onChange,
  oneYearOnly = false,
}: {
  value: string
  onChange: (next: string) => void
  /** true 면 2년·3년 칩을 입력불가(비활성)로 — 1년 백신만 인정하는 목적지(중국·태국·필리핀). */
  oneYearOnly?: boolean
}) {
  const m = value.match(/^(\d+)\s*년$/)
  const selected = m ? m[1] : value.trim() === '' ? '1' : ''
  return (
    <ChipSelect
      options={YEAR_OPTIONS}
      value={selected}
      onChange={(n) => onChange(`${n}년`)}
      disabledValues={oneYearOnly ? ['2', '3'] : undefined}
    />
  )
}

function CheckMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke={SELECTED.mark}
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * 세로 옵션 리스트 + 선택 항목 체크. 라벨이 길거나 항목 수가 많은 선택(검사기관 등)에 사용.
 * isSelected 는 커스텀 비교 허용(예: APQA seoul/eu/hq 를 같은 기관으로 보고 선택 표시).
 */
export function OptionList({
  options,
  isSelected,
  onSelect,
}: {
  options: readonly SelectOption[]
  isSelected: (value: string) => boolean
  onSelect: (value: string) => void
}) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((o) => {
        const selected = isSelected(o.value)
        const s = selected ? SELECTED : UNSELECTED
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            aria-pressed={selected}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '11px 12px',
              border: `1px solid ${s.border}`,
              borderRadius: 10,
              background: s.bg,
              fontFamily: 'inherit',
              fontSize: 15,
              color: C.ink,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color .12s, background .12s',
            }}
          >
            <span>{o.label}</span>
            {selected && <CheckMark />}
          </button>
        )
      })}
    </div>
  )
}
