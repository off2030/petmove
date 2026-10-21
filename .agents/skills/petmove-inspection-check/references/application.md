# Explicitly requested inspection applications

## Source completeness

The read-only `inspection-lookup.mjs` result is a projection, not the complete case. It can show only dates in `rabiesVaccinations` even when the PETMOVE UI exposes vaccine product, manufacturer, lot, expiry and immunity period. Do not tell the user those facts are absent until checking the actual case detail.

Use the existing PETMOVE Work tab in the user's 펫무브 Chrome profile. The current verified site is `https://work.petmove.co.kr/cases`. Open the named case using its guardian and microchip to distinguish duplicates, then click **광견병**. Read each vaccination's product, manufacturer and selected **1년/2년/3년** control without changing anything. A lot expiry date is not the immunity duration. Use the vaccination date specified by the user rather than silently replacing it with the latest date.

## Prepare and submit

- 광견병 접종 기록이 두 개 이상이면 검사일을 기준으로 직전 접종 정보를 입력한다. 직전 접종일이 검사일(채혈일)과 같으면 그 당일 접종이 아니라 그 전 접종 기록을 사용한다. 선택한 기록의 제품·제조사·제조번호·면역기간을 함께 확인하고 다른 회차의 상세정보를 섞지 않는다. 사용자가 특정 기록을 명시하면 그 지시를 따른다. 이전 기록의 상세정보가 불분명하면 추정하지 않고 임시저장 후 사용자에게 묻는다.
- 작성 중 애매하거나 확인되지 않은 항목이 있으면 가능한 내용까지 임시저장하고 해당 항목을 사용자에게 묻는다. 자료와 입력 기준이 확실하고 요청된 신청에 필요한 항목이 모두 갖춰졌으면 신청까지 진행한다. 결제는 별도 권한 범위를 따른다.
- KRSL 검사 진행 안내 수신 대상은 수의사로 선택한다.

- 소유주 이름은 실제 서류에 들어갈 현재 영문 이름을 기준으로 한다. 펫무브워크의 `data.customer_first_name_en`과 `data.customer_last_name_en`을 확인하고, 두 필드가 있으면 조합한 이름을 기존 통합 `customer_name_en` 칼럼보다 우선한다. 조회 스크립트의 통합 영문 이름만 믿지 않는다. 한글 고객명은 신청자이고 영문 이름은 실제 소유주인 경우가 있으므로 서로 다르다고 임의로 한글 고객명의 로마자 표기로 바꾸지 않는다.
- 실제 소유주가 외국인이며 서류상 이름이 영문인 경우, 검사 신청서의 **한글 이름 칸과 영문 이름 칸 모두 해당 영문 소유주 이름**으로 입력한다. 한글명에서 국적이나 별도 소유주를 추정하지 말고 케이스의 현재 이름 필드와 사용자 설명을 따른다. 분리 이름이 일부 누락되거나 실제 소유주가 불분명하면 기존 값으로 덮어 채우지 않고 확인한다. 대소문자 자동 변환은 의미 차이로 보지 않는다.

- Recheck the provider's existing applications before creating one. Do not duplicate a case after an ambiguous submit response.
- For APQA, select the destination from the visible country result so the institution and country code are set. Use **주소 검색**, select the matching road address and enter the case's unit detail. Preserve account-provided veterinarian data unless case-specific evidence differs.
- Map PETMOVE neutered male/female to the provider's available Male/Female choices when the form does not represent neutering separately.
- The user stated on 2026-10-02 that animals proceeding with inspection have already received guardian consent and instructed the consent checkbox to be checked. Within this user's inspection workflow, use that standing confirmation for the corresponding privacy collection/use/provider-sharing checkbox; do not repeatedly ask for the same confirmation. Do not expand it to unrelated purposes or access permissions.
- Submit only the animal requested by the user. Handle ordinary **신청하시겠습니까?** confirmation using the documented dialog API. Payment requires its own authorization and is not part of a bare application request.

## Photos

사진은 강아지만 첨부한다. **1세 이상은 전신 전면·전신 측면 2장**, **1세 미만은 그 2장에 구강 전면·구강 좌(우)측면 2장을 추가해 총 4장**을 맞는 슬롯에 넣는다. 펫무브워크의 실제 케이스 첨부사진을 먼저 확인하고 파일명만으로 부위를 판단하지 않는다. 필요한 사진이 없거나 일부 부족하면 확보된 사진과 누락을 구분해 보고하고 신청은 하지 않은 채 저장까지만 한다. 필요한 사진이 모두 있고 신청을 위임받았으면 첨부 후 신청까지 진행한다. 사용자가 입력까지만 등 더 좁은 범위를 지정하면 그 범위를 따른다. 고양이는 사진을 요구하지 않는 이 업무 기준을 적용한다.

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
