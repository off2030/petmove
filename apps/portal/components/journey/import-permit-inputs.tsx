'use client'


import { C } from '@/lib/palette'
import { DateTextField } from '@petmove/ui'

/**
 * 수입 허가(import-permit) step 입력 — 신청일 + 허가 번호. 태국·호주 등 허가 필요국 공용.
 * controlled — 부모(step-detail-view)가 state·save 를 보유.
 * 저장 형식은 case.data.import_permit_application_date / permit_no (둘 다 by_dest 스코핑).
 */

export interface ImportPermitForm {
  applicationDate: string
  permitNo: string
  /** 부가 예약일(계류장 예약 날짜 등) — 정보성. 예약일 필드가 없는 카드는 빈 문자열. */
  reservationDate: string
}

export function ImportPermitInputs({
  form,
  onChange,
  showPermitNo = true,
  applicationHelp = '동물검역소에 수입 허가를 신청한 날짜',
  reservation,
}: {
  form: ImportPermitForm
  onChange: (key: keyof ImportPermitForm, next: string) => void
  /** 허가 번호 입력 노출 — step.inputs 에 permit_no 가 있을 때만(태국은 신청일만). */
  showPermitNo?: boolean
  /** 신청일 아래 설명 — 카드별로 다르다(수입 허가 / 계류장 예약 / 강아지 라이센스). */
  applicationHelp?: string
  /** 신청일 아래에 부가 예약일 입력을 노출(계류장 예약 날짜 등, 정보성). 일본 수출검역 예약일 패턴. */
  reservation?: { label: string; help: string }
}) {

  const fieldBox: React.CSSProperties = {
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div
      style={{
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 16,
        padding: '4px 16px',
      }}
    >
      <div style={{ padding: '14px 0' }}>
        <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>신청일</div>
        <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{applicationHelp}</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={form.applicationDate}
            onChange={(v) => onChange('applicationDate', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>
      {reservation && (
        <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
          <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{reservation.label}</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{reservation.help}</div>
          <div style={{ marginTop: 8 }}>
            <DateTextField
              value={form.reservationDate}
              onChange={(v) => onChange('reservationDate', v)}
              placeholder="YYYY-MM-DD"
              block
            />
          </div>
        </div>
      )}
      {showPermitNo && (
        <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
          <div style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>허가 번호</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
            수입 허가증에 기재된 번호 — 허가증을 받은 뒤 입력하세요
          </div>
          <input
            type="text"
            value={form.permitNo}
            onChange={(e) => onChange('permitNo', e.target.value)}
            placeholder="예: 0007/2569"
            style={{ ...fieldBox, marginTop: 8, width: '100%' }}
          />
        </div>
      )}
    </div>
  )
}
