'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CaseRow } from '@/lib/supabase/types'
import { DESTINATION_OVERRIDES, matchesDestinationKey } from '@petmove/domain'
import { getChecksForCountry } from '@petmove/domain'
import type { CheckResult, CheckSeverity, ProcedureCheck } from '@petmove/domain'
import { getDisabledCheckIds } from '@/lib/verification-disabled'

export interface CheckEntry {
  check: ProcedureCheck
  result: CheckResult
}

export interface PathInfo {
  /** 해당 경로에 걸린 체크 중 가장 강한 심각도. */
  severity: CheckSeverity
  entries: CheckEntry[]
}

interface VerificationValue {
  /** 필드 경로별 문제 정보 (없으면 null). */
  getForPath: (path: string) => PathInfo | null
  /** 전체 검증 결과 (상세 섹션·요약 배지용). */
  results: CheckEntry[]
}

const VerificationCtx = createContext<VerificationValue | null>(null)

function severityRank(s: CheckSeverity): number {
  return s === 'blocker' ? 3 : s === 'warning' ? 2 : 1
}

function detectCountryKey(destination: string | null): string | null {
  if (!destination) return null
  for (const key of Object.keys(DESTINATION_OVERRIDES)) {
    if (matchesDestinationKey(destination, key)) return key
  }
  return null
}

export function VerificationProvider({
  caseRow,
  destination,
  children,
}: {
  caseRow: CaseRow
  /** 다중 목적지 케이스에서 현재 활성 목적지 (없으면 caseRow.destination). */
  destination?: string | null
  children: ReactNode
}) {
  // 설정 탭에서 사용자가 끈 규칙 id. localStorage 라 mount 이후에만 채워짐.
  const [disabledIds, setDisabledIdsState] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setDisabledIdsState(getDisabledCheckIds())
    function onStorage(e: StorageEvent) {
      if (e.key === 'verification-disabled-checks') setDisabledIdsState(getDisabledCheckIds())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<VerificationValue>(() => {
    const country = detectCountryKey(destination ?? caseRow.destination)
    const checks = country ? getChecksForCountry(country) : getChecksForCountry('all')

    const results: CheckEntry[] = []
    const pathMap = new Map<string, PathInfo>()

    for (const check of checks) {
      if (!check.run) continue
      if (disabledIds.has(check.id)) continue
      let result: CheckResult
      try {
        result = check.run({ caseRow })
      } catch (e) {
        result = { ok: false, message: `검증 실행 오류: ${e instanceof Error ? e.message : String(e)}` }
      }
      results.push({ check, result })
      if (result.ok) continue
      const paths = result.offendingPaths ?? []
      for (const p of paths) {
        const existing = pathMap.get(p)
        if (!existing) {
          pathMap.set(p, { severity: check.severity, entries: [{ check, result }] })
        } else {
          existing.entries.push({ check, result })
          if (severityRank(check.severity) > severityRank(existing.severity)) {
            existing.severity = check.severity
          }
        }
      }
    }

    return {
      getForPath: (p) => pathMap.get(p) ?? null,
      results,
    }
  }, [caseRow, destination, disabledIds])

  return <VerificationCtx.Provider value={value}>{children}</VerificationCtx.Provider>
}

export function useFieldVerification(path: string): PathInfo | null {
  const ctx = useContext(VerificationCtx)
  if (!ctx) return null
  return ctx.getForPath(path)
}

export function useVerificationResults(): CheckEntry[] {
  const ctx = useContext(VerificationCtx)
  return ctx?.results ?? []
}

/** severity → 텍스트 색상 (밝기 대응). */
export function severityTextClass(s: CheckSeverity): string {
  if (s === 'blocker') return 'text-red-600 dark:text-red-400'
  if (s === 'warning') return 'text-amber-600 dark:text-amber-400'
  return 'text-sky-600 dark:text-sky-400'
}

/** 툴팁 텍스트 (title 속성용) — 체크 메시지만 간결하게. */
export function tooltipText(info: PathInfo): string {
  return info.entries.map(({ result }) => result.message).join('\n')
}
