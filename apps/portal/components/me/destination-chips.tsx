'use client'

import { useMemo, useState, useTransition } from 'react'
import destsData from '@petmove/domain/data/destinations.json'
import { useConfirm } from '@petmove/ui'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { SegmentField, type FieldOption } from '@/components/fields/info-fields'
import { C, SectionCard, monoCap } from './settings-shared'
import {
  addCaseDestination,
  removeCaseDestination,
  setCaseCoProgress,
  setCaseDestinationTripType,
} from '@/lib/actions/destinations'
import { useCases } from '@/components/portal-shell/case-data-provider'

const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]
const CO_PROGRESS_OPTIONS: readonly FieldOption[] = [
  { value: 'on', label: '예' },
  { value: 'off', label: '아니오' },
]

/**
 * 동물 상세 페이지의 '여정' 섹션 — 한 case 의 multi-destination 카드 스택 UI.
 *
 *  - 카드 1장 = 목적지 1개. 카드 안에 '목적지' 라벨 행(목적지명) + 왕복·편도 토글.
 *  - 같은 곳으로 가는 형제(같은 보호자의 다른 동물)가 있는 목적지에는 '함께 준비' 토글도 노출.
 *  - 목적지명 행 우측 '삭제' 텍스트 버튼 → ConfirmProvider → removeCaseDestination.
 *  - 카드 스택 아래 "+ 목적지 추가" dashed 버튼 → BottomSheet (검색 + 목록).
 *
 * 목적지 추가/삭제·왕복편도·함께 준비 토글은 모두 즉시 server action 으로 저장
 * (useCaseEditForm 의 dirty 흐름과 무관). 동물 정보 폼 저장과 별개로 동작.
 */

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

