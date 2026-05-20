'use client'

import type { VaccineLookups } from '@petmove/domain'

/**
 * 광견병 백신(추가 접종) — 3차 이후 접종 기록을 읽기 전용으로 표시.
 *
 * 입력값(rabies_dates[2], [3], ...) 을 받아 각각 카드로 렌더한다.
 * 약품 정보는 본병원/타병원 표시 규칙을 따른다:
 *  - 타병원 접종(other_hospital=true): 저장된 입력값을 그대로(빈 칸은 "—")
 *  - 본병원 접종(미체크): 카탈로그의 지정 약품(접종일 기준 lookupRabies)
 *
 * 입력은 펫무브워크에서만 가능 — 이 화면은 표시 전용.
 */
export interface RabiesExtraRecord {
  date: string
  valid_until?: string | null
  product?: string | null
  manufacturer?: string | null
  lot?: string | null
  expiry?: string | null
  other_hospital?: boolean
}

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
} as const

export function RabiesExtraList({
  records,
  vaccineLookups,
}: {
  /** 3차 이후의 접종 record. rabies_dates.slice(2) 결과. 비면 안내 표시. */
  records: RabiesExtraRecord[]
  /** 카탈로그(지정 약품) 추론용. null 이면 본병원 약품칸은 "—". */
  vaccineLookups: VaccineLookups | null
}) {
  if (records.length === 0) {
    return (
      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 16,
          padding: 16,
          fontSize: 14,
          color: C.ink3,
          textAlign: 'center',
        }}
      >
        추가 접종 기록이 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {records.map((rec, i) => (
        <RabiesExtraCard
          key={i}
          rec={rec}
          doseNumber={i + 3}
          vaccineLookups={vaccineLookups}
        />
      ))}
    </div>
  )
}

function RabiesExtraCard({
  rec,
  doseNumber,
  vaccineLookups,
}: {
  rec: RabiesExtraRecord
  doseNumber: number
  vaccineLookups: VaccineLookups | null
}) {
  const otherHospital = rec.other_hospital === true
  // 본병원이면 카탈로그 자동 추론, 타병원이면 입력값.
  const catalogHint =
    !otherHospital && vaccineLookups && rec.date ? vaccineLookups.lookupRabies(rec.date) : null

  // 약품 정보 표시값 — 본병원/타병원 규칙 적용. 빈 값은 "—".
  const empty = '—'
  const productDisplay = otherHospital
    ? rec.product?.trim() || empty
    : catalogHint?.vaccine || catalogHint?.product || empty
  const manufacturerDisplay = otherHospital
    ? rec.manufacturer?.trim() || empty
    : catalogHint?.manufacturer || empty
  const lotDisplay = otherHospital
    ? rec.lot?.trim() || empty
    : catalogHint?.batch || empty
  const expiryDisplay = otherHospital
    ? rec.expiry?.trim() || empty
    : catalogHint?.expiry || empty

  const validityDisplay = rec.valid_until && rec.valid_until.trim() ? rec.valid_until : '1년'
  const dateDisplay = rec.date?.trim() || empty

  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const headerStyle: React.CSSProperties = {
    padding: '14px 0 4px',
    fontSize: 15,
    fontWeight: 600,
    color: C.ink,
  }
  const rowStyle: React.CSSProperties = {
    padding: '12px 0',
    borderTop: `.5px solid ${C.line}`,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: C.ink3,
  }
  const valueStyle: React.CSSProperties = {
    marginTop: 4,
    fontSize: 15,
    color: C.ink,
  }
  const designatedTagStyle: React.CSSProperties = {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: 400,
    color: C.ink3,
  }

  const designated = !otherHospital
  const renderLabel = (label: string, withDesignatedTag: boolean) => (
    <div style={labelStyle}>
      {label}
      {withDesignatedTag && designated && <span style={designatedTagStyle}>병원 지정</span>}
    </div>
  )

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>광견병 {doseNumber}차</div>
      <div style={rowStyle}>
        {renderLabel('접종일', false)}
        <div style={valueStyle}>{dateDisplay}</div>
      </div>
      <div style={rowStyle}>
        {renderLabel('면역 유효기간', false)}
        <div style={valueStyle}>{validityDisplay}</div>
      </div>
      <div style={rowStyle}>
        {renderLabel('약품명', true)}
        <div style={valueStyle}>{productDisplay}</div>
      </div>
      <div style={rowStyle}>
        {renderLabel('제조사', true)}
        <div style={valueStyle}>{manufacturerDisplay}</div>
      </div>
      <div style={rowStyle}>
        {renderLabel('제조번호', true)}
        <div style={valueStyle}>{lotDisplay}</div>
      </div>
      <div style={rowStyle}>
        {renderLabel('제품 유효기간', true)}
        <div style={valueStyle}>{expiryDisplay}</div>
      </div>
    </div>
  )
}
