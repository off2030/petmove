# 담당별 정기 점검과 보고 누락 검증

세 담당이 각자 자기 범위 전체를 점검한다. 아래 표에서 scope와 필수 검토 소스를 정한다. 명시적 수동 전체 점검만 all을 사용한다.

| scope | 대상 | decisions.reviews 필수 소스 |
| --- | --- | --- |
| inspection | 모든 검사 회차·진행·결과·검사 관련 미완료 | inspectionMail, resultNotices |
| japan | 일본 여행 수입/수출 슬롯·검역소 메일·Form AC·일본 미완료 | mail, formAc |
| documents | 모든 여행의 일반 서류·내원 안내·일본 외 신고·자료 관련 미완료 | documentSources, visitBookings |
| all | 명시적 수동 전체 점검 | mail, resultNotices(전체 메일·Form AC·자료 대조 포함) |

scope는 최초 스냅샷에 고정되며 실행 중 바꿀 수 없다. 전체 DB 페이지·건수·현재 UI 선택 함수는 공통으로 대조하고 required.private.json에서 자기 담당의 전체 대상을 확인한다. 분류되지 않은 기존 지시·경고는 어느 담당에서도 누락시키지 않으며 workArea를 확인해 공유 이력에서 분류한다. 분류 전에는 임의 실행하지 않는다.

[실무 운영 기준](../../../../docs/work-management/operations.md)의 권한과 [인계 지침](../../../../docs/laptop-daily-check-handoff.md)의 기기·원격 병합을 적용한다. 모든 정기 실무 실행에서 이 절차를 수행한다.

## 시작과 전체 조회

기기·한국 요일 확인 → 연결된 Drive 최신 원본 준비 → 정기 실행이면 달력 start → 실행별 고유 Git 제외 폴더를 선택한다. 중복/남은 시작 기록은 실제 종료 여부부터 확인한다.

```powershell
$automationId = '<현재 담당 예약 ID: 업무 구조 문서 참조>'
$scope = 'inspection' # japan 또는 documents
node scripts/automation-calendar.mjs start --id $automationId
$reviewDir = 'work/naver-inquiries/daily-review-SCOPE-YYYYMMDD-HHMM-private'
node scripts/daily-review.mjs snapshot --dir $reviewDir --id $automationId --scope $scope --history <현재 실행 전용 공유 사본 경로>
```

명시적 수동 전체 점검은 snapshot에 `--manual true --scope all`을 사용하고 정기 달력의 가짜 시작/종료를 만들지 않는다. 수동 담당 점검은 해당 scope와 `--manual true`를 사용한다. snapshot은 로잔 조직·비삭제 전체 페이지·정확 건수·조직 설정을 읽는다. 현재 UI 순수 선택 함수를 소스에서 컴파일하며 조회만 한다. 고객 자료를 테스트용으로 변경하지 않는다.

initial.private.json과 required.private.json의 모든 대상을 확인한다. decisions.private.json은 빈 판단 템플릿이다. 조회 성공을 기관 확인·고객 업무 완료로 해석하지 않는다.

## 검사 담당

UI와 같은 검사 회차·여행지별 전염병 행 및 상태 함수를 적용한다. 케이스 수와 검사 행 수를 구분한다. 미래 검사일은 예정, 누락 날짜는 추정 금지. waiting이며 검사일에서 달력일 5일 이상이면 매일 보고한다(당일=0, 5일째 포함). testing은 이 지연에 넣지 않는다. 결과 등록과 미완료 상태의 차이는 원본·현재 회차와 대조하고, 공통 권한의 결과 확인 완료 위임에 해당하면 해당 회차를 완료·직접 재조회한다. 확인 불가·불일치는 경고와 다음 행동을 보고하며 별도 지시 대기로 미루거나 완료로 추정하지 않는다. 지연 사실만으로 신청·결제·진행 전환을 하지 않는다. 사용자 지정 제외는 실제 정보 지문이 같을 때만 적용한다.

검사기관 접수·진행·결과·청구 관련 메일과 결과 안내 원본·큐를 검토하고 inspectionMail과 resultNotices에 실제 근거를 남긴다. 일본 검역소 메일 전체를 대신 검토하지 않는다.

## 일본 수입신고 담당

현재 신고 탭의 일본 여행 토큰 전체 수입·수출 슬롯을 각각 읽는다. 활성 여행은 화면 건수 확인용이며 다른 여행을 가리지 못한다. 출국일 경과·한쪽 완료·새 메일 없음으로 제외하지 않는다. 일본 외 신고는 서류 및 기타 담당의 documents scope로 검증한다.

