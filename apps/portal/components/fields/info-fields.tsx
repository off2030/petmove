'use client'



import { COAT_COLOR_HEX as COLOR_HEX } from '@/lib/coat-colors'
import { C as PM } from '@/lib/palette'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import destsData from '@petmove/domain/data/destinations.json'
import breedsData from '@petmove/domain/data/breeds.json'
import colorsData from '@petmove/domain/data/colors.json'
import type { DaumPostcodeResult } from '@/types/daum'
import { BottomSheet } from './bottom-sheet'
import { PortalCalendar, ymdLocal } from './portal-calendar'

/**
 * 정보 탭의 편집 가능한 필드 셀. Stone 팔레트 — info-view 와 동일 톤.
 *
 * 모든 셀은 controlled — 부모(InfoView)가 폼 state·dirty·save 를 보유.
 *  - TextField        : 인라인/스택 텍스트 입력 (전화·칩 마스크 지원)
 *  - DateField        : 바텀시트 달력 (Stone 톤 PortalCalendar)
 *  - OptionField      : 바텀시트 선택 목록 (종·성별)
 *  - SegmentField     : 인라인 분절 토글 (왕복/편도·유형, 칸 너비 동일)
 *  - SwitchField      : 인라인 On/Off 토글 스위치 (함께 준비)
 *  - DestinationField : 검색형 바텀시트 (여행지)
 */

const C = {
  ...PM,
  accentSoft: 'color-mix(in srgb, var(--pm-accent) 14%, transparent)',
} as const

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

interface Breed {
  ko: string
  en: string
  type: string
  alias?: string[]
}
const BREEDS = breedsData as Breed[]

interface ColorItem {
  ko: string
  en: string
  alias?: string[]
}
const COLORS = colorsData as ColorItem[]


// ── 마스크/포맷 헬퍼 ─────────────────────────────────────────────────────

/** 숫자 11자리 → 010-1234-5678 (10자리는 3-3-4). 표시 전용. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

/** 숫자 → 3자리씩 공백 (마이크로칩 표시). */
function formatChip(digits: string): string {
  return digits.replace(/\D/g, '').slice(0, 15).replace(/(\d{3})(?=\d)/g, '$1 ')
}

/** 시간 입력 마스킹 — 숫자만 추려 H:mm / HH:mm 으로 (예: '1200'→'12:00', '930'→'9:30'). */
function normalizeTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  // 시 앞자리가 3~9 면 한 자리 시, 그 외엔 두 자리.
  const hourLen = d[0] >= '3' && d[0] <= '9' ? 1 : 2
  return d.length <= hourLen ? d : `${d.slice(0, hourLen)}:${d.slice(hourLen)}`
}

/** 'YYYY-MM-DD' → 'YYYY·MM·DD'. 빈 값은 빈 문자열. */
function dotDate(iso: string): string {
  return iso ? iso.replace(/-/g, '·') : ''
}

/** 한글(자모·완성형) 제거 + 첫 글자 자동 대문자. 영문 이름 입력 강제용. */
function filterToEnglish(raw: string): string {
  return raw
    .replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

// ── Row chrome ───────────────────────────────────────────────────────────

// 라벨 좌측 + 값 좌측(라벨 옆에서 시작) — 단순·일관 톤. 라벨 폭 고정으로 값이 같은
// 컬럼에서 시작하게 정렬. 값이 여러 줄로 늘어날 때(주소)는 alignTop 로 라벨 위 정렬.
// 라벨 폭 — '내 정보' 모든 편집 화면이 공유. 가장 긴 라벨('마이크로칩'·'왕복 · 편도')이
// 안 깨지는 한도까지 좁혀 라벨·값 간격을 줄였다(88→70). 70px 는 폰트 로드 실패·swap 순간
// 시스템 한글 폴백(Malgun 기준 '마이크로칩' 65px)까지 커버. nowrap 으로 어떤 폴백에서도 줄바꿈 방지.
const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: C.ink2,
  flexShrink: 0,
  width: 70,
  whiteSpace: 'nowrap',
}

