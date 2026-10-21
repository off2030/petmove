# 수정 및 브라우저 운용

## 기존 신고 수정

메뉴 → **Reference to the registration data list** → 해당 동물/번호 → **Modification of the notification**.

수정할 값 입력 → 동물정보 Next → Confirmation의 **Reason for modification**(필수,100자 이내). 예: `CORRECTION OF THE APPLICANT EMAIL ADDRESS TO LVMCFILE@GMAIL.COM.`

제출 지시가 있으면 Notification 뒤 **Apply까지 눌러야 검사 신청 내용도 변경된다**. 변경 후 번호의 끝자리가 바뀔 수 있으므로 새 완료 번호를 기록한다. 사용자 요청 없이 다른 동물이나 계정 전체를 일괄 수정하지 않는다.

## 화면 제어와 오류

- 현재 제공된 브라우저 도구 문서를 따르고, 케이스 데이터 접근은 화면 기반으로 한다. 고정 탭ID·브라우저ID·요소 인덱스를 재사용하지 않는다.
- 화면에 Next/Back 클릭 직후 이전 내용이 잠깐 남는 현상이 있었다. 새 화면 제목/필드로 실제 이동을 확인한 뒤 행동한다. 시간 초과는 실패나 성공의 증거가 아니다.
- 종/국가/라디오/체크박스는 서버 갱신이 발생할 수 있다. 종과 지역 지정 → 새 상태 확인 → Pet/국가 등 의존 필드 지정 → 상태 확인 → 나머지 입력. 연속 클릭 후 첫 선택이 풀리지 않았는지 확인한다.
- 보이지 않는 라디오/체크박스 입력 자체 대신 실제 레이블을 클릭해야 할 수 있다. 입력 결과와 checked 상태를 확인한다.
- 브라우저 confirm은 일반 DOM 버튼과 다르다. 지원되는 **getJsDialog()/confirm.accept()**를 사용한다. 클릭이 confirm 때문에 중단되면 동일 링크를 반복 클릭하지 않는다.
- 과거 NACCS 재사용 confirm에서 인식은 되지만 accept가 연결 시간 초과를 낸 적이 있다. 도구의 confirm 보고만으로 사용자가 화면에서 창을 보거나 승인됐다고 단정하지 않는다. 실제 새 수출 양식으로 이동했는지 확인한다.
- Windows Computer Use는 별도 스킬 지침대로 사용한다. Windows 주소 확인 실패로 자동 중단되면 그 턴은 지시대로 중단한다. 이를 우회하거나 주소검증을 끄지 않는다. 브라우저 제어 세션 초기화와 Chrome 확장 프로그램 자체 재연결은 다르다. 확장 재연결도 이 오류를 확실히 고친다는 보장은 없다.
- 결과가 불명확하면 현재 창/새 탭/등록 목록을 확인해 중복 신고를 막는다. 제출 버튼을 반복해서 누르지 않는다.
- **귀국편이 있으면 수입 완료 후 수출 신청을 이어갈 메뉴 탭을 유지한다.** 작업 중단·사용자 확인 대기·다음 턴에도 필요한 양식은 현재 도구의 handoff 기능으로 보존한다. 완료 화면 Close와 브라우저 전체 종료를 혼동하지 않는다.

## 관찰된 필드명 참고

실제 DOM을 먼저 확인한다. 수입/수출에서 철자가 다르므로 문자열을 기계적으로 치환하지 않는다.

- 수입 기본 `idr01w01e_01_`, 동물 `idr01w02e_02_`, 첨부 `idr01w03c_01_`.
- 수출 기본 `eda01w01e_01_`, 조건 `eda01w02e_01_`, 동물 `eda01w03e_02_`.
- 수출 접종일 `kyokenbyoSessyuYear1_0/Month1_0/Date1_0`, 유효기간 `kyokenbyoYukokgnCd1_0`, 종류 `yoboekiKindCd1_0`, 제품 `yoboekiSeihinSeizo1_0`. 두 번째 접종 필드는 1을 2로 바꾼다.
- 수출 항체 채혈일 `kotaiKensaSaiketuYmdYear_0/Month_0/Day_0`, 범주 `kotaikaSokuteiKekkaCd_0`, 기관 `kotaiOrgCd_0`.
- 수출 칩일 `hyoshikiYmdYear_0/Month_0/Day_0`; 수입 칩일은 중복 prefix가 관찰됐으므로 현 화면 확인.
- 파일 선택은 지원되는 filechooser 방식으로 처리하고, Add 후 목록의 파일명/분류를 검증한다.
