import { JP_CHECKS } from './jp'
import type { CheckContext, CheckResult, ProcedureCheck } from './types'

/**
 * 모든 절차 검증의 단일 레지스트리.
 *
 * 국가 추가 시:
 * 1) lib/procedure-checks/<country>.ts 생성 (예: au.ts)
 * 2) 이 파일에 import 하고 아래 배열에 펼치기
 */
export const ALL_PROCEDURE_CHECKS: ProcedureCheck[] = [
  ...JP_CHECKS,
]

/** 국가 키로 그룹화. 'all' 은 공통. */
export function groupChecksByCountry(): Record<string, ProcedureCheck[]> {
  const out: Record<string, ProcedureCheck[]> = {}
  for (const c of ALL_PROCEDURE_CHECKS) {
    ;(out[c.country] ??= []).push(c)
  }
  return out
}

/** 특정 국가 케이스에 적용될 체크 = 해당 국가 + 'all'. */
export function getChecksForCountry(country: string): ProcedureCheck[] {
  return ALL_PROCEDURE_CHECKS.filter((c) => c.country === country || c.country === 'all')
}

/** run 이 정의된 체크만 실행하고 결과 반환. */
export function runChecksForCase(country: string, ctx: CheckContext): Array<{ check: ProcedureCheck; result: CheckResult }> {
  const out: Array<{ check: ProcedureCheck; result: CheckResult }> = []
  for (const check of getChecksForCountry(country)) {
    if (!check.run) continue
    out.push({ check, result: check.run(ctx) })
  }
  return out
}