function InlineRow({
  label,
  last,
  children,
  alignTop,
}: {
  label: string
  last?: boolean
  children: React.ReactNode
  /** 값이 여러 줄로 늘어날 수 있을 때(주소 등) 라벨을 위로 정렬. */
  alignTop?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: alignTop ? 'flex-start' : 'center',
        padding: '11px 0',
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        gap: 8,
        minHeight: 46,
      }}
    >
      <span style={{ ...labelStyle, ...(alignTop ? { paddingTop: 2 } : null) }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
        {children}
      </div>
    </div>
  )
}

/** 인라인 행 안에서 다른 값들과 같은 글꼴·정렬을 유지하되 길면 줄바꿈되는 입력(주소). */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  readOnly,
  onClick,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  readOnly?: boolean
  onClick?: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="pm-field-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      onClick={onClick}
      rows={1}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: 'left',
        background: 'transparent',
        border: 0,
        outline: 'none',
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--pm-font-display)',
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.4,
        color: C.ink,
        cursor: readOnly ? 'pointer' : 'text',
      }}
    />
  )
}

// ── 트리거 버튼 (date / option / destination 공용) ───────────────────────

function TriggerButton({
  display,
  empty,
  icon,
  onClick,
  sub,
}: {
  display: string
  empty: boolean
  icon: 'calendar' | 'chevron'
  onClick: () => void
  /** 값 아래 보조 텍스트 (연령·D-day 등). */
  sub?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        maxWidth: '100%',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: empty ? 400 : 500,
            color: empty ? C.ink3 : C.ink,
            fontFamily: 'var(--pm-font-display)',
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {empty ? '선택' : display}
        </span>
        {icon === 'calendar' ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </span>
      {sub && <span style={{ fontSize: 12, color: C.ink3 }}>{sub}</span>}
    </button>
  )
}

// ── TextField ────────────────────────────────────────────────────────────

export function TextField({
  label,
  value,
  onChange,
  placeholder = '입력',
  last,
  mask,
  inputMode,
  stacked,
  suffix,
  readOnly,
  onClick,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  last?: boolean
  mask?: 'phone' | 'microchip' | 'weight' | 'time' | 'en-name'
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email'
  /** true 면 라벨 위 + 입력 아래 (긴 텍스트: 주소). */
  stacked?: boolean
  /** 인라인 입력 우측 단위 표기 (예: kg). */
  suffix?: string
  /** 읽기 전용 — 주소 검색 결과 같은 자동 입력 칸. */
  readOnly?: boolean
  /** readOnly 일 때 input 클릭 시 동작 (모달 열기 등). */
  onClick?: () => void
}) {
  const composingRef = useRef(false)
  const display =
    mask === 'phone'
      ? formatPhone(value)
      : mask === 'microchip'
        ? formatChip(value)
        : inputMode === 'email'
          ? value.toLowerCase()
          : value

  function handle(raw: string) {
    if (inputMode === 'email') onChange(raw.toLowerCase())
    else if (mask === 'phone') onChange(raw.replace(/\D/g, '').slice(0, 11))
    else if (mask === 'microchip') onChange(raw.replace(/\D/g, '').slice(0, 15))
    else if (mask === 'weight') {
      // 숫자 + 소수점 1개만.
      const cleaned = raw.replace(/[^\d.]/g, '')
      const parts = cleaned.split('.')
      onChange(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned)
    } else if (mask === 'time') onChange(normalizeTime(raw))
    else if (mask === 'en-name') {
      // composing(IME) 중에는 raw 그대로 — 한글 자모 조합 중 끊김 방지. 조합 끝나면 필터링.
      if (composingRef.current) onChange(raw)
      else onChange(filterToEnglish(raw))
    } else onChange(raw)
  }

  if (stacked) {
    return (
      <InlineRow label={label} last={last} alignTop>
        <AutoGrowTextarea
          value={value}
          onChange={handle}
          placeholder={placeholder}
          readOnly={readOnly}
          onClick={onClick}
        />
      </InlineRow>
    )
  }

  return (
    <InlineRow label={label} last={last}>
      <input
        className="pm-field-input"
        type="text"
        inputMode={inputMode}
        autoCapitalize={inputMode === 'email' ? 'none' : undefined}
        autoCorrect={inputMode === 'email' ? 'off' : undefined}
        spellCheck={inputMode === 'email' ? false : undefined}
        value={display}
        readOnly={readOnly}
        onClick={onClick}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          if (mask === 'en-name') handle((e.target as HTMLInputElement).value)
        }}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          background: 'transparent',
          border: 0,
          outline: 'none',
          padding: 0,
          fontFamily: 'var(--pm-font-display)',
          fontSize: 15,
          fontWeight: 500,
          color: C.ink,
          fontVariantNumeric: 'tabular-nums',
          cursor: readOnly ? 'pointer' : 'text',
        }}
      />
      {suffix && (
        <span style={{ flexShrink: 0, marginLeft: 5, fontSize: 14, color: C.ink2 }}>{suffix}</span>
      )}
    </InlineRow>
  )
}

