'use client'

import { useState } from 'react'
import type { CaseRow, PastJourneySummary } from '@petmove/domain'
import { formatDepartureYmd } from '@petmove/domain'
import { C } from './settings-shared'

/**
 * 지난 여정 — 내 정보 > 반려동물 > '여정' 섹션, 진행 중 목적지 카드 아래에 붙는
 * 작은 접이식 카드. 평소엔 'History · N' 한 줄, 펼치면 완료 여정 목록(도장 카드).
 * case.data.past_journeys 요약(완료분)만 노출. 데이터 없으면 null — 자동 숨김.
 * (design journey-lifecycle §5. 별도 '지난 여정' 카테고리 헤더는 두지 않는다.)
 */

function readPastJourneys(caseRow: CaseRow): PastJourneySummary[] {
  const raw = (caseRow.data as Record<string, unknown> | null | undefined)?.past_journeys
  if (!Array.isArray(raw)) return []
  // 고객 화면엔 '잘 다녀온'(done) 여정만 도장으로 남긴다. 취소(cancelled)는 숨김 —
  // 데이터엔 그대로 남아 운영자(펫무브워크 case-detail)는 완료·취소 모두 본다.
  // 최신 완료순(completedDate 내림차순). 문자열 ISO 사전식 비교.
  return (raw as PastJourneySummary[])
    .filter((j) => j.outcome === 'done')
    .sort((a, b) => {
      const x = a.completedDate ?? ''
      const y = b.completedDate ?? ''
      return x > y ? -1 : x < y ? 1 : 0
    })
}

/** 출입국 날짜 표식 — 출국일 ~ 귀국일. 귀국일 없으면(편도/미기록) 출국일만. */
function dateRangeLabel(j: PastJourneySummary): string {
  const dep = j.departureDate ? formatDepartureYmd(j.departureDate) : null
  const ret = j.returnDate ? formatDepartureYmd(j.returnDate) : null
  if (dep && ret) return `${dep} ~ ${ret}`
  if (dep) return `${dep} 출국`
  return '날짜 미정'
}

/** 도장 — 완료는 sage 체크. (지난 여정엔 done 만 노출돼 항상 체크.) */
function MiniStamp() {
  const ink = C.sage
  return (
    <div style={{ width: 38, height: 38, position: 'relative', transform: 'rotate(-6deg)', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${ink}`, opacity: 0.45 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, opacity: 0.72 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
    </div>
  )
}

export function PastJourneysSection({ caseRow }: { caseRow: CaseRow }) {
  const list = readPastJourneys(caseRow)
  const [open, setOpen] = useState(false)
  if (list.length === 0) return null

  return (
    <div
      style={{
        marginTop: 10,
        background: C.surface,
        border: `.5px solid ${C.line}`,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      {/* 접힘 머리 — 'History · N' + 펼침 화살표. 누르면 아래 목록 토글. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '13px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, fontSize: 13.5, color: C.ink2, fontWeight: 500 }}>
          지난 여정
          <span style={{ color: C.ink3, fontWeight: 400, marginLeft: 7, fontVariantNumeric: 'tabular-nums' }}>{list.length}</span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={C.ink3}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 펼침 본문 — 완료 여정 도장 목록. 머리와 경계선으로 구분. */}
      {open && (
        <div style={{ padding: '0 16px', borderTop: `.5px solid ${C.line}` }}>
          {list.map((j, i) => {
            const arrow = j.tripType === 'round' ? '⇄' : '→'
            return (
              <div
                key={`${j.destination}-${j.completedDate ?? ''}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '12px 0',
                  borderBottom: i === list.length - 1 ? 'none' : `.5px solid ${C.line}`,
                }}
              >
                <MiniStamp />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: C.ink2, fontWeight: 500 }}>
                    한국 <span style={{ color: C.ink3 }}>{arrow}</span> {j.destination}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {dateRangeLabel(j)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
