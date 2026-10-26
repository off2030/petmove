# 자동화 달력

홈페이지 `https://www.petmove.co.kr/admin/`에서 관리자 접속키로 로그인한다. 월간 달력과 작업 목록에서 한국 시간으로 예약을 확인하고, 날짜를 선택해 실제 시작·종료 기록을 확인한다. 짧은 반복 작업은 하루 한 줄로 묶는다.

## 기록의 의미

- 예약은 원래 Codex 설정과 GitHub Actions cron을 읽어 표시한다. 달력에서 예약을 변경하지 않는다.
- 실제 실행 기록이 없으면 완료로 추정하지 않는다. 과거 Codex 실행 기록은 생성하지 않는다.
- GitHub의 실제 실행 이력은 최초 동기화에서 작업별 최근 15회를 가져오며 이후 시작·종료 시 보고한다.
- 이 달력에는 자동화 메타데이터만 저장한다. 고객 이름·동물·첨부파일·검사·신고 상태를 올리지 않는다. 공식 업무 상태는 펫무브워크를 직접 조회한다.
- 현재 연결 범위는 업무 PC의 펫무브 Codex 예약 2개와 저장소 GitHub 정기 작업 2개다. 다른 PC 예약은 해당 PC에서 연결하기 전까지 확인된 일정으로 간주하지 않는다.

## 업무 PC 연결

로컬 비밀 파일은 `%USERPROFILE%\.codex\automation-calendar\`에 있으며 Git으로 공유하지 않는다. `admin-access.txt`는 사용자의 관리자 접속키, `reporter.json`은 보고용 연결 설정이다. 로그인 키와 보고용 토큰은 다르다.

예약 동기화:

```powershell
node scripts/automation-calendar.mjs sync
```

자동화 프롬프트는 실행 전 `start`, 종료 전에 `finish`를 호출한다. 기존 업무 지시·제출/발송 권한은 그대로 적용한다.

```powershell
node scripts/automation-calendar.mjs start --id 31
node scripts/automation-calendar.mjs finish --id 31 --status succeeded --summary "예약 작업 확인 완료"
```

`--id`는 원래 Codex 예약 ID다. 종료 상태는 `succeeded`, `failed`, `skipped`, `needs_attention` 중 선택한다. 사용자 응답이나 승인 대기 시 `needs_attention`으로 이번 실행을 종료하고, 다시 시작되면 새 실행으로 기록한다. 강제 종료로 `run-<id>.json`이 남으면 실제 실행이 종료됐는지 확인한 후 `finish`로 정리한다. 시작 시각을 추정하거나 중복 실행하지 않는다.

보고 실패 시 로컬 `outbox`에 메타데이터를 보관한다. 다음 `sync` 또는 `start`에서 재전송한다. 실패한 기록을 완료로 바꾸지 않는다. 업무 권한과 업무 실행 판단은 원래 지침을 따른다.

다른 PC도 최신 저장소와 Node.js, 별도로 전달받은 보고 설정이 필요하다. `reporter.json`의 `hostId`를 고유하게 하고 `hostLabel`에 실제 기기를 적는다. 해당 PC에서 먼저 `sync`한 뒤 그 예약의 원래 프롬프트에 같은 시작·종료 지시를 연결한다. 예약 변경·중지 후에도 `sync`해 반영한다. 자동화는 해당 로컬 실행 환경이 작동해야 실제 실행될 수 있다.

## 저장소와 운영 환경

홈페이지 서버 환경변수: `WWW_ADMIN_ACCESS_KEY_HASH`, `WWW_ADMIN_SESSION_SECRET`, `AUTOMATION_REPORT_TOKEN_HASH`, `AUTOMATION_CALENDAR_DB_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.

GitHub의 `deploy-www.yml`은 홈페이지 배포용 프로젝트 ID와 위 비밀값을 사용한다. 공개 Supabase 설정은 GitHub에서 `WWW_SUPABASE_URL`, `WWW_SUPABASE_PUBLISHABLE_KEY`라는 이름으로 구분한다. `AUTOMATION_REPORT_TOKEN`은 보고하는 정기 workflow에만 전달한다. 홈페이지에는 Supabase service-role 키를 배포하지 않는다.

`automation_calendar_schedules`, `automation_calendar_runs` 두 테이블은 RLS로 제한하며, 달력 전용 DB 키는 이 두 테이블의 조회·기록만 허용한다. 해시는 private 스키마에 저장한다. 관리자 화면과 데이터 API는 로그인 여부를 각각 검증하고 비공개 캐시 정책과 검색 제외 정책을 적용한다.

접속키 교체 시 새 해시와 세션 비밀값을 GitHub secrets 및 운영 환경변수에 반영하고 홈페이지를 재배포한다. 로컬 비밀 파일도 별도로 갱신한다. 이전 세션은 무효화된다. 보고용 토큰·DB 키는 접속키와 독립적으로 교체한다.

## 검증

`pnpm tsx scripts/check-automation-calendar.ts`로 한국 시간 변환, 반복 일정, 입력 검증, 접속키·세션 만료/변조/교체, 교차 출처 요청 차단을 확인한다. 실제 고객 데이터는 테스트에 사용하지 않는다.
