'use server'
// 펫무브워크 자동 알림 — 케이스 데이터가 바뀌어 새 검증 실패가 생기면 시스템 메시지로 적재.

import { createClient } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'
import { getActiveOrgId } from '@/lib/supabase/active-org'
import { ensurePetmoveBot } from './petmove-bot'
import { getChecksForCountry, DESTINATION_OVERRIDES, matchesDestinationKey } from '@petmove/domain'
import type { CaseRow } from '@petmove/domain'
import type { CheckResult, ProcedureCheck } from '@petmove/domain'

function detectCountryKey(destination: string | null): string | null {
  if (!destination) return null
  for (const key of Object.keys(DESTINATION_OVERRIDES)) {
    if (matchesDestinationKey(destination, key)) return key
  }
  return null
}

interface FailureEntry {
  check: ProcedureCheck
  result: CheckResult
}

/** 케이스 raw 행 + 비활성 check id + 활성 destination 으로 실패한 체크 목록 산출. */
function evaluateFailures(
  caseRow: CaseRow,
  destination: string | null,
  disabledIds: Set<string>,
): FailureEntry[] {
  const country = detectCountryKey(destination ?? caseRow.destination)
  const checks = country ? getChecksForCountry(country) : getChecksForCountry('all')
  const out: FailureEntry[] = []
  for (const check of checks) {
    if (!check.run) continue
    if (disabledIds.has(check.id)) continue
    let result: CheckResult
    try {
      result = check.run({ caseRow })
    } catch (e) {
      result = { ok: false, message: `검증 실행 오류: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (!result.ok && check.severity !== 'info') {
      out.push({ check, result })
    }
  }
  return out
}

/** 검증 실패 알림 본문 상단의 메타 라인 — "고객 · 김철수" 형식. 빈 값은 자동 생략. */
function buildMetaLines(c: CaseRow): string[] {
  const customer = c.customer_name || c.customer_name_en || ''
  const pet = c.pet_name || c.pet_name_en || ''
  const dest = c.destination || ''
  const out: string[] = []
  if (customer) out.push(`고객 · ${customer}`)
  if (pet) out.push(`동물 · ${pet}`)
  if (dest) out.push(`국가 · ${dest}`)
  return out
}

/**
 * 케이스를 다시 평가해 신규 실패가 있으면 본인 시스템 대화방에 메시지 1건 적재.
 * `cases.notified_check_ids` 와 비교해 직전 알림 이후 새로 추가된 check.id 만 발송 대상.
 * 검증이 회복되면 집합에서 빠져, 재발생 시 다시 알림이 간다.
 *
 * `updateCaseField` 후 fire-and-forget 으로 호출. 실패해도 본 흐름엔 영향 없음.
 */
export async function evaluateAndNotify(caseId: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 1) 케이스 + 비활성 검증 규칙 로드 (활성 org 기준).
    const orgId = await getActiveOrgId()
    const [caseRes, disabledRes] = await Promise.all([
      supabase.from('cases').select('*').eq('id', caseId).maybeSingle(),
      supabase.from('org_disabled_checks').select('check_id').eq('org_id', orgId),
    ])
    if (!caseRes.data) return
    const caseRow = caseRes.data as CaseRow & { notified_check_ids?: string[] | null }
    const disabledIds = new Set<string>(
      ((disabledRes.data ?? []) as { check_id: string }[]).map((r) => r.check_id),
    )

    // 1.5) 발동 게이트 — 출국일 또는 내원일 중 하나라도 입력되기 전엔 알림을 띄우지 않는다.
    //      WHY: 신청 직후 빈 케이스에서도 일부 검증(예: "종합백신 기록 없음")은
    //      의존 입력 없이 즉시 fail 로 잡혀, 운영자가 트리아지 시작하기 전부터
    //      노이즈 알림이 발생한다. 시기·관계 검증(SKIP 컨벤션)은 dep/visit 가
    //      채워져야 의미가 생기므로, 이 둘 중 하나라도 들어온 시점을
    //      "검증 알림 시작 신호" 로 본다.
    //      notified_check_ids 도 건드리지 않아, 이후 첫 실제 평가 때 누적된
    //      fail 이 일괄 알림으로 발송된다.
    const dataObj = (caseRow.data ?? {}) as Record<string, unknown>
    const visitDate = typeof dataObj.vet_visit_date === 'string' ? dataObj.vet_visit_date : ''
    if (!caseRow.departure_date && !visitDate) return

    // 2) 평가.
    const failures = evaluateFailures(caseRow, caseRow.destination ?? null, disabledIds)
    const currentIds = failures.map((f) => f.check.id).sort()
    const previouslyNotified = new Set<string>(caseRow.notified_check_ids ?? [])
    const newFailures = failures.filter((f) => !previouslyNotified.has(f.check.id))

    // 3) 신규 실패가 없으면 — 회복된 항목을 반영해 집합만 업데이트하고 종료.
    const previousArr = Array.from(previouslyNotified).sort()
    if (newFailures.length === 0) {
      if (previousArr.join(',') !== currentIds.join(',')) {
        await supabase.from('cases').update({ notified_check_ids: currentIds }).eq('id', caseId)
      }
      return
    }

    // 4) 봇 사용자 보장 + 시스템 대화방 lookup or create.
    const botRes = await ensurePetmoveBot()
    if (!botRes.ok) return
    const botUserId = botRes.value.userId

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('kind', 'system')
      .eq('created_by', user.id)
      .maybeSingle()
    let convId: string
    if (existing) {
      convId = existing.id as string
    } else {
      const { data: created, error: cerr } = await admin
        .from('conversations')
        .insert({ kind: 'system', created_by: user.id, name: null })
        .select('id')
        .single()
      if (cerr || !created) return
      convId = created.id as string
    }

    // 참가자 보장 — idempotent (기존 대화방 backfill 도 같이 처리).
    // unique 제약이 conversation_id+user_id 에 잡혀 있다고 가정하고 upsert ignore.
    await admin
      .from('conversation_participants')
      .upsert(
        [
          { conversation_id: convId, user_id: user.id },
          { conversation_id: convId, user_id: botUserId },
        ],
        { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
      )

    // 5) 메시지 본문 — 제목 → 메타(고객/동물/국가) → 본문 3단 구조.
    const titleLine = newFailures.length === 1
      ? '검증 실패 알림'
      : `검증 실패 알림 (${newFailures.length}건)`
    const meta = buildMetaLines(caseRow)
    const bullets = newFailures.slice(0, 12).map((f) => `• ${f.result.message}`)
    const lines: string[] = [titleLine]
    if (meta.length > 0) lines.push('', ...meta)
    lines.push('', ...bullets)
    if (newFailures.length > 12) {
      lines.push(`외 ${newFailures.length - 12}건…`)
    }

    // 6) 메시지 적재 + dedup 셋 업데이트. sender 는 봇 사용자 — 다른 1:1 대화처럼
    //     profiles 룩업으로 이름·아바타가 자동으로 잡힌다.
    //     case_label 은 본문에 메타 통합으로 중복 회피 — null.
    await admin.from('messages').insert({
      conversation_id: convId,
      sender_user_id: botUserId,
      sender_name: null,
      case_id: caseId,
      case_label: null,
      content: lines.join('\n'),
    })
    await supabase.from('cases').update({ notified_check_ids: currentIds }).eq('id', caseId)
  } catch (e) {
    // best-effort — 알림 실패가 본 흐름을 막지 않도록 swallow.
    console.error('[evaluateAndNotify] error:', e)
  }
}
