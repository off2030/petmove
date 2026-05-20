'use client'

/**
 * 광견병 항체가 검사(추가) — 2회차 이후 검사 기록을 읽기 전용으로 표시.
 *
 * 입력값(rabies_titer_records[1], [2], ...) 을 받아 각각 카드로 렌더한다.
 * 입력은 펫무브워크에서만 가능 — 이 화면은 표시 전용.
 */
export interface TiterExtraRecord {
  date: string
  lab?: string | null
  value?: string | null
  received_date?: string | null
}

const C = {
  surface: '#FBF7F1',
  line: 'rgba(42,38,32,.10)',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
} as const

/** 펫무브워크 LAB_INFO 코드 → 보호자용 표시명. 목록에 없으면 코드/입력값 그대로. */
const LAB_LABEL: Record<string, string> = {
  apqa_seoul: '농림축산검역본부 (APQA)',
  ksvdl_r: 'Kansas State Rabies Laboratory',
}

export function TiterExtraList({
  records,
}: {
  /** 2회차 이후의 검사 record. rabies_titer_records.slice(1) 결과. 비면 안내 표시. */
  records: TiterExtraRecord[]
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
        추가 항체가 검사 기록이 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {records.map((rec, i) => (
        <TiterExtraCard key={i} rec={rec} roundNumber={i + 2} />
      ))}
    </div>
  )
}

function TiterExtraCard({ rec, roundNumber }: { rec: TiterExtraRecord; roundNumber: number }) {
  const empty = '—'
  const dateDisplay = rec.date?.trim() || empty
  const labRaw = rec.lab?.trim() || ''
  const labDisplay = labRaw ? (LAB_LABEL[labRaw] ?? labRaw) : empty
  const valueRaw = rec.value?.trim() || ''
  const valueDisplay = valueRaw ? `${valueRaw} IU/mL` : empty
  const receivedDisplay = rec.received_date?.trim() || empty

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

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>항체검사 {roundNumber}회차</div>
      <div style={rowStyle}>
        <div style={labelStyle}>채혈일</div>
        <div style={valueStyle}>{dateDisplay}</div>
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>검사기관</div>
        <div style={valueStyle}>{labDisplay}</div>
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>검사결과</div>
        <div style={valueStyle}>{valueDisplay}</div>
      </div>
      {rec.received_date && rec.received_date.trim() && (
        <div style={rowStyle}>
          <div style={labelStyle}>검체 수령일</div>
          <div style={valueStyle}>{receivedDisplay}</div>
        </div>
      )}
    </div>
  )
}
