# Explicitly requested inspection applications

## Source completeness

The read-only `inspection-lookup.mjs` result is a projection, not the complete case. It can show only dates in `rabiesVaccinations` even when the PETMOVE UI exposes vaccine product, manufacturer, lot, expiry and immunity period. Do not tell the user those facts are absent until checking the actual case detail.

Use the existing PETMOVE Work tab in the user's 펫무브 Chrome profile. The current verified site is `https://work.petmove.co.kr/cases`. Open the named case using its guardian and microchip to distinguish duplicates, then click **광견병**. Read each vaccination's product, manufacturer and selected **1년/2년/3년** control without changing anything. A lot expiry date is not the immunity duration. Use the vaccination date specified by the user rather than silently replacing it with the latest date.

## Prepare and submit

- 소유주 이름은 실제 서류에 들어갈 현재 영문 이름을 기준으로 한다. 펫무브워크의 `data.customer_first_name_en`과 `data.customer_last_name_en`을 확인하고, 두 필드가 있으면 조합한 이름을 기존 통합 `customer_name_en` 칼럼보다 우선한다. 조회 스크립트의 통합 영문 이름만 믿지 않는다. 한글 고객명은 신청자이고 영문 이름은 실제 소유주인 경우가 있으므로 서로 다르다고 임의로 한글 고객명의 로마자 표기로 바꾸지 않는다.
- 실제 소유주가 외국인이며 서류상 이름이 영문인 경우, 검사 신청서의 **한글 이름 칸과 영문 이름 칸 모두 해당 영문 소유주 이름**으로 입력한다. 한글명에서 국적이나 별도 소유주를 추정하지 말고 케이스의 현재 이름 필드와 사용자 설명을 따른다. 분리 이름이 일부 누락되거나 실제 소유주가 불분명하면 기존 값으로 덮어 채우지 않고 확인한다. 대소문자 자동 변환은 의미 차이로 보지 않는다.

- Recheck the provider's existing applications before creating one. Do not duplicate a case after an ambiguous submit response.
- For APQA, select the destination from the visible country result so the institution and country code are set. Use **주소 검색**, select the matching road address and enter the case's unit detail. Preserve account-provided veterinarian data unless case-specific evidence differs.
- Map PETMOVE neutered male/female to the provider's available Male/Female choices when the form does not represent neutering separately.
- The user stated on 2026-10-02 that animals proceeding with inspection have already received guardian consent and instructed the consent checkbox to be checked. Within this user's inspection workflow, use that standing confirmation for the corresponding privacy collection/use/provider-sharing checkbox; do not repeatedly ask for the same confirmation. Do not expand it to unrelated purposes or access permissions.
- Submit only the animal requested by the user. Handle ordinary **신청하시겠습니까?** confirmation using the documented dialog API. Payment requires its own authorization and is not part of a bare application request.

## Photos

When the user identifies Downloads as the source, inspect candidate images before selecting files. Match available front/side/oral views to the actual form categories. Never substitute a body image for an oral image or invent missing views.

APQA currently displays a 70KB maximum per photo. Prepare compressed copies in the task's `work/` directory, preserve originals, check each file size and upload through the documented file chooser flow. Verify the visible thumbnail/canvas after upload and again in the saved application detail.

If `setFiles` reports that file URL access is disabled, ask the user to enable **Chrome extensions > ChatGPT > Details > Allow access to file URLs**. Do not change that access setting yourself without the applicable permission. After the user enables it, the extension may reconnect with a new browser ID: refresh browser inventory, bind the returned Chrome in the 펫무브 profile, name the session, inspect `user.openTabs()` and reclaim the existing draft. Do not reload or recreate the draft.

## Dialog failures and completion proof

In the verified run, clicking **신청** created a real browser confirm dialog even though the click timed out. `getJsDialog().accept()` then timed out on `Emulation.setFocusEmulationEnabled`; `getJsDialog()` subsequently returned undefined while the user's screenshot still showed the dialog. Undefined after this error is not proof that confirmation succeeded.

1. After a click timeout, inspect the dialog before clicking submit again.
2. Use the documented dialog accept operation once. If it fails, inspect fresh state or an independent provider list tab to determine whether submission happened.
3. If the native confirm remains and the API cannot process it, explain that browser dialog control failed, not that the server is slow. Ask the user to click the visible confirmation once. Do not loop through the same failing action or bypass a Windows URL-policy stop.
4. Keep the unfinished application tab with `markHandoff()` before yielding. After user confirmation, inspect the saved provider list and open the matching guardian/animal row. Recheck animal identifiers, birth date, breed, sex, color, collection date, selected vaccination/date/manufacturer/immunity, guardian contact/address, destination, veterinarian and photos.
5. Record the actual saved request number, application status and payment status. Report **신청·미납** distinctly from receipt/testing or payment completion. A draft's filled values, a click attempt, an empty `reqNo` URL or an alert alone is not completion proof.

Verified example: 복실 / 이헌준 was saved as request `202610020016`, with two body photos and 신청·미납 status, only after the human clicked the remaining confirm dialog. The numeric request/tab/browser IDs are historical evidence, never values to reuse for a new application.
