'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'

export interface JpExportForm {
  applicationDate: string
  date: string
  time: string
}

/** 예약시간 입력 마스킹 — 숫자만 추려 H:mm / HH:mm 으로 (예: '1200'→'12:00', '930'→'9:30'). */
function normalizeTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  // 시 앞자리가 3~9 면 한 자리 시('9:30'), 그 외엔 두 자리('12:00').
  const hourLen = d[0] >= '3' && d[0] <= '9' ? 1 : 2
  return d.length <= hourLen ? d : `${d.slice(0, hourLen)}:${d.slice(hourLen)}`
}

/**
 * 일본 수출검역 step 입력 필드 — 예약일·예약시간. controlled — 부모(step-detail-view)가
 * state·save 를 보유. 저장 형식은 case.data.jp_export_quarantine_date (YYYY-MM-DD) /
 * jp_export_quarantine_time (HH:mm).
 */
export function JpExportQuarantineInputs({
  form,
  onChange,
}: {
  form: JpExportForm
  onChange: (key: keyof JpExportForm, next: string) => void
}) {

  return (
    <div
      style={{
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 16,
        padding: '4px 16px',
      }}
    >
      <div style={{ padding: '14px 0', borderBottom: `.5px solid ${C.line}` }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>신청일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          NACCS로 출국 검역을 신청한 날짜
        </div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={form.applicationDate}
            onChange={(v) => onChange('applicationDate', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>
      <div style={{ padding: '14px 0', borderBottom: `.5px solid ${C.line}` }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>예약일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          일본 동물검역소 예약 날짜
        </div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={form.date}
            onChange={(v) => onChange('date', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>
      <div style={{ padding: '14px 0' }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>예약 시간</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
          일본 동물검역소 예약 시간
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={form.time}
            onChange={(e) => onChange('time', normalizeTime(e.target.value))}
            placeholder="14:30"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--pm-surface)',
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: '8px 10px',
              fontFamily: 'inherit',
              fontSize: 15,
              color: C.ink,
              outline: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