// ── SplitNameField (영문 성·이름 두 input 한 줄) ──────────────────────────

/**
 * 한 라벨 아래 두 input 가로 — 영문 이름·성 분리 입력용.
 * 순서는 First Last(이름 → 성) — 합본 column `${first} ${last}` 와 일관, 영어 표기 자연.
 * placeholder 로 어느 칸이 이름/성인지 안내.
 */
export function SplitNameField({
  label,
  firstValue,
  lastValue,
  onChangeFirst,
  onChangeLast,
  firstPlaceholder = 'Gildong',
  lastPlaceholder = 'Hong',
  last,
}: {
  label: string
  firstValue: string
  lastValue: string
  onChangeFirst: (next: string) => void
  onChangeLast: (next: string) => void
  firstPlaceholder?: string
  lastPlaceholder?: string
  last?: boolean
}) {
  const composingFirstRef = useRef(false)
  const composingLastRef = useRef(false)
  function makeChange(
    composingRef: React.MutableRefObject<boolean>,
    setter: (v: string) => void,
  ) {
    return (raw: string) => {
      if (composingRef.current) setter(raw)
      else setter(filterToEnglish(raw))
    }
  }
  // input 폭을 실측 — HTML size·field-sizing 둘 다 모바일 크롬에서 사실상 무시됐다.
  // hidden span 으로 텍스트 폭을 직접 측정해서 input width 를 픽셀로 박는다.
  const firstMeasureRef = useRef<HTMLSpanElement>(null)
  const lastMeasureRef = useRef<HTMLSpanElement>(null)
  const [firstW, setFirstW] = useState(60)
  const [lastW, setLastW] = useState(40)
  useLayoutEffect(() => {
    if (firstMeasureRef.current) {
      // +2px 캐럿 여유.
      setFirstW(Math.max(firstMeasureRef.current.offsetWidth + 2, 16))
    }
  }, [firstValue, firstPlaceholder])
  useLayoutEffect(() => {
    if (lastMeasureRef.current) {
      setLastW(Math.max(lastMeasureRef.current.offsetWidth + 2, 16))
    }
  }, [lastValue, lastPlaceholder])

  const textStyle: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: 0,
  }
  const inputStyle: React.CSSProperties = {
    ...textStyle,
    minWidth: 0,
    textAlign: 'left',
    background: 'transparent',
    border: 0,
    outline: 'none',
    padding: 0,
    margin: 0,
    color: C.ink,
    boxSizing: 'content-box',
    flexShrink: 0,
  }
  const measureStyle: React.CSSProperties = {
    ...textStyle,
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  }
  const changeFirst = makeChange(composingFirstRef, onChangeFirst)
  const changeLast = makeChange(composingLastRef, onChangeLast)
  return (
    <InlineRow label={label} last={last}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'nowrap', position: 'relative' }}>
        <span ref={firstMeasureRef} style={measureStyle} aria-hidden>
          {firstValue || firstPlaceholder}
        </span>
        <span ref={lastMeasureRef} style={measureStyle} aria-hidden>
          {lastValue || lastPlaceholder}
        </span>
        <input
          className="pm-field-input"
          type="text"
          value={firstValue}
          onChange={(e) => changeFirst(e.target.value)}
          onCompositionStart={() => { composingFirstRef.current = true }}
          onCompositionEnd={(e) => {
            composingFirstRef.current = false
            changeFirst((e.target as HTMLInputElement).value)
          }}
          placeholder={firstPlaceholder}
          style={{ ...inputStyle, width: firstW }}
        />
        <input
          className="pm-field-input"
          type="text"
          value={lastValue}
          onChange={(e) => changeLast(e.target.value)}
          onCompositionStart={() => { composingLastRef.current = true }}
          onCompositionEnd={(e) => {
            composingLastRef.current = false
            changeLast((e.target as HTMLInputElement).value)
          }}
          placeholder={lastPlaceholder}
          style={{ ...inputStyle, width: lastW }}
        />
      </div>
    </InlineRow>
  )
}

