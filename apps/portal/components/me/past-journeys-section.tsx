'use client'

import type { CaseRow, PastJourneySummary } from '@petmove/domain'
import { formatDepartureYmd } from '@petmove/domain'
import { C } from './settings-shared'

/**
 * 지난 여정 카드 — 내 정보 > 반려동물 > 여정, 진행 중 목적지 카드 아래.
 * case.data.past_journeys 요약(완료/취소)을 최신순 도장 카드로. (design journey-lifecycle §5)
 * 데이터 없으면 null — 자동 숨김. 소감 버튼은 여기 없음(완료 카드에만).
 */

function readPastJourneys(caseRow: CaseRow): PastJourneySummary[] {
  const raw = (caseRow.data as Record<string, unknown> | null | undefined)?.past_journeys
  if (!Array.isArray(raw)) return []
  // 최신 완료순(completedDate 내림차순). 문자열 ISO 사전식 비교.
  return [...(raw as PastJourneySummary[])].sort((a, b) => {
    const x = a.completedDate ?? ''
    const y = b.completedDate ?? ''
    return x > y ? -1 : x < y ? 1 : 0
  })
}

/** 도장 — 완료는 sage 체크, 취소는 회색 X. */
function MiniStamp({ done }: { done: boolean }) {
  const ink = done ? C.sage : C.ink3
  return (
    <div style={{ width: 44, height: 44, position: 'relative', transform: 'rotate(-6deg)', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${ink}`, opacity: done ? 0.45 : 0.3 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, opacity: 0.72 }}>
        {done ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        )}
      </div>
    </div>
  )
}

export function PastJourneysSection({ caseRow }: { caseRow: CaseRow }) {
  const list = readPastJourneys(caseRow)
  if (list.length === 0) return null

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: C.ink3,
          fontWeight: 500,
          padding: '0 4px',
          marginBottom: 10,
        }}
      >
        지난 여정
      </div>
      <div style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 18, padding: '2px 16px' }}>
        {list.map((j, i) => {
          const arrow = j.tripType === 'round' ? '⇄' : '→'
          const done = j.outcome === 'done'
          return (
            <div
              key={`${j.destination}-${j.completedDate ?? ''}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 0',
                borderBottom: i === list.length - 1 ? 'none' : `.5px solid ${C.line}`,
              }}
            >
              <MiniStamp done={done} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, color: done ? C.ink2 : C.ink3, fontWeight: 500 }}>
                  한국 <span style={{ color: C.ink3 }}>{arrow}</span> {j.destination}
                  {!done && <span style={{ fontSize: 11, color: C.ink3, marginLeft: 6 }}>· 취소</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {j.departureDate ? `${formatDepartureYmd(j.departureDate)} 출국` : '출국일 미정'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
