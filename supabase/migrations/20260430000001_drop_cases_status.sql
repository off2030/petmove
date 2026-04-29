-- cases.status 컬럼 제거
-- 코드/UI/타입에서 status 참조를 모두 제거함에 따라 컬럼·인덱스·제약을 정리.
-- 비가역적이므로 운영 데이터를 백업했는지 확인 후 적용할 것.

alter table cases drop constraint if exists cases_status_check;
drop index if exists cases_status_idx;
alter table cases drop column if exists status;
