import { AU_CHECKS } from './au'
import { EU_CHECKS } from './eu'
import { HI_CHECKS } from './hi'
import { JP_CHECKS } from './jp'
import { NZ_CHECKS } from './nz'
import { SG_CHECKS } from './sg'
import type { CheckContext, CheckResult, CountryKey, ProcedureCheck } from './types'

/**
 * 모든 절차 검증의 단일 레지스트리.
 *
 * 국가 추가 시:
 * 1) lib/procedure-checks/<country>.ts 생성 (예: au.ts)
 * 2) 이 파일에 import 하고 아래 배열에 펼치기
 */
export const ALL_PROCEDURE_CHECKS: ProcedureCheck[] = [
  ...JP_CHECKS,
  ...SG_CHECKS,
  ...EU_CHECKS,
  ...AU_CHECKS,
  ...NZ_CHECKS,
  ...HI_CHECKS,
]

/** check 의 country 가 target 키에 매칭되는지. 'all' 또는 배열에 포함되면 true. */
export function checkAppliesTo(checkCountry: CountryKey, target: string): boolean {
  if (checkCountry === 'all') return true
  if (Array.isArray(checkCountry)) return checkCountry.includes(target)
  return checkCountry === target
}

/** 한 체크가 등록된 모든 국가 키 (단일 → [k], 배열 → 그대로, 'all' → ['all']). */
export function checkCountryKeys(checkCountry: CountryKey): string[] {
  if (Array.isArray(checkCountry)) return checkCountry
  return [checkCountry]
}

/** 국가 키로 그룹화. 'all' 은 공통. 다중 국가 규칙은 각 국가에 모두 등록됨. */
export function groupChecksByCountry(): Record<string, ProcedureCheck[]> {
  const out: Record<string, ProcedureCheck[]> = {}
  for (const c of ALL_PROCEDURE_CHECKS) {
    for (const k of checkCountryKeys(c.country)) {
      ;(out[k] ??= []).push(c)
    }
  }
  return out
}

/** 특정 국가 케이스에 적용될 체크 = 해당 국가 + 'all'. */
export function getChecksForCountry(country: string): ProcedureCheck[] {
  return ALL_PROCEDURE_CHECKS.filter((c) => checkAppliesTo(c.country, country))
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
