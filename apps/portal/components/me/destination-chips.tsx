'use client'

import { useMemo, useState, useTransition, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import destsData from '@petmove/domain/data/destinations.json'
import { useConfirm } from '@petmove/ui'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { SegmentField, type FieldOption } from '@/components/fields/info-fields'
import { C, SectionCard } from './settings-shared'
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
 * 동물 상세 페이지의 '여정' 섹션 — 한 case 의 multi-destination 칩 UI.
 *
 *  - 칩: 목적지 토큰. 활성 칩(URL ?dest=<token>) 은 검정 배경. 클릭 시 활성 전환.
 *  - 칩 옆 × 버튼: 제거(ConfirmProvider 모달) → removeCaseDestination.
 *  - "+ 목적지 추가" 칩: 바텀시트 → 검색 + 목록 → addCaseDestination.
 *
 * URL ?dest=<token> 이 진입점: 새로고침·뒤로가기에도 같은 목적지 화면 유지.
 * '?dest' 미 지정이면 첫 토큰을 활성으로 간주.
 *
 * trip_type 토글(왕복·편도)은 칩에 표시만 (⇄ 또는 →). 변경은 TravelFormSections
 * 안의 SegmentField 에서 (이 단계에선 표시만, 토글 액션은 다음 단계).
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const confirm = useConfirm()
  const { refreshCases } = useCases()
  const [pending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')

  const activeDest = searchParams.get('dest') ?? destinations[0] ?? null

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

  function setActive(dest: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dest', dest)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

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
      setActive(dest)
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
      // 활성 목적지를 삭제했으면 첫 남은 토큰으로 active 이동, 없으면 ?dest 제거.
      if (dest === activeDest) {
        const remaining = destinations.filter((t) => t !== dest)
        const params = new URLSearchParams(searchParams.toString())
        if (remaining[0]) params.set('dest', remaining[0])
        else params.delete('dest')
        const qs = params.toString()
        router.replace(qs ? `?${qs}` : '?', { scroll: false })
      }
    })
  }

  return (
    <SectionCard label="여정" marginTop={16}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '14px 0',
        }}
      >
        {destinations.map((dest) => {
          const active = dest === activeDest
          const tt = tripTypeByDest[dest] ?? 'round'
          const arrow = tt === 'round' ? '⇄' : '→'
          return (
            <span
              key={dest}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 4px 6px 12px',
                borderRadius: 999,
                border: `1px solid ${active ? C.ink : C.line}`,
                background: active ? C.ink : 'transparent',
                color: active ? C.surface : C.ink2,
                fontSize: 13,
                fontWeight: 500,
                transition: 'background .12s, color .12s, border-color .12s',
              }}
            >
              <button
                type="button"
                onClick={() => setActive(dest)}
                disabled={pending}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {dest} {arrow}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(dest)}
                disabled={pending}
                aria-label={`${dest} 삭제`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '0 6px',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  opacity: 0.7,
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        <button
          type="button"
          onClick={openSheet}
          disabled={pending}
          style={addChipStyle}
        >
          + 목적지 추가
        </button>
      </div>

      {/* 활성 목적지의 왕복·편도 토글 — destinations 가 1개 이상 있고 active 가 있을 때만. */}
      {activeDest && destinations.includes(activeDest) && (
        <SegmentField
          label={`${activeDest} 왕복·편도`}
          value={tripTypeByDest[activeDest] ?? 'round'}
          onChange={(v) => {
            const nextTT = v === 'one_way' ? 'one_way' : 'round'
            startTransition(async () => {
              const r = await setCaseDestinationTripType(caseId, activeDest, nextTT)
              if (!r.ok) {
                alert(`오류: ${r.error}`)
                return
              }
              await refreshCases()
            })
          }}
          options={TRIP_OPTIONS}
          last
        />
      )}

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
    </SectionCard>
  )
}

const addChipStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 999,
  border: `1px dashed ${C.line}`,
  background: 'transparent',
  color: C.ink3,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