export function DestinationChips({
  caseId,
  destinations,
  tripTypeByDest,
  coProgress,
  coProgressDests,
}: {
  caseId: string
  destinations: string[]
  tripTypeByDest: Record<string, 'round' | 'one_way'>
  /** '함께 준비'(co_progress) 현재 값 — 동물 1마리에 1개(케이스 단위). */
  coProgress: boolean
  /** '함께 준비' 토글을 노출할 목적지 집합 — 같은 곳 가는 형제가 있는 목적지만. */
  coProgressDests: Set<string>
}) {
  const confirm = useConfirm()
  const { refreshCases } = useCases()
  const [pending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')

  // 추가 가능한 목적지 — 이미 선택된 토큰 제외.
  const available = useMemo(() => {
    const set = new Set(destinations)
    return DESTS.filter((d) => !set.has(d.ko))
  }, [destinations])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (d) => d.ko.includes(q) || d.en.toLowerCase().includes(q),
    )
  }, [query, available])

  function openSheet() {
    setQuery('')
    setSheetOpen(true)
  }

  function handleAdd(dest: string) {
    setSheetOpen(false)
    startTransition(async () => {
      const r = await addCaseDestination(caseId, dest)
      if (!r.ok) {
        alert(`오류: ${r.error}`)
        return
      }
      await refreshCases()
    })
  }

  async function handleRemove(dest: string) {
    const ok = await confirm({
      message: `목적지 '${dest}' 를 삭제하시겠습니까?`,
      description: '해당 목적지에 입력된 절차·일정 정보가 함께 삭제됩니다.',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const r = await removeCaseDestination(caseId, dest)
      if (!r.ok) {
        alert(`오류: ${r.error}`)
        return
      }
      await refreshCases()
    })
  }

  async function handleTripTypeChange(dest: string, value: string) {
    const nextTT = value === 'one_way' ? 'one_way' : 'round'
    if ((tripTypeByDest[dest] ?? 'round') === nextTT) return

    // 이 목적지가 지금 함께 준비로 묶여 있으면(같은 곳·같은 트립 형제 + co_progress on),
    // 왕복/편도를 바꾸면 트립이 어긋나 묶임이 풀린다. 바꾸기 전에 확인하고, 확인하면 해제.
    const wasLinked = coProgress && coProgressDests.has(dest)
    if (wasLinked) {
      const linked = [...coProgressDests]
      const ok = await confirm({
        message: '함께 준비가 해제돼요',
        description:
          linked.length > 1
            ? `왕복·편도가 달라지면 같은 여정이 아니게 돼서, 이 동물의 함께 준비(${linked.join('·')})가 모두 해제됩니다. 계속할까요?`
            : `왕복·편도가 달라지면 같은 여정이 아니게 돼서, '${dest}'의 함께 준비가 해제됩니다. 계속할까요?`,
        okLabel: '바꾸고 해제',
      })
      if (!ok) return
    }

    startTransition(async () => {
      // 순서 중요 — 묶여 있던 목적지면 trip 변경 '전에' 먼저 해제(co_progress=false).
      // 그래야 이어지는 trip 변경이 엔진(동기화 트리거)을 타고 형제로 전파되지 않는다
      // (트리거는 co_progress=false 인 원본은 동기화하지 않음). 반대 순서면 바뀐 trip 이
      // 형제에 새어 들어가 형제의 왕복/편도까지 바뀐다. 동물당 스위치 1개라 공유 목적지
      // 2개+ 면 통째 해제(설계 확정). 다시 켜려면 토글로.
      if (wasLinked) {
        const r0 = await setCaseCoProgress(caseId, false)
        if (!r0.ok) {
          alert(`오류: ${r0.error}`)
          return
        }
      }
      const r = await setCaseDestinationTripType(caseId, dest, nextTT)
      if (!r.ok) {
        alert(`오류: ${r.error}`)
        return
      }
      await refreshCases()
    })
  }

  function handleCoProgressChange(value: string) {
    const next = value === 'on'
    if (coProgress === next) return
    startTransition(async () => {
      const r = await setCaseCoProgress(caseId, next)
      if (!r.ok) {
        alert(`오류: ${r.error}`)
        return
      }
      await refreshCases()
    })
  }

  return (
    <>
      <div style={{ ...monoCap, marginTop: 24, marginBottom: 10, padding: '0 4px' }}>
        여정
      </div>

      {destinations.map((dest, i) => {
        const tt = tripTypeByDest[dest] ?? 'round'
        const showCoProgress = coProgressDests.has(dest)
        return (
          <SectionCard key={dest} marginTop={i === 0 ? 0 : 10}>
            {/* 목적지명 — '목적지' 라벨 행 (다른 필드 행과 같은 톤) + 우측 삭제. 화살표 없음. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 0',
                borderBottom: `.5px solid ${C.line}`,
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
                  color: C.ink,
                  fontFamily: 'var(--pm-font-display)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {dest}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(dest)}
                disabled={pending}
                aria-label={`${dest} 삭제`}
                style={{
                  flexShrink: 0,
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 0',
                  color: C.ink3,
                  cursor: pending ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                }}
              >
                삭제
              </button>
            </div>
            <SegmentField
              label="왕복·편도"
              value={tt}
              onChange={(v) => handleTripTypeChange(dest, v)}
              options={TRIP_OPTIONS}
              last={!showCoProgress}
            />
            {/* 함께 준비 — 같은 목적지로 가는 형제(다른 동물)가 있을 때만. 값은 동물 1마리에 1개. */}
            {showCoProgress && (
              <SegmentField
                label="함께 준비"
                value={coProgress ? 'on' : 'off'}
                onChange={handleCoProgressChange}
                options={CO_PROGRESS_OPTIONS}
                sub="한 마리에 입력한 일정·절차를 다른 동물에도 같이 반영해요"
                last
              />
            )}
          </SectionCard>
        )
      })}

      <button
        type="button"
        onClick={openSheet}
        disabled={pending}
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
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        + 목적지 추가
      </button>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="목적지 추가"
      >
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
                onClick={() => handleAdd(d.ko)}
                disabled={pending}
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
                  opacity: pending ? 0.5 : 1,
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
