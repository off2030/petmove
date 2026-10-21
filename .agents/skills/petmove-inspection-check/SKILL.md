---
name: petmove-inspection-check
description: "Check PETMOVE inspection applications against their provider, or prepare and submit an application when explicitly requested. Use for 검사신청 확인, 검사 신청 대조, or a named animal's 검사 신청."
---

# PETMOVE inspection application check

Perform the check immediately when the animal name is available. Do not search Gmail or Notion; they are unrelated.

Read PETMOVE data initially with the local read-only lookup script. Use the user's Chrome profile for provider systems and for PETMOVE details omitted by that script. A verification request is read-only. When the user explicitly requests an application, follow [references/application.md](references/application.md); that authorization permits preparing and submitting that animal's application, but does not imply payment or changes to other cases. Never modify the lookup script to write to the database.

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
