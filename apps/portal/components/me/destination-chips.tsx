'use client'

import { useMemo, useState, type ReactNode } from 'react'
import destsData from '@petmove/domain/data/destinations.json'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { SegmentField, type FieldOption } from '@/components/fields/info-fields'
import { C, SectionCard, monoCap } from './settings-shared'

const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]

/**
 * 동물 상세 페이지의 '여정' 섹션 — 한 case 의 multi-destination 카드 스택 UI (controlled).
 *
 *  - 카드 1장 = 목적지 1개. 카드 안에 '목적지' 라벨 행(목적지명) + 왕복·편도 토글.
 *  - 같은 곳으로 가는 형제(같은 보호자의 다른 동물)가 있는 목적지에는 '함께 준비' 토글도 노출.
 *  - 목적지명 행 우측 삭제(휴지통 아이콘 — 광견병/항체 카드와 통일) → 삭제 예정 표시(되돌리기 가능).
 *  - 카드 스택 아래 "+ 목적지 추가" dashed 버튼 → BottomSheet (검색 + 목록).
 *
 * 모든 변경은 **부모(useAnimalEditForm)의 로컬 상태만 갱신**한다 — 즉시 저장하지 않고
 * 동물 정보 '저장' 버튼에서 함께 커밋된다. 목적지 삭제·함께 준비 해제 confirm 도 저장 시점에 뜬다.
 */

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

export interface DestinationChipsProps {
  /** 렌더용 카드 — base 순서(삭제예정 포함) 뒤에 추가분. */
  cards: Array<{ dest: string; removing: boolean; added: boolean }>
  /** 추가 바텀시트 제외 기준 — 현재 선택된 목적지. */
  selected: string[]
  tripTypeByDest: Record<string, 'round' | 'one_way'>
  // '함께 준비'(co_progress) 토글은 펫무브앱에서 제거(펫무브워크 전용). 데이터·동기화는 유지하되
  // 보호자에게 노출하지 않음. 호환 위해 prop 은 남겨둠(부모가 계속 전달) — 후속 정리 대상.
  coProgress: boolean
  coProgressDests: Set<string>
  /** 저장 진행 중 — 입력 잠금. */
  disabled: boolean
  onStageTripType: (dest: string, value: 'round' | 'one_way') => void
  onStageCoProgress: (value: boolean) => void
  onStageRemove: (dest: string) => void
  onStageRestore: (dest: string) => void
  onStageAdd: (dest: string) => void
  /** 목적지 카드와 '목적지 추가' 버튼 사이에 끼워 넣는 슬롯 (지난 여정 카드). */
  afterCards?: ReactNode
}

export function DestinationChips({
  cards,
  selected,
  tripTypeByDest,
  disabled,
  onStageTripType,
  onStageRemove,
  onStageRestore,
  onStageAdd,
  afterCards,
}: DestinationChipsProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')

  // 추가 가능한 목적지 — 이미 선택된 토큰 제외.
  const available = useMemo(() => {
    const set = new Set(selected)
    return DESTS.filter((d) => !set.has(d.ko))
  }, [selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((d) => d.ko.includes(q) || d.en.toLowerCase().includes(q))
  }, [query, available])

  function openSheet() {
    setQuery('')
    setSheetOpen(true)
  }

  function handlePick(dest: string) {
    setSheetOpen(false)
    onStageAdd(dest)
  }

  return (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>여정</div>

      {cards.map(({ dest, removing }, i) => {
        const trip = tripTypeByDest[dest] === 'one_way' ? 'one_way' : 'round'
        return (
          <SectionCard key={dest} marginTop={i === 0 ? 0 : 10}>
            {/* 목적지명 — '목적지' 라벨 행 + 우측 삭제/되돌리기. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 0',
                borderBottom: removing ? 'none' : `.5px solid ${C.line}`,
                minHeight: 46,
              }}
            >
              <span style={{ fontSize: 13, color: C.ink2, flexShrink: 0, width: 88 }}>목적지</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  fontWeight: 500,
                  color: removing ? C.ink3 : C.ink,
                  fontFamily: 'var(--pm-font-display)',
                  textDecoration: removing ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {dest}
              </span>
              {removing ? (
                <>
                  <span style={{ flexShrink: 0, fontSize: 12, color: C.ink3 }}>삭제 예정</span>
                  <button
                    type="button"
                    onClick={() => onStageRestore(dest)}
                    disabled={disabled}
                    style={{
                      flexShrink: 0,
                      background: 'transparent',
                      border: 'none',
                      padding: '4px 0 4px 10px',
                      color: C.accent,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  >
                    되돌리기
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onStageRemove(dest)}
                  disabled={disabled}
                  aria-label={`${dest} 삭제`}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    border: 0,
                    background: 'transparent',
                    color: C.ink3,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {/* 휴지통 — 광견병/항체 추가 카드(rabies-extra·titer-extra)와 동일 아이콘으로 통일. */}
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
              )}
            </div>
            {/* 삭제 예정이면 입력 행은 감춘다 — 되돌리면 다시 보임. */}
            {!removing && (
              <>
                <SegmentField
                  label="왕복·편도"
                  value={trip}
                  onChange={(v) => onStageTripType(dest, v === 'one_way' ? 'one_way' : 'round')}
                  options={TRIP_OPTIONS}
                  last
                />
                {/* '함께 준비'(co_progress) 토글 제거 — 펫무브워크 전용. */}
              </>
            )}
          </SectionCard>
        )
      })}

      {/* 지난 여정 카드 — 목적지 카드 아래, '목적지 추가' 버튼 위. */}
      {afterCards}

      <button
        type="button"
        onClick={openSheet}
        disabled={disabled}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: `1px dashed ${C.line}`,
          background: 'transparent',
          color: C.ink3,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        + 목적지 추가
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="목적지 추가">
        <input
          className="pm-field-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="국가 검색"
          style={{
            width: '100%',
            padding: '12px 14px',
            margin: '4px 0 10px',
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 15,
            color: C.ink,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', fontSize: 13, color: C.ink3, textAlign: 'center' }}>
              일치하는 목적지가 없습니다.
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.ko}
                type="button"
                onClick={() => handlePick(d.ko)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '13px 0',
                  borderBottom: `.5px solid ${C.line}`,
                  background: 'transparent',
                  border: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 15, color: C.ink }}>{d.ko}</span>
                <span style={{ fontSize: 13, color: C.ink3 }}>{d.en}</span>
              </button>
            ))
          )}
        </div>
      </BottomSheet>
    </>
  )
}