- 대기: 실제 미제출, 자료·판단·로그인 장애, 이전 지시 중단 여부 확인.
- 진행: 실제 신청번호, 현재 회신·발신, 승인/예약 확정, 승인서 파일 후속 작업 확인.
- 승인과 파일 보관은 구분하며 수출 확정은 별도 근거로 판정한다. [일본 스킬](../../petmove-japan-naccs/SKILL.md)을 따른다.
- 기한 경고·불일치·중단 지시를 필수 보고한다. 기존 개별 지시는 중복 조회 후 재개하고 막히면 이유·다음 행동을 보고한다.

일본 메일과 실제 SENT는 mail, 모든 Form AC 21일 대상·기발송·현재 명시 요청은 formAc에 별도로 검토 근거를 남긴다. Form AC 제출은 일반 서류 담당과 중복 실행하지 않는다.

## 서류 및 기타 담당

여행별 출국일·내원일·내원가능일·준비상태·메모·날짜 구간을 확인한다. **출국 0~14일 전인데 내원일이 없으면 매일 경고·보고**하고 [예약 요청 안내](../../petmove-daily-review/references/visit-booking.md)를 준비한다. **내원 당일~7일 이내(0~7일 포함) 준비 미완료도 매일 보고**한다. 미래 출국이 남은 내원일 경과 미완료도 보고한다. 출국일 없는 과거 내원을 임박 업무로 만들지 않는다. Form AC 발신·사전 검토 통과는 최종 준비 완료가 아니다. PDF를 열지 않았으면 원본 검토 완료라고 쓰지 않는다.

일반 자료·서류·일본 외 기관 요청은 documentSources, 내원 예약 필요·기발송·예약 회신은 visitBookings에 검토 근거를 남긴다. 검사결과 판정·결과 고객 안내는 검사 담당, 일본 검역소 회신·Form AC 제출은 일본 담당이다.

## 담당의 소스와 중단 지시

일본 메일은 수신·실제 SENT·현재 본문·후속 페이지·기존 미완료와 대조한다. 검색 기간을 겹치고 ID로 중복 제거하며 미검토 메일을 남긴 채 기준 시각을 앞당기지 않는다. Form AC 21일 대상 전체와 기발송을 확인한다. 미지원 요청은 이유·자료·기한·필요 판단을 보고한다.

[결과 안내 스킬](../../petmove-kakao-results/SKILL.md)의 전체 첨부 스냅샷·원본·연락 할 일·실제 발송을 대조한다. 고객 자동 발송은 금지다. 신규 첨부를 미확인 채 seen으로 넘기지 않는다.

각 담당은 위 표의 소스를 검토한다. 위 일본 메일·결과 안내 설명은 해당 담당에만 적용하며 all일 때만 모두 수행한다. pending, manualNaccsContinuation.remaining, delegatedTasks의 담당 분류를 대조한다. 중단 지시를 완료/취소 근거 없이 삭제·기보고 대기로 숨기지 않는다. 새 요구·오류·결과 안내 후보 등 추가 발견은 종료 스냅샷 findings에 `key,caseId,orgId,destination,pet,guardian,reason,workArea`로 넣어 검증 대상에 포함한다.

## 종료 조회와 판단

최신 공유 이력을 다시 읽고 종료 스냅샷을 만든다. 시작 목록은 보존한다.

```powershell
node scripts/daily-review.mjs snapshot --dir $reviewDir --id $automationId --scope $scope --history <종료 시 현재 실행 전용 공유 사본 경로> --phase final
```

required.private.json은 시작·종료 합집합이다. 모든 ID에 판단을 붙이며 새 ID도 decisions.private.json.items에 추가한다.

| 필드 | 필수 근거 |
| --- | --- |
| disposition=reported | 미완료/경고의 nextAction, 현재 evidence |
| disposition=resolved | 처리 결과 nextAction, evidence, 실제 실행·저장 재조회 resolutionEvidence. 처리 결과도 보고됨 |
| disposition=unchanged | 일반 대기만 허용. 실제 과거 보고 지문·reportedAt·deliveryEvidence와 이번 recheckedAt/evidence/nextAction 필요. 경고·중단 지시·일일 필수 건은 금지 |
| needsUserAction=true | 자료·판단·인증이 필요하면 표시. 종료는 needs_attention |
| reviews의 담당별 필수 소스 | 위 scope 표의 각 항목에 complete=true, checkedAt, evidence. 실제 전체 원문·첨부·페이지·발신 대조 근거이며 미검토를 true로 표시하지 않음 |

