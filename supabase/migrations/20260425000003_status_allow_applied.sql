-- status 값을 영문 5종으로 통일
-- 기존 한글 값(진행중/완료/보류/취소) 행은 영문으로 마이그레이션 후 제약 교체.
-- 순서: 제약 drop → 데이터 update → 새 제약 add (UPDATE 가 새 값을 쓰려면 기존 제약을 먼저 풀어야 함).

-- 1) 기존 제약 제거
alter table cases drop constraint cases_status_check;

-- 2) 기존 한글 데이터 → 영문 매핑
update cases set status = 'In Progress' where status = '진행중';
update cases set status = 'Completed'   where status = '완료';
update cases set status = 'On Hold'     where status = '보류';
update cases set status = 'Cancelled'   where status = '취소';
update cases set status = 'Applied'     where status = '신규';
update cases set status = 'Applied'     where status = 'applied';

-- 3) 새 영문 제약
alter table cases add constraint cases_status_check
  check (status in ('Applied','In Progress','Completed','On Hold','Cancelled'));

-- 4) 기본값 변경
alter table cases alter column status set default 'Applied';
