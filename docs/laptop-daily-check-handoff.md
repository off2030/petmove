# 실무 실행 기기와 공유 이력

업무 대상·권한·보고는 [실무 운영 기준](work-management/operations.md), 매일 실행은 [정기 점검 스킬](../.agents/skills/petmove-daily-review/SKILL.md)을 따른다. 이 문서는 기기 제한과 이력 연결만 관리한다.

## 기기와 일정

| 기기 | 정책 |
| --- | --- |
| 업무 PC | 월·화·수·금·토 **오전 10시 30분, Asia/Seoul**, 기존 automation 예약 |
| 노트북 | 정기 실무 중지. 명시적 작업 지시 때만 수동 1회 |
| 목·일 또는 업무 PC 꺼짐 | 정기 실행·노트북 자동 이전 없음 |

밀린 예약도 실제 한국 요일·기기를 먼저 확인한다. 노트북 예약 실행은 고객 업무를 하지 않고 기존 실무 예약을 PAUSED로 저장·재조회한다. 새 예약·자동 재개는 하지 않는다. 이 PC에서 노트북 스케줄러에 접근하지 못하면 실제 중지 여부는 미확인으로 보고한다. Git 공유와 실제 예약 변경을 구분한다.

명시적 수동 1회는 요일 제한 없이 해당 범위만 수행하며 정기 예약 재개 권한이 아니다. 공유 이력 executionPolicy와 대조한다. 과거 목·일 노트북 담당·오후 1시 안내는 사용하지 않는다.

## 다른 기기 준비

최신 저장소를 pull하고 Codex 프로젝트로 연다. Node.js·의존성·Chrome 펫무브 프로필·기관 로그인·읽기 전용 조회 환경변수는 각 기기에 별도 준비한다. 비밀키·고객 자료는 Git으로 옮기지 않는다. 준비 완료만으로 예약을 활성화하지 않는다. 저장소 `.agents/skills/`가 스킬 기준이다.

## 비공개 공유 원본

- 계정: **lvmcfile@gmail.com**
- [PETMOVE 자동화 이력 폴더](https://drive.google.com/drive/folders/1e6MLQnV4Y7t4tA9qZ7UxUUzZktiPn3PL), ID `1e6MLQnV4Y7t4tA9qZ7UxUUzZktiPn3PL`
- [japan-mail-review.json](https://drive.google.com/file/d/1TC5PWYeBOsRiUzUc4kW3yDk5QpVWrxgf/view), ID `1TC5PWYeBOsRiUzUc4kW3yDk5QpVWrxgf`
- Drive 경로: `Petmove-Backups / 펫무브워크 / PETMOVE 자동화 이력`
- 로컬 사본: 저장소 루트 `work/naver-inquiries/japan-mail-review.json`(Git 제외)

파일 ID와 비공개 권한을 유지한다. 동명 원본 생성·권한 확대·다른 조직 과거 이력 삭제를 하지 않는다. 보조 이력은 Work 공식 상태를 대체하지 않는다.

## 시작 시 읽기

1. 정기·수동 실무 점검 전 연결된 Drive 도구로 위 계정·파일의 메타데이터와 최신 원본을 읽는다. 텍스트 fetch가 비면 raw-file 다운로드를 사용한다. 서명 URL은 비공개 사본 준비에만 쓰고 출력하지 않는다.
2. JSON·계정·기본 필드(checkedOn, account, reviewedMessageIds, pending, completed)를 검증한다. 기존 로컬 사본을 백업해 실제 메일/기관 근거와 대조한다. 수정 시각만으로 덮어쓰지 않는다.
3. pending, manualNaccsContinuation.remaining, delegatedTasks, kakaoResultNoticeQueue, visitBookingNoticeQueue, executionPolicy, dailyReviewCoverage를 이어받는다. 이전 스키마도 버리지 않는다. 새 중단 지시는 delegatedTasks에 원래 허용 범위와 재개 위치를 남긴다.

## 종료 시 병합·검증

1. 종료 직전 원격 메타데이터와 최신 JSON을 다시 읽는다. 다른 실행의 수정·처리 중 표시를 확인하고 무관한 항목·메시지 ID·기보고 근거를 보존해 병합한다.
2. 정기 점검의 coverage.private.json을 dailyReviewCoverage로 병합한다. 보고용 지문·조회시각은 확인 이력이며 독립적인 고객 상태가 아니다.
3. 같은 파일 ID를 Drive update_file의 원본 교체로 갱신한다. 원본을 다시 내려받아 업로드 파일과 바이트/해시 일치를 검증하고 로컬 사본을 갱신한다.
4. 실행 폴더 history-uploaded.private.json과 history-verified.private.json에 해당 원본을 보존한 뒤 daily-review complete를 실행한다. 스크립트가 Drive를 갱신한 것처럼 표현하지 않는다.
5. 충돌·접속 실패·원본 불일치면 덮어쓰기·동기화 완료 표시를 하지 않는다. 로컬 결과를 보존해 남은 단계와 필요한 조치를 보고한다. 백업은 같은 비공개 폴더의 고유 이름을 사용한다.

달력에는 [자동화 실행 메타데이터](work-management/automation-calendar.md)만 고객 정보 없이 저장한다. 고객 보고·후속 작업 근거는 위 비공개 공유 경로에 둔다.
