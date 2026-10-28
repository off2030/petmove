# Inspection provider procedures

## Provider mapping

- `APQA SEOUL`, `APQA EU`, and `APQA HQ`: 농림축산검역본부 eminwon at `https://eminwon.qia.go.kr`. The provider list does not distinguish SEOUL, EU, and HQ; the verification procedure is identical.
- `KRSL`: 코미팜 광견병항체검사 at `https://krsl.komipharm.co.kr/main.asp`.
- `KSVDL` and `KSVDL-R`: KSVDL FAVN PDF application.

## APQA / eminwon

2026-10-28 최신 자동 선택 지시: 로잔동물의료센터의 하와이 광견병 항체검사는 APQA 국가별 규칙에서 제외하고 **나머지 국가 기본값 KRSL**로 분류한다. 실제 조직 설정에 반영·재조회했다. 기존 개별 검사 기록에 저장된 기관은 이 자동 선택 설정 변경만으로 수정하지 않는다. 아래 APQA 결과지 인정에 관한 사용자 설명은 자동 선택 기관을 APQA로 되돌리는 지시가 아니다.

2026-10-28 사용자 확인: 하와이행도 APQA 검사결과지로 진행한다. 이 사용자의 신청 업무에서는 Work에 지정된 APQA를 유지하고, 하와이 웹페이지의 검사기관 열거에 APQA가 없다는 이유만으로 부적합으로 단정하거나 해외 검사실로 변경을 요구하지 않는다. 이는 사용자가 확인한 업무 기준이며 공식 사이트의 인정 목록이 갱신되었다는 뜻은 아니다. 상대국은 실제 화면의 **하와이** 항목을 찾아 선택한다. 미국·다른 국가로 대체하거나 readonly 국가 코드/영문명을 주입하지 않는다. 검색에 없으면 정상 기관/국가 선택 경로와 계정 설정을 확인하고, 끝내 선택할 수 없으면 실제 화면의 제약을 보고한다.

Open eminwon in the user's Chrome and enter through the **광견병 항체검사** menu at `https://eminwon.qia.go.kr/eminwon/rabies`. Do not use the general 검역본부 민원신청시스템. Use the saved ID and password by clicking the login button only. Open **광견병 항체검사 신청** and locate the corresponding application. Compare its displayed application information with PETMOVE Work. Remain read-only and do not submit, alter, cancel, or pay for anything.

## KRSL / Komipharm

1. Open the KRSL site in the user's Chrome and click the login button using the browser-saved credentials.
2. Go to 마이페이지, then **저장된 리스트** at `/common/receipt/list.asp`. This is the pending list for new applications not yet received or paid. Do not use **검사내역**, which contains historical completed inspections.
3. Search using the animal's English name, such as `MONG`.
4. Open the row's right-side **수정** button. The receipt-number view at `receipt/view.asp` omits the blood collection date and is not sufficient for verification.
5. Read the full input form, including 채혈일/혈액채취일, and compare it with PETMOVE Work.
6. Do not click any save, update/submit, delete, payment, or formal-receipt button. Leave the form unchanged.

## KSVDL / KSVDL-R

Use only the KSVDL or KSVDL-R application PDF supplied by the user for the current check. Compare that PDF's application fields with PETMOVE Work without editing or submitting it. Do not generate, download, or search for a replacement application through PETMOVE Work or another service. If the user has not supplied the relevant PDF, report that the provider was identified and ask the user to attach the application; do not search Gmail or Notion for it.

This PDF-only procedure covers application verification. For an explicitly requested laboratory-fee payment, follow the separate [KSVDL payment skill](../../petmove-ksvdl-payment/SKILL.md) using the current billing evidence and authorized payment scope.
