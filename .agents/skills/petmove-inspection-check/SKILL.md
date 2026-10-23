---
name: petmove-inspection-check
description: "Check PETMOVE inspection applications against their provider, or prepare and submit an application when explicitly requested. Use for 검사신청 확인, 검사 신청 대조, or a named animal's 검사 신청."
---

# PETMOVE inspection application check

Perform the check immediately when the animal name is available. Do not search Gmail or Notion; they are unrelated.

Apply the [shared field-resolution rules](../../../docs/work-management/operations.md#조회값은-화면pdf의-실제-선택-규칙으로-해석) before comparison or reporting missing/mismatched data. Use the fields and precedence consumed by the current UI/PDF, including split guardian names, destination scope, and inspection record index. Lookup output is a summary, not an override of those rules: if it exposes a legacy field (for example `guardian.nameEn` from `customer_name_en`), read the current split fields and resolve them as the UI/PDF does before judging a mismatch. Do not request a correction solely because an unused legacy value differs.

Read PETMOVE data initially with the local read-only lookup script. Use the user's Chrome profile for provider systems and for PETMOVE details omitted by that script. Verification does not authorize a new application, payment, or provider-side edits. The user has authorized the PETMOVE status update described below after an application is confirmed; a specific request to inspect without changes overrides that standing instruction. When the user explicitly requests an application, follow [references/application.md](references/application.md). Never modify the lookup script to write to the database.

For an explicit KSVDL fee-payment request, use the separate [KSVDL payment skill](../petmove-ksvdl-payment/SKILL.md). Its payment workflow does not require an application PDF; the PDF requirement below applies to application verification.

For a whole inspection-tab overview, read every page of the active organization's non-deleted cases with a stable sort and explicit ranges, and compare the fetched case count with the exact database count before reporting totals. A large `.limit()` alone does not override the server response cap. Derive inspection rows and statuses using the current application's rules, including repeated titer records and destination-scoped infectious tests; case counts and inspection-row counts differ. Do not report the first response as the entire tab.

## 신청 확인 후 검사 상태 반영

- 매일 한국 시간 오후 1시 대기 점검에서는 검사일이 미래인 항목을 예정 건으로 그대로 둔다. 한국 날짜 기준 `waiting`이고 검사일로부터 달력일 5일 이상 경과한 항목만 대기 지연으로 매일 보고한다(검사일=0일, 5일째 포함). 동물·보호자·검사기관·검사일·경과일을 적는다. `testing`은 이 대기 지연에 포함하지 않으며 날짜 누락 시 경과일을 추정하지 않는다. 지연 점검 자체로 검사 신청·결제·상태 변경을 실행하지 않는다. 사용자가 매일 보고를 요청했으므로 해당 지연이 남으면 하루 한 번 보고하고, 없으면 알림을 생략한다. 화면의 기준은 `inspection-table.tsx`에서 `waiting && isOverdue(date, 5)`이며 검사일 셀에 경고색을 적용한다.

- 검사탭 업무는 현재 `대기`·`검사` 항목을 우선 확인하며 과거 완료 항목은 일반 현황 보고에서 생략한다.
- 검사기관에서 해당 신청 내역이 확인되면 펫무브워크의 **해당 검사 회차만 `대기(waiting)`에서 `검사(testing)`로 변경**한다. 이 업무의 `검사`는 신청 확인 후 진행 추적 상태이며, 미납·결제 전 저장 내역을 확인한 경우에도 적용한다. 이를 검사기관의 실제 분석 개시·결제 완료·결과 발급으로 표현하지 않는다.
- 보호자·동물·칩번호·채혈일·검사기관으로 대상을 식별한다. 재검사는 배열 첫 항목이라고 가정하지 말고 해당 기록 인덱스를 확인한다. `apps/admin/lib/inspection-status.ts`의 회차별 상태 규칙을 따른다. 다른 검사 회차·다른 케이스·완료 상태를 변경하지 않는다. 대조 불일치나 확인 불가는 임의로 검사 처리하지 않고 보고한다. 동일 종을 뜻하는 표기 차이 등은 실질 불일치와 구분하며 남은 차이는 보고한다.
- UI 또는 승인된 변경 경로로 반영하고 저장 결과를 직접 재조회한다. 직접 갱신할 때는 기존 데이터를 보존하고 동시 변경을 덮어쓰지 않는다. 조회 스크립트는 읽기 전용으로 유지한다. 이미 검사이면 유지하고 완료이면 낮추지 않는다.

## Workflow

### Chrome access

Read [references/chrome-access.md](references/chrome-access.md) before accessing an inspection-provider site. Prefer the Chrome extension connection in the user's 펫무브 profile. An omitted Chrome entry or a Windows URL-policy stop does not mean Chrome itself is unavailable.

1. Run the database lookup from this repository root (locate it from this skill at `.agents/skills/petmove-inspection-check`; do not assume a drive, username, or checkout path):
   `node scripts/inspection-lookup.mjs <동물이름> [동물이름...]`
   This script is strictly read-only and must not be modified to write to the database as part of an inspection check.
2. Use the returned `inspectionApplications` entries as the PETMOVE side of the comparison. They contain the guardian, animal, identifiers, collection date, provider, status, and other application-relevant values. If one animal has multiple cases or inspection records, do not choose silently; compare the applicable candidates or ask for the smallest distinguishing detail.
3. Map each application's provider and follow the matching procedure in [references/providers.md](references/providers.md). Do not ask the user to distinguish APQA SEOUL, EU, or HQ.
4. Compare every field exposed by both systems, including dates and identifiers. Normalize harmless presentation differences such as case and date formatting, but do not silently treat different underlying values as equal.
5. Report:
   - animal, guardian, and provider;
   - overall result: 일치, 불일치, or 확인 불가;
   - each mismatch or missing value as `항목 / PETMOVE Work / 검사기관`;
   - any field that could not be verified and why.

If a login button is available with saved credentials, click only the login button. Stop and ask the user to take over only when manual credential entry, CAPTCHA, MFA, or another human-only step prevents progress. Never expose stored credentials.

If the script reports `notFound`, say that no active PETMOVE case matched the supplied Korean or English animal name. If a case exists but `inspectionApplications` is empty, say that it is not currently represented as a rabies-antibody inspection row. If the script or its configured repository/environment is unavailable, fall back to `https://petmovework.vercel.app/cases?view=inspection` in the user's Chrome and explicitly note the fallback.
