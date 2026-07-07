'use client'

import { useMemo } from 'react'
import type { CaseRow } from '@petmove/domain'
import { buildFieldSpecs, renderFieldValue } from '@petmove/domain'
import { useCases } from './cases-context'
import { destCode } from '@/lib/country-code'

/**
 * 케이스 상세 상단 고정 헤더 (표시 전용).
 * 스크롤되는 필드 목록 위에 남아 "지금 누구 케이스인지"를 잡아준다.
 *
 * 표시: 동물이름 + (종·품종·성별·모색, 값 있는 것만 점 연결) / 보호자이름 / 목적지 칩.
 *  - species·sex 는 select 라 DB 옵션 라벨을 renderFieldValue 로 변환.
 *  - breed·color 는 한글 우선(영문 폴백) 저장값 그대로.
 *  - 다중 목적지는 활성 칩 하나 + "+N".
 */
export function CaseHeader({ caseRow }: { caseRow: CaseRow }) {
  const { fieldDefs, activeDestination } = useCases()
  const specs = useMemo(() => buildFieldSpecs(fieldDefs), [fieldDefs])
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // select 필드(종·성별) → 옵션 라벨. 빈 값이면 '—' 대신 빈 문자열.
  function selectLabel(key: string, raw: unknown): string {
    const spec = specs.find((s) => s.key === key)
    if (!spec) return ''
    const r = renderFieldValue(spec, raw)
    return r === '—' ? '' : r
  }

  const speciesLabel = selectLabel('species', data.species)
  const sexLabel = selectLabel('sex', data.sex)
  const breedLabel = ((data.breed as string) || (data.breed_en as string) || '').trim()
  const colorLabel = ((data.color as string) || (data.color_en as string) || '').trim()
  // 요청 순서: 종 · 품종 · 성별 · 모색.
  const metaParts = [speciesLabel, breedLabel, sexLabel, colorLabel].filter(Boolean)

  const petName = (caseRow.pet_name ?? '').trim()
  const customerName = (caseRow.customer_name ?? '').trim()

  const dests = caseRow.destination
    ? caseRow.destination.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const activeDest =
    activeDestination && dests.includes(activeDestination) ? activeDestination : dests[0] ?? null
  const activeCode = activeDest ? destCode(activeDest) : null
  const extraCount = dests.length > 1 ? dests.length - 1 : 0

  return (
    <div className="shrink-0 pb-4 border-b border-border/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="font-serif text-[22px] font-semibold tracking-tight text-foreground leading-tight">
              {petName || <span className="text-muted-foreground/50">이름 없음</span>}
            </span>
            {metaParts.length > 0 && (
              <span className="text-[13px] text-muted-foreground">
                {metaParts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground/40 mx-1.5 select-none">·</span>}
                    {p}
                  </span>
                ))}
              </span>
            )}
          </div>
          {customerName && (
            <div className="mt-1 text-[14px] text-muted-foreground truncate">{customerName}</div>
          )}
        </div>

        {activeDest && (
          <span className="shrink-0 inline-flex items-baseline gap-1.5 rounded-full bg-pmw-tag px-3 py-1 text-pmw-tag-foreground">
            {activeCode && (
              <span className="font-mono text-[10px] uppercase tracking-[1px] text-pmw-tag-foreground/60">
                {activeCode}
              </span>
            )}
            <span className="font-serif text-[14px] leading-none">{activeDest}</span>
            {extraCount > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-pmw-tag-foreground/60">
                +{extraCount}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
