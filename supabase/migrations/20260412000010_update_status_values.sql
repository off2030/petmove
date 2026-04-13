-- Remove '신규' from status, update constraint
-- All existing '신규' rows already migrated to '진행중' via script

alter table cases drop constraint cases_status_check;
alter table cases add constraint cases_status_check
  check (status in ('진행중','완료','보류','취소'));

-- Update default
alter table cases alter column status set default '진행중';
