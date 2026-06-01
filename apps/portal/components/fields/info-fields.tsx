'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import destsData from '@petmove/domain/data/destinations.json'
import { BottomSheet } from './bottom-sheet'
import { PortalCalendar, ymdLocal } from './portal-calendar'

/**
 * 정보 탭의 편집 가능한 필드 셀. Stone 팔레트 — info-view 와 동일 톤.
 *
 * 모든 셀은 controlled — 부모(InfoView)가 폼 state·dirty·save 를 보유.
 *  - TextField        : 인라인/스택 텍스트 입력 (전화·칩 마스크 지원)
 *  - DateField        : 바텀시트 달력 (Stone 톤 PortalCalendar)
 *  - OptionField      : 바텀시트 선택 목록 (종·성별)
 *  - SegmentField     : 인라인 2~3 분절 선택 (여행 유형)
 *  - DestinationField : 검색형 바텀시트 (여행지)
 */

const C = {
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  line: 'var(--pm-line)',
  accent: 'var(--pm-accent)',
  accentSoft: 'rgba(184,153,104,.14)',
  soft: 'var(--pm-accent-soft)',
} as const

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

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

// ── Row chrome ───────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: C.ink2,
  flexShrink: 0,
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
        justifyContent: 'space-between',
        alignItems: alignTop ? 'flex-start' : 'center',
        padding: '11px 0',
        borderBottom: last ? 'none' : `.5px solid ${C.line}`,
        gap: 12,
        minHeight: 46,
      }}
    >
      <span style={{ ...labelStyle, ...(alignTop ? { paddingTop: 2 } : null) }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  )
}

/** 인라인 행 안에서 다른 값들과 같은 글꼴·우측정렬을 유지하되 길면 줄바꿈되는 입력(주소). */
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
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
      rows={1}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: 'right',
        background: 'transparent',
        border: 0,
        outline: 'none',
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        fontFamily: 'var(--pm-font-display)',
        fontSize: 17,
        fontWeight: 500,
        lineHeight: 1.4,
        color: C.ink,
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
        alignItems: 'flex-end',
        gap: 2,
        maxWidth: '100%',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
        <span
          style={{
            fontSize: 17,
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
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  last?: boolean
  mask?: 'phone' | 'microchip' | 'weight' | 'time'
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email'
  /** true 면 라벨 위 + 입력 아래 (긴 텍스트: 주소). */
  stacked?: boolean
  /** 인라인 입력 우측 단위 표기 (예: kg). */
  suffix?: string
}) {
  const display =
    mask === 'phone' ? formatPhone(value) : mask === 'microchip' ? formatChip(value) : value

  function handle(raw: string) {
    if (mask === 'phone') onChange(raw.replace(/\D/g, '').slice(0, 11))
    else if (mask === 'microchip') onChange(raw.replace(/\D/g, '').slice(0, 15))
    else if (mask === 'weight') {
      // 숫자 + 소수점 1개만.
      const cleaned = raw.replace(/[^\d.]/g, '')
      const parts = cleaned.split('.')
      onChange(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned)
    } else if (mask === 'time') onChange(normalizeTime(raw))
    else onChange(raw)
  }

  if (stacked) {
    return (
      <InlineRow label={label} last={last} alignTop>
        <AutoGrowTextarea value={value} onChange={handle} placeholder={placeholder} />
      </InlineRow>
    )
  }

  return (
    <InlineRow label={label} last={last}>
      <input
        className="pm-field-input"
        type="text"
        inputMode={inputMode}
        value={display}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          background: 'transparent',
          border: 0,
          outline: 'none',
          padding: 0,
          fontFamily: 'var(--pm-font-display)',
          fontSize: 17,
          fontWeight: 500,
          color: C.ink,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      {suffix && (
        <span style={{ flexShrink: 0, marginLeft: 5, fontSize: 14, color: C.ink2 }}>{suffix}</span>
      )}
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
    background: selected ? C.accentSoft : '#fff',
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
}: {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly FieldOption[]
  last?: boolean
}) {
  return (
    <InlineRow label={label} last={last}>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={selected}
              style={{
                padding: '7px 16px',
                borderRadius: 999,
                border: `1px solid ${selected ? C.ink : C.line}`,
                background: selected ? C.ink : 'transparent',
                color: selected ? C.surface : C.ink2,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background .12s, color .12s, border-color .12s',
              }}
            >
              {o.label}
            </button>
          )
        })}
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
            background: '#fff',
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
