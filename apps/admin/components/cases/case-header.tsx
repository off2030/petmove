'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import type { CaseRow } from '@petmove/domain'
import { buildFieldSpecs } from '@petmove/domain'
import { cn } from '@/lib/utils'
import { useCases } from './cases-context'
import { evaluateCase } from './verification-context'
import { listOrgDisabledChecks } from '@/lib/actions/org-disabled-checks'
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
  const { fieldDefs, activeDestination, cases } = useCases()
  const specs = useMemo(() => buildFieldSpecs(fieldDefs), [fieldDefs])
  const data = (caseRow.data ?? {}) as Record<string, unknown>

  // 절차 검증 요약 배지 — 상세 필드 색칠·PDF 발급 게이트와 동일한 evaluateCase 엔진.
  // 조직이 끈 규칙(disabledIds)은 마운트 후 1회 로드(그 전엔 전부 실행).
  const [disabledIds, setDisabledIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    void (async () => {
      const r = await listOrgDisabledChecks()
      if (r.ok) setDisabledIds(new Set(r.value))
    })()
  }, [])
  const viewDestination = activeDestination ?? caseRow.destination
  const verify = useMemo(() => {
    const results = evaluateCase(caseRow, viewDestination, disabledIds, cases)
    // info(안내·"적합")는 제외 — blocker/warning 만 문제로 집계 (PDF 발급 게이트와 동일 기준).
    const failing = results.filter((e) => !e.result.ok && e.check.severity !== 'info')
    return {
      count: failing.length,
      hasBlocker: failing.some((e) => e.check.severity === 'blocker'),
      messages: failing.map((e) => e.result.message),
    }
  }, [caseRow, viewDestination, disabledIds, cases])

  // select 필드(종·성별) → 옵션의 한글 라벨. renderFieldValue 는 영문 우선이라
  // 헤더에선 label_ko 를 직접 뽑는다 (종을 '강아지/고양이'로 한글 표시).
  function selectLabel(key: string, raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return ''
    const spec = specs.find((s) => s.key === key)
    const opt = spec?.options?.find((o) => o.value === raw)
    return opt?.label_ko ?? String(raw)
  }

  const speciesLabel = selectLabel('species', data.species)
  const breedLabel = ((data.breed as string) || (data.breed_en as string) || '').trim()
  // 종 · 품종만 표시 (성별·모색 제외).
  const metaParts = [speciesLabel, breedLabel].filter(Boolean)

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
    <div className="shrink-0 px-md md:px-lg pb-4 border-b border-border/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-baseline gap-x-2.5 gap-y-1 flex-wrap">
          <span className="font-serif text-[22px] font-semibold tracking-tight text-foreground leading-tight">
            {petName || <span className="text-muted-foreground/50">이름 없음</span>}
          </span>
          {customerName && (
            <span className="text-[14px] text-muted-foreground">{customerName}</span>
          )}
          {customerName && metaParts.length > 0 && (
            <span className="text-muted-foreground/30 select-none">|</span>
          )}
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

        <div className="flex shrink-0 items-center gap-2">
          {/* 절차 검증 배지 — 이상 없음(초록) / 주의 N건(앰버·심각 시 빨강). hover 로 문제 목록. */}
          {verify.count === 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-pmw-positive/12 px-2.5 py-1 text-[12.5px] text-pmw-positive"
              title="절차 검증 이상 없음"
            >
              <Check className="h-3.5 w-3.5" />
              이상 없음
            </span>
          ) : (
            <span
              title={verify.messages.map((m) => `• ${m}`).join('\n')}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px]',
                verify.hasBlocker ? 'bg-destructive/10 text-destructive' : 'bg-pmw-warning/15 text-pmw-warning',
              )}
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              주의 {verify.count}건
            </span>
          )}

          {activeDest && (
            <span className="inline-flex items-baseline gap-1.5 rounded-full bg-pmw-tag px-3 py-1 text-pmw-tag-foreground">
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
    </div>
  )
}
