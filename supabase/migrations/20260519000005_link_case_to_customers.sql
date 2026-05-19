-- =============================================================================
-- 케이스 ↔ 보호자 자동 링크 트리거 — 신규/이메일변경 케이스를 즉시 연결.
--
-- 배경: portal "내 케이스"(listMyCases)는 case_customer_links 에 row 가 있는
-- 케이스만 보여준다. 그런데 그 링크를 만드는 autoLinkCasesByEmail 은 portal
-- "로그인 시점"에만 1회 스윕한다 — 사용자의 마지막 로그인 이후 생성된 케이스는
-- 다음 로그인(또는 backfill 스크립트) 전까지 "내 케이스"에 안 보였다.
--
-- 트리거 cases_link_customers (AFTER INSERT OR UPDATE OF data):
--   케이스의 data.email 이 customer_profiles.email_normalized 와 일치하면
--   case_customer_links 에 linked_via='email-match' 로 INSERT. 로그인과 무관.
--   - 이메일 정규화: lower(btrim(...)) — 양쪽 모두. autoLinkCasesByEmail 의
--     "케이스쪽 원본 비교" asymmetry(대문자 미스)도 이 경로에선 해소된다.
--   - UPDATE 는 data.email 이 실제로 바뀐 경우만 (co_progress cascade 등 무관
--     UPDATE 에서 헛돌지 않게).
--   - 소프트 삭제 케이스는 제외. 한 이메일에 보호자 여러 명(가족)이면 모두 링크.
--   - 멱등 — PK(case_id,user_id) 충돌 무시.
--   - SECURITY DEFINER — customer_profiles 조회 + case_customer_links INSERT 가
--     RLS(self-only / org-member-only)를 우회해야 하므로.
--
-- 가입(보호자 신규) 방향은 기존 autoLinkCasesByEmail(로그인 콜백)이 그대로 담당.
-- 이 트리거는 "신규 케이스" 방향만 추가로 메운다.
--
-- 마지막의 1회성 백필로 기존 미링크 케이스(예: 마지막 로그인 후 생성분)도 정리.
-- =============================================================================

create or replace function public.link_case_to_customers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  case_email text;
begin
  -- 케이스 이메일 정규화 — customer_profiles.email_normalized(=lower(email)) 와 동일 기준.
  case_email := lower(btrim(coalesce(new.data ->> 'email', '')));
  if case_email = '' then
    return new;
  end if;

  -- 소프트 삭제된 케이스는 링크하지 않음 (listMyCases 가 deleted_at 필터).
  if new.deleted_at is not null then
    return new;
  end if;

  -- UPDATE 는 data.email 이 실제로 바뀐 경우만 — co_progress cascade 등
  -- email 과 무관한 data UPDATE 에서 헛돌지 않게.
  if tg_op = 'UPDATE'
     and case_email = lower(btrim(coalesce(old.data ->> 'email', ''))) then
    return new;
  end if;

  -- 이메일이 일치하는 모든 보호자를 email-match 로 링크 (가족 다인 가능). 멱등.
  insert into public.case_customer_links (case_id, user_id, linked_via)
  select new.id, cp.user_id, 'email-match'
  from public.customer_profiles cp
  where cp.email_normalized = case_email
  on conflict (case_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists cases_link_customers on public.cases;
create trigger cases_link_customers
  after insert or update of data on public.cases
  for each row
  execute function public.link_case_to_customers();

-- ─────────────────────────────────────────────────
-- 1회성 백필 — 기존 미링크 케이스를 이메일 일치 보호자에 연결.
-- 멱등 (ON CONFLICT DO NOTHING) — 재실행해도 안전.
-- ─────────────────────────────────────────────────
insert into public.case_customer_links (case_id, user_id, linked_via)
select c.id, cp.user_id, 'email-match'
from public.cases c
join public.customer_profiles cp
  on cp.email_normalized = lower(btrim(coalesce(c.data ->> 'email', '')))
where c.deleted_at is null
  and btrim(coalesce(c.data ->> 'email', '')) <> ''
on conflict (case_id, user_id) do nothing;