// ── DateField ────────────────────────────────────────────────────────────

export function DateField({
  label,
  value,
  onChange,
  last,
  sub,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  last?: boolean
  /** 값 아래 보조 텍스트 (연령·D-day). */
  sub?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <InlineRow label={label} last={last}>
      <TriggerButton
        display={dotDate(value)}
        empty={!value}
        icon="calendar"
        onClick={() => setOpen(true)}
        sub={value ? sub : undefined}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <PortalCalendar
          value={value}
          onSelect={(iso) => {
            onChange(iso)
            setOpen(false)
          }}
        />
        <div
          style={{
            marginTop: 8,
            paddingTop: 12,
            borderTop: `.5px solid ${C.line}`,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            style={sheetActionStyle(C.ink3)}
          >
            지우기
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(ymdLocal(new Date()))
              setOpen(false)
            }}
            style={sheetActionStyle(C.accent)}
          >
            오늘
          </button>
        </div>
      </BottomSheet>
    </InlineRow>
  )
}

function sheetActionStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: 0,
    padding: '4px 4px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    color,
    cursor: 'pointer',
  }
}

// ── OptionField (종·성별) ────────────────────────────────────────────────

export interface FieldOption {
  value: string
  label: string
}

export function OptionField({
  label,
  value,
  onChange,
  options,
  last,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly FieldOption[]
  last?: boolean
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const display = current?.label ?? value

  return (
    <InlineRow label={label} last={last}>
      <TriggerButton display={display} empty={!value} icon="chevron" onClick={() => setOpen(true)} />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4 }}>
          {options.map((o) => {
            const selected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                aria-pressed={selected}
                style={optionRowStyle(selected)}
              >
                <span>{o.label}</span>
                {selected && <CheckMark />}
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </InlineRow>
  )
}

function optionRowStyle(selected: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '13px 14px',
    border: `1px solid ${selected ? C.accent : C.line}`,
    borderRadius: 12,
    background: selected ? C.accentSoft : 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 16,
    color: C.ink,
    cursor: 'pointer',
    textAlign: 'left',
  }
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// ── SegmentField (여행 유형) ─────────────────────────────────────────────

export function SegmentField({
  label,
  value,
  onChange,
  options,
  last,
  sub,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly FieldOption[]
  last?: boolean
  /** 옵션 아래 보조 텍스트 (도움말). */
  sub?: string
}) {
  return (
    <InlineRow label={label} last={last} alignTop={!!sub}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {/* 연결된 분절 토글 — 한 트랙 안에 칸 너비 동일(grid 1fr), 선택된 칸만 채워진다(~32px 높이). */}
        <div
          role="group"
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: '1fr',
            padding: 2,
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--pm-ink) 8%, transparent)',
          }}
        >
          {options.map((o) => {
            const selected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                aria-pressed={selected}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 0,
                  background: selected ? C.accent : 'transparent',
                  color: selected ? '#fff' : C.ink2,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {sub && <span style={{ fontSize: 12, color: C.ink3, lineHeight: 1.4 }}>{sub}</span>}
      </div>
    </InlineRow>
  )
}

// ── SwitchField (On/Off 토글 스위치 — 함께 준비) ──────────────────────────

/**
 * iOS 식 On/Off 토글 스위치. 불리언 한 값 — 트랙(켜짐=accent 골드, 앱 활성색 통일) + 미끄러지는 흰 thumb.
 * SegmentField 와 같은 InlineRow 레이아웃·sub 보조문구를 지원.
 */
export function SwitchField({
  label,
  checked,
  onChange,
  last,
  sub,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  last?: boolean
  /** 스위치 아래 보조 텍스트 (도움말). */
  sub?: string
}) {
  return (
    <InlineRow label={label} last={last} alignTop={!!sub}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          style={{
            position: 'relative',
            flexShrink: 0,
            width: 46,
            height: 28,
            padding: 0,
            border: 0,
            borderRadius: 999,
            background: checked ? C.accent : 'color-mix(in srgb, var(--pm-ink) 18%, transparent)',
            cursor: 'pointer',
            transition: 'background .18s',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 3,
              left: checked ? 21 : 3,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.25)',
              transition: 'left .18s',
            }}
          />
        </button>
        {sub && <span style={{ fontSize: 12, color: C.ink3, lineHeight: 1.4 }}>{sub}</span>}
      </div>
    </InlineRow>
  )
}

