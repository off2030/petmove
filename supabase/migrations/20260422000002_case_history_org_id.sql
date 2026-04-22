-- Phase 4: case_history 에 org_id 컬럼 추가 + cases 로부터 백필 + NOT NULL.
-- Phase 5 에서 RLS 활성화 시 cases 조인 없이 직접 org 필터 가능.

-- 1) 컬럼 추가 (nullable 로 시작)
alter table public.case_history
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- 2) cases.org_id 로 백필
update public.case_history ch
   set org_id = c.org_id
  from public.cases c
 where ch.case_id = c.id
   and ch.org_id is null;

-- 3) null 없는지 확인 — 있으면 이 단계에서 에러 발생 (정책: 고아 case_history 는 없어야 함)
do $$
declare
  v_null_count int;
begin
  select count(*) into v_null_count from public.case_history where org_id is null;
  if v_null_count > 0 then
    raise exception 'case_history 에 org_id null 행 % 개 남음 — cases 에 없는 case_id 참조', v_null_count;
  end if;
end $$;

-- 4) NOT NULL 강제
alter table public.case_history
  alter column org_id set not null;

-- 5) 인덱스
create index if not exists case_history_org_idx on public.case_history (org_id);

-- 결과 확인
select count(*) as total, count(distinct org_id) as distinct_orgs
  from public.case_history;
