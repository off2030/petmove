import type { CheckContext, CheckResult, ProcedureCheck } from './types'
import { SKIP, readDepartureDate } from './utils'
import { assessPhTiters, phAddDays, phDate, phRecords, phScopedData, phToday, phVaccineUntil, philippinesPolicy, validPhTiter, hasPhParasiteCoverage } from '../philippines-policy'

function state(ctx: CheckContext) {
  const data = phScopedData(ctx.caseRow, ctx.destination)
  return { data, arrival: phDate(data.entry_date) || readDepartureDate(ctx.caseRow, ctx.destination), filed: phDate(data.import_permit_application_date) }
}
const fail = (message: string, ...offendingPaths: string[]): CheckResult => ({ ok: false, message, offendingPaths })
function rule(spec: Pick<ProcedureCheck, 'id' | 'category' | 'title'> & { run: (ctx: CheckContext) => CheckResult }): ProcedureCheck {
  const { id, category, title, run } = spec
  return { id, country: 'philippines', category, title, description: 'BAI MC 60·61 (2026), 2027-01-01 시행. 기존 승인 허가는 구 규정 유지.', severity: 'warning', audience: 'staff', addedAt: '2026-11-16', run: ctx => philippinesPolicy(ctx.caseRow, ctx.destination) === 'legacy' ? SKIP : run(ctx) }
}
export const PH_2027_CHECKS: ProcedureCheck[] = [
  rule({ id: 'ph.new-regime-confirmation', category: '수입허가', title: 'SPSIC 승인일·적용 규정 확인', run: ctx => {
    return philippinesPolicy(ctx.caseRow, ctx.destination) === 'review' ? fail('SPSIC 신청·승인일을 확인해 적용 규정을 확정하세요. 확인 전에는 신규 요건을 준비하세요.', 'ph_spsic_approved_date', 'import_permit_application_date') : SKIP
  } }),
  rule({ id: 'ph.new-minimum-age', category: '일정', title: 'SPSIC 신청일에 생후 18주 이상', run: ctx => {
    const { data, filed } = state(ctx); const birth = phDate(data.birth_date)
    return birth && filed && phAddDays(birth, 126) > filed ? fail('SPSIC는 생후 18주 이후 신청할 수 있습니다.', 'birth_date', 'import_permit_application_date') : SKIP
  } }),
  rule({ id: 'ph.new-rabies', category: '광견병', title: '광견병 접종 연령·입국일 유효기간', run: ctx => {
    const { data, arrival } = state(ctx); const vaccines = phRecords(data.rabies_dates).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    if (!vaccines.length) return fail('유효한 광견병 접종 기록이 필요합니다.', 'rabies_dates')
    const birth = phDate(data.birth_date)
    if (birth && phAddDays(birth, 84) > phDate(vaccines[0].date)) return fail('광견병 접종은 생후 12주 이후여야 합니다.', 'rabies_dates', 'birth_date')
    return arrival && phVaccineUntil(vaccines.at(-1)!) < arrival ? fail('필리핀 도착일까지 광견병 접종이 유효해야 합니다.', 'rabies_dates', 'entry_date') : SKIP
  } }),
  rule({ id: 'ph.new-rnatt', category: '광견병항체검사', title: '인정기관 RNATT·0.5 IU/mL·접종 연속성', run: ctx => {
    const { data, arrival, filed } = state(ctx)
    if (validPhTiter(data, arrival || filed || phToday())) return SKIP
    const details = assessPhTiters(data, arrival || filed || phToday()).flatMap(t => t.problems)
    return fail(details.length ? [...new Set(details)].join(' / ') : 'SPSIC 신청 전에 인정기관의 0.5 IU/mL 이상 RNATT 결과가 필요합니다.', 'rabies_titer_records', 'microchip_implant_date', 'rabies_dates')
  } }),
  rule({ id: 'ph.new-parasites', category: '구충', title: '내부·외부구충 효력이 신청일·도착일까지 유효', run: ctx => {
    const { data, arrival, filed } = state(ctx)
    for (const [key, label] of [['internal_parasite_dates', '내부'], ['external_parasite_dates', '외부']] as const) {
      const end = arrival || filed || phToday()
      if (!hasPhParasiteCoverage(data, key, filed || end, end)) return fail(`${label}구충 처치일과 효력 종료일을 입력하세요. SPSIC 신청 시 유효하고 필리핀 도착일까지 효력이 유지되어야 합니다.`, key)
    }
    return SKIP
  } }),
  rule({ id: 'ph.new-form1', category: '서류', title: 'SPSIC 신청 전에 Form 1 작성·정부 확인', run: ctx => {
    const { data, filed, arrival } = state(ctx)
    const issued = phDate(data.ph_form1_issue_date); const endorsed = phDate(data.ph_form1_endorsed_date)
    if (issued > phToday() || endorsed > phToday()) return fail('Form 1 발급일과 정부 확인일에는 실제 처리한 날짜를 입력하세요.', 'ph_form1_issue_date', 'ph_form1_endorsed_date')
    const record = validPhTiter(data, arrival || filed || phToday())?.record
    if (record && (!phDate(record.test_date) || phDate(record.test_date) < phDate(record.date) || (issued && phDate(record.test_date) > issued))) return fail('RNATT 결과지의 실제 검사일을 입력하세요. 채혈일 이후, Form 1 발급일 이전이어야 합니다.', 'rabies_titer_records')
    if (!issued || !endorsed) return fail('Form 1 발급일과 실제 정부 확인일을 입력하세요. 병원 서명만으로는 SPSIC 신청 요건이 충족되지 않습니다.', 'ph_form1_issue_date', 'ph_form1_endorsed_date')
    if (endorsed < issued || (filed && endorsed > filed)) return fail('Form 1은 발급 후 정부 확인을 받아 SPSIC 신청 전에 준비해야 합니다.', 'ph_form1_endorsed_date', 'import_permit_application_date')
    return SKIP
  } }),
  rule({ id: 'ph.new-pregnancy', category: '동물정보', title: '임신·출산 후 18주 확인', run: ctx => {
    const { data, arrival } = state(ctx)
    if (data.ph_pregnant === 'yes' || data.ph_pregnant === true) return fail('임신 중에는 SPSIC를 신청할 수 없습니다.', 'ph_pregnant')
    const birth = phDate(data.ph_last_birth_date)
    return birth && arrival && phAddDays(birth, 126) > arrival ? fail('출산 후 18주가 지나야 필리핀으로 여행할 수 있습니다.', 'ph_last_birth_date', 'entry_date') : SKIP
  } }),
]
