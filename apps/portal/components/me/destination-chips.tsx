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
  setCaseDestinationTripType,
} from '@/lib/actions/destinations'
import { useCases } from '@/components/portal-shell/case-data-provider'

const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]

/**
 * 동물 상세 페이지의 '여정' 섹션 — 한 case 의 multi-destination 카드 스택 UI.
 *
 *  - 카드 1장 = 목적지 1개. 카드 안에 목적지명(헤더) + 왕복·편도 토글.
 *  - 카드 헤더 우측 '삭제' 텍스트 버튼 → ConfirmProvider → removeCaseDestination.
 *  - 카드 스택 아래 "+ 목적지 추가" dashed 버튼 → BottomSheet (검색 + 목록).
 *
 * 목적지 추가/삭제/왕복편도 토글은 즉시 server action 으로 저장 (useCaseEditForm
 * 의 dirty 흐름과 무관). 동물 정보 폼 저장과 별개로 동작.
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
}: {
  caseId: string
  destinations: string[]
  tripTypeByDest: Record<string, 'round' | 'one_way'>
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

  function handleTripTypeChange(dest: string, value: string) {
    const nextTT = value === 'one_way' ? 'one_way' : 'round'
    if ((tripTypeByDest[dest] ?? 'round') === nextTT) return
    startTransition(async () => {
      const r = await setCaseDestinationTripType(caseId, dest, nextTT)
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
        const arrow = tt === 'round' ? '⇄' : '→'
        return (
          <SectionCard key={dest} marginTop={i === 0 ? 0 : 10}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 0 12px',
                borderBottom: `.5px solid ${C.line}`,
              }}
            >
              <span style={{ fontSize: 16, color: C.ink, fontWeight: 500 }}>
                {dest} <span style={{ color: C.ink3, fontWeight: 400 }}>{arrow}</span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(dest)}
                disabled={pending}
                aria-label={`${dest} 삭제`}
                style={{
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
              last
            />
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