// ── DestinationField (여행지 검색) ───────────────────────────────────────

export function DestinationField({
  label,
  value,
  onChange,
  last,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  last?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matched = useMemo(() => DESTS.find((d) => d.ko === value), [value])
  const display = matched ? matched.ko : value

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DESTS
    return DESTS.filter((d) => d.ko.includes(q) || d.en.toLowerCase().includes(q))
  }, [query])

  return (
    <InlineRow label={label} last={last}>
      <TriggerButton
        display={display}
        empty={!value}
        icon="chevron"
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <input
          className="pm-field-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="국가 검색 · 일본 / Japan"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--pm-surface)',
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: '11px 12px',
            fontFamily: 'inherit',
            fontSize: 15,
            color: C.ink,
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        />
        <div
          className="pm-noscroll"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflow: 'auto' }}
        >
          {filtered.length === 0 && (
            <div style={{ fontSize: 13, color: C.ink3, padding: '12px 4px' }}>검색 결과 없음</div>
          )}
          {filtered.map((d) => {
            const selected = d.ko === value
            return (
              <button
                key={d.ko}
                type="button"
                onClick={() => {
                  onChange(d.ko)
                  setOpen(false)
                }}
                style={{
                  ...optionRowStyle(selected),
                  padding: '11px 14px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{d.ko}</span>
                  <span style={{ fontSize: 12, color: C.ink3 }}>{d.en}</span>
                </span>
                {selected && <CheckMark />}
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </InlineRow>
  )
}

// ── BreedField (품종 검색 — 종 필터) ─────────────────────────────────────

/**
 * 품종 선택 — 종(species)으로 필터된 검색형 바텀시트. 선택 시 한글·영문을 함께 넘긴다
 * (admin pdf-fill 이 breed_en 을 권위 소스로 읽으므로 둘 다 저장돼야 동기화 유지).
 * 종 미선택이면 비활성 — "종을 먼저 선택".
 */
export function BreedField({
  label,
  species,
  breedKo,
  breedEn,
  onChange,
  last,
}: {
  label: string
  species: string
  breedKo: string
  breedEn: string
  /** (한글, 영문) 동시 갱신. */
  onChange: (ko: string, en: string) => void
  last?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const disabled = !species

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BREEDS.filter((b) => {
      if (species && b.type !== species) return false
      if (!q) return true
      return b.ko.includes(q) || b.en.toLowerCase().includes(q) || b.alias?.some((a) => a.toLowerCase().includes(q))
    })
  }, [query, species])

  return (
    <InlineRow label={label} last={last}>
      <TriggerButton
        display={breedKo}
        empty={!breedKo}
        icon="chevron"
        onClick={() => {
          if (disabled) return
          setQuery('')
          setOpen(true)
        }}
        sub={breedKo && breedEn ? breedEn : undefined}
      />
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <input
          className="pm-field-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="품종 검색 · 말티즈 / Maltese"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--pm-surface)',
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: '11px 12px',
            fontFamily: 'inherit',
            fontSize: 15,
            color: C.ink,
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        />
        <div
          className="pm-noscroll"
          style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflow: 'auto' }}
        >
          {filtered.length === 0 && (
            <div style={{ fontSize: 13, color: C.ink3, padding: '12px 4px' }}>검색 결과 없음</div>
          )}
          {filtered.map((b) => {
            const selected = b.ko === breedKo
            return (
              <button
                key={`${b.ko}|${b.en}`}
                type="button"
                onClick={() => {
                  onChange(b.ko, b.en)
                  setOpen(false)
                }}
                style={{ ...optionRowStyle(selected), padding: '11px 14px' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>{b.ko}</span>
                  <span style={{ fontSize: 12, color: C.ink3 }}>{b.en}</span>
                </span>
                {selected && <CheckMark />}
              </button>
            )
          })}
        </div>
      </BottomSheet>
    </InlineRow>
  )
}

// ── ColorField (모색 — 칩 다중선택, 최대 3) ──────────────────────────────

/**
 * 모색 선택 — colors.json 의 6색을 칩으로 다중선택(최대 3). 신청폼과 동일.
 * 저장은 한글·영문 각각 쉼표 구분 문자열 (admin pdf-fill 이 color_en 을 읽으므로 둘 다 저장).
 * colorKo/colorEn 은 쉼표 구분 — colors.json 순서로 재구성해 일관 유지.
 */
export function ColorField({
  label,
  colorKo,
  onChange,
  last,
}: {
  label: string
  /** 쉼표 구분 한글 모색. */
  colorKo: string
  colorEn?: string
  /** (한글, 영문) 쉼표 구분으로 동시 갱신. */
  onChange: (ko: string, en: string) => void
  last?: boolean
}) {
  const selected = useMemo(
    () => new Set(colorKo.split(',').map((s) => s.trim()).filter(Boolean)),
    [colorKo],
  )

  function toggle(ko: string) {
    const next = new Set(selected)
    if (next.has(ko)) next.delete(ko)
    else if (next.size < 3) next.add(ko)
    else return
    // colors.json 순서로 재구성.
    const ordered = COLORS.filter((c) => next.has(c.ko))
    onChange(ordered.map((c) => c.ko).join(', '), ordered.map((c) => c.en).join(', '))
  }

  return (
    <InlineRow label={label} last={last} alignTop>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, paddingTop: 1, width: '100%' }}>
        {COLORS.map((c) => {
          const on = selected.has(c.ko)
          const blocked = !on && selected.size >= 3
          return (
            <button
              key={c.ko}
              type="button"
              onClick={() => toggle(c.ko)}
              aria-pressed={on}
              disabled={blocked}
              style={{
                height: 32,
                paddingLeft: 8,
                paddingRight: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: 999,
                border: `1px solid ${on ? C.accent : C.line}`,
                background: on ? C.accentSoft : 'transparent',
                color: on ? C.ink : C.ink2,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.4 : 1,
                transition: 'background .12s, color .12s, border-color .12s',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: COLOR_HEX[c.ko] ?? '#999',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)',
                }}
              />
              {c.ko}
            </button>
          )
        })}
      </div>
    </InlineRow>
  )
}

