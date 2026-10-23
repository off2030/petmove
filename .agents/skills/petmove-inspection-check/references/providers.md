# Inspection provider procedures

## Provider mapping

- `APQA SEOUL`, `APQA EU`, and `APQA HQ`: 농림축산검역본부 eminwon at `https://eminwon.qia.go.kr`. The provider list does not distinguish SEOUL, EU, and HQ; the verification procedure is identical.
- `KRSL`: 코미팜 광견병항체검사 at `https://krsl.komipharm.co.kr/main.asp`.
- `KSVDL` and `KSVDL-R`: KSVDL FAVN PDF application.

## APQA / eminwon

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