```powershell
node scripts/daily-review.mjs render --dir $reviewDir
```

실패하면 누락을 해결한다. report.private.md는 모든 필수 행·처리 결과를 담은 사용자 보고 원문이다. coverage.private.json은 같은 보고의 ID·지문·시각·해시다. visit-booking-candidates.private.json의 미예약 대상도 공유 visitBookingNoticeQueue에 병합하며 기존 문구 승인·발송 이력을 보존한다. 몇 건만 골라 다시 요약하지 않는다.

보고 파일 생성은 실제 알림 전달의 근거가 아니다. 다음 실행 시작에 담당 채팅의 실제 이전 사용자 알림을 재조회하고 해당 항목이 포함된 메시지·시각 근거를 initial.priorReports의 deliveryEvidence에 기록한다. 이를 공유 dailyReviewCoverage.byArea[scope].reportedItems에도 병합한다. 전달을 확인할 수 없으면 일반 대기도 기보고로 숨기지 않는다. 이번 생성 파일에 전달 근거를 미리 만들지 않는다.

## 공유 저장과 완료 차단

동시 시작이므로 시작·종료의 공유 원본은 각 실행 폴더로 내려받는다. 공용 로컬 파일을 세 실행의 입력·출력으로 동시에 덮어쓰지 않는다.

공유 저장 직전 `node scripts/review-lock.mjs acquire --key history --owner <현재 runId>`로 잠금을 얻는다. 종료 코드 2 또는 acquired=false면 저장하지 말고 30초 이내 간격으로 다시 확인한다. 사용자에게 상태를 알리면서 최대 10분 대기 후에도 막히면 needs_attention으로 기록한다. 남의 잠금·중단 흔적을 지우거나 소유자를 사칭하지 않는다.

잠금 획득 **후** Drive 최신 메타데이터·원본을 다시 읽는다. 자기 실행의 항목별 변경만 병합하고 다른 담당 기록과 모든 기존 필드를 보존한다. coverage.private.json은 dailyReviewCoverage.byArea[scope]에 저장한다. all의 수동 전체 점검만 기존 dailyReviewCoverage의 최상위 coverage 필드를 갱신하고 byArea는 보존한다. 같은 파일 ID를 갱신한 뒤 원본을 실행 폴더 history-verified.private.json으로 재조회하고 업로드 사본과 바이트/해시를 대조한다. 마지막에 `node scripts/review-lock.mjs release --key history --owner <현재 runId>`로 해제한다. 원격 충돌·저장 실패 시 로컬 변경을 남기며 완료를 추정하지 않는다.

고객 케이스 수정·기관 제출·발송 전에는 같은 방식으로 `--key case:<caseId>` 잠금을 얻고 Work·기관·발신을 다시 조회한다. 저장·제출 결과를 확인한 뒤 해제한다. 케이스 잠금을 보유한 채 다른 케이스 잠금을 기다리지 않으며, history 잠금을 보유한 채 케이스 잠금을 얻지 않는다. 실제 처리 중단으로 잠금이 남으면 다른 실행은 강제로 가져오지 말고 재개 위치와 소유 실행 확인 필요를 보고한다.

```powershell
node scripts/daily-review.mjs complete --dir $reviewDir
node scripts/automation-calendar.mjs finish --id $automationId --status succeeded --summary "담당 실무 점검 및 보고 누락 검증 완료" --review-dir $reviewDir
```

complete 통과·사용자 조치 대기 없음일 때만 성공을 기록한다. 달력은 현재 실행 ID·한국 날짜·종료 조회 신선도·전체 대상·필수 판단·입력/보고/공유 이력 해시를 다시 검증한다. 오류면 failed, 사용자 대기면 needs_attention, 업무를 하지 않은 기기/요일 생략만 skipped다. 누락 실패를 skipped로 바꾸지 않는다. 고객 정보는 달력에 보내지 않는다.

최종 응답에는 검증된 보고 원문을 빠짐없이 사용한다. 필수 보고가 없고 일반 대기도 실제 기보고 근거로 조용히 처리할 수 있을 때만 DONT_NOTIFY다. 일부 미조회·원격 충돌·검증 실패는 전체 완료가 아니다. 점검 실행 완료와 모든 고객 업무 완료를 구분한다.

회귀 검증: `node scripts/check-daily-review.mjs`.