// ── AddressSearchField (주소 검색 입력) ───────────────────────────────────

/**
 * 주소 검색 4개 row 묶음 — 주소(도로명, 클릭→검색) / 상세주소(직접 입력) / 우편번호 /
 * 영문 주소. 도로명·우편번호·영문 주소는 Daum Postcode 검색 결과로만 채워지고
 * 사용자가 직접 입력할 수 없다. 상세주소(동·호수)는 검색 후 사용자가 추가 입력.
 *
 * Daum Postcode 스크립트는 첫 사용 시 head 에 동적 로드. apply 와 share-form 의
 * 패턴을 한 컴포넌트로 추출.
 */
export function AddressSearchField({
  addressKr,
  addressDetailKr,
  addressZipcode,
  addressEn,
  onSearchComplete,
  onChangeDetail,
  last,
}: {
  addressKr: string
  addressDetailKr: string
  addressZipcode: string
  addressEn: string
  /** 검색 완료 → 도로명·영문·우편번호 한 번에 채움. 옛 상세주소는 호출자가 비움. */
  onSearchComplete: (data: DaumPostcodeResult) => void
  onChangeDetail: (next: string) => void
  last?: boolean
}) {
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.daum?.Postcode) {
      setScriptLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!showModal) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  function openSearch() {
    if (!scriptLoaded || !window.daum?.Postcode) return
    setShowModal(true)
    setTimeout(() => {
      if (!modalRef.current) return
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete(data: DaumPostcodeResult) {
          onSearchComplete(data)
          setShowModal(false)
          setTimeout(() => detailRef.current?.focus(), 100)
        },
      }).embed(modalRef.current)
    }, 100)
  }

  const readOnlyValueStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: 500,
    color: C.ink,
    fontFamily: 'var(--pm-font-display)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }
  const placeholderStyle: React.CSSProperties = {
    ...readOnlyValueStyle,
    color: C.ink3,
    fontWeight: 400,
  }

  // 저장은 합본(`${도로명} ${상세}`) 으로 admin PDF 호환을 유지하되, 화면 표시는 도로명만
  // 보여준다 — '주소' row 와 '상세주소' row 가 같은 상세 텍스트로 중복되는 어색함 제거.
  const roadOnlyDisplay =
    addressDetailKr && addressKr.endsWith(addressDetailKr)
      ? addressKr.slice(0, -addressDetailKr.length).trim()
      : addressKr

  return (
    <>
      {/* 주소(도로명) — 클릭 시 검색 모달. 합본 저장에서 detail 제외해 표시. */}
      <InlineRow label="주소" alignTop>
        <button
          type="button"
          onClick={openSearch}
          disabled={!scriptLoaded}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 0,
            padding: 0,
            textAlign: 'left',
            cursor: scriptLoaded ? 'pointer' : 'wait',
            fontFamily: 'inherit',
          }}
        >
          <span style={roadOnlyDisplay ? readOnlyValueStyle : placeholderStyle}>
            {roadOnlyDisplay || (scriptLoaded ? '클릭하여 검색' : '주소 검색 준비 중…')}
          </span>
        </button>
      </InlineRow>

      {/* 상세주소 — 직접 입력 */}
      <InlineRow label="상세주소">
        <input
          ref={detailRef}
          className="pm-field-input"
          type="text"
          value={addressDetailKr}
          onChange={(e) => onChangeDetail(e.target.value)}
          placeholder="동·호수 등"
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            background: 'transparent',
            border: 0,
            outline: 'none',
            padding: 0,
            fontFamily: 'var(--pm-font-display)',
            fontSize: 15,
            fontWeight: 500,
            color: C.ink,
          }}
        />
      </InlineRow>

      {/* 우편번호 — readonly */}
      <InlineRow label="우편번호">
        <span style={addressZipcode ? readOnlyValueStyle : placeholderStyle}>
          {addressZipcode || '검색 후 자동 입력'}
        </span>
      </InlineRow>

      {/* 영문 주소 — readonly */}
      <InlineRow label="영문 주소" last={last} alignTop>
        <span style={addressEn ? readOnlyValueStyle : placeholderStyle}>
          {addressEn || '검색 후 자동 입력'}
        </span>
      </InlineRow>

      {/* Daum Postcode 임베드 모달 */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              height: '70vh',
              background: C.surface,
              borderRadius: 16,
              border: `.5px solid ${C.line}`,
              overflow: 'hidden',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
