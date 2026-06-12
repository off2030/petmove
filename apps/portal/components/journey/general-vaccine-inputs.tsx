'use client'

import { DateTextField } from '@petmove/ui'

/**
 * 종합백신 step 입력 — 가변 길이 배열 + 추가/삭제 (TiterExtraInputs 와 동일 모델).
 *
 * 저장 형식은 case.data.general_vaccine_dates[index] = { date, valid_until } — 펫무브워크
 * 백신 섹션과 동일 키. 동물 단위 사실이라 목적지 스코핑 없음.
 * 카드 제목은 종별 백신명(개 DHPPL / 고양이 FVRCP)을 부모가 내려준다.
 */

export interface GeneralVaccineEntry {
  date: string
  valid_until: string
}

const C = {
  surface: 'var(--pm-surface)',
  line: 'var(--pm-line)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
} as const

export function GeneralVaccineInputs({
  entries,
  vaccineLabel,
  onChange,
  onRemove,
  onAdd,
  dateLabel = '접종일',
  showValidUntil = true,
  addLabel = '+ 접종 기록 추가',
}: {
  entries: GeneralVaccineEntry[]
  /** 카드 헤더 라벨 — 종별 백신명 (예: '종합백신(DHPPL)') 또는 처치명 ('외부구충'). */
  vaccineLabel: string
  onChange: (index: number, key: keyof GeneralVaccineEntry, next: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
  /** 날짜 필드 라벨 — 백신 '접종일', 구충 '처치일'/'투약일'. */
  dateLabel?: string
  /** 면역 유효기간 필드 노출 — 구충 처치는 유효기간 개념이 없어 숨김. */
  showValidUntil?: boolean
  addLabel?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((entry, i) => (
        <EntryCard
          key={i}
          entry={entry}
          title={`${vaccineLabel} ${i + 1}차`}
          dateLabel={dateLabel}
          showValidUntil={showValidUntil}
          onChange={(key, next) => onChange(i, key, next)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginTop: 4,
          padding: '12px 0',
          borderRadius: 14,
          border: `1px dashed ${C.line}`,
          background: 'transparent',
          color: C.ink2,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {addLabel}
      </button>
    </div>
  )
}

function EntryCard({
  entry,
  title,
  dateLabel,
  showValidUntil,
  onChange,
  onRemove,
}: {
  entry: GeneralVaccineEntry
  title: string
  dateLabel: string
  showValidUntil: boolean
  onChange: (key: keyof GeneralVaccineEntry, next: string) => void
  onRemove: () => void
}) {
  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          padding: '12px 0 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="삭제"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 0,
            background: 'transparent',
            color: C.ink3,
            cursor: 'pointer',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>{dateLabel}</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={entry.date}
            onChange={(v) => onChange('date', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>

      {showValidUntil && (
        <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
          <div style={labelStyle}>면역 유효기간</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
            백신 증명서·수첩에 적힌 다음 접종 예정일
          </div>
          <div style={{ marginTop: 8 }}>
            <DateTextField
              value={entry.valid_until}
              onChange={(v) => onChange('valid_until', v)}
              placeholder="YYYY-MM-DD"
              block
            />
          </div>
        </div>
      )}
    </div>
  )
}
