-- =============================================================================
-- 케이스 이메일 변경 시 옛 email-match 보호자 link 끊기.
--
-- 배경: 20260519000005 의 link_case_to_customers 트리거는 케이스 data.email 이
-- 바뀌면 새 이메일에 매칭되는 보호자에게만 link 를 INSERT 한다. 옛 이메일에
-- 매칭됐던 보호자의 link 는 그대로 남는다 — 그래서 admin 에서 보호자 이메일을
-- 다른 사용자로 옮겨도 portal "내 케이스"에서 사라지지 않는다.
--
-- 수정: UPDATE OF data 에서 이메일이 실제로 바뀌면, 그 케이스의 email-match link
-- 를 모두 삭제한 뒤 새 이메일에 매칭되는 보호자에게 재링크한다.
--   - linked_via in ('manual','share-token','phone-match') 는 보존.
--   - 한 이메일에 여러 보호자(가족) 도 일괄 정리·재생성.
--   - 이메일이 빈 문자열로 바뀐 경우(이메일 삭제)도 옛 email-match link 정리.
--
-- 1회성 백필로 현재 어긋난 email-match link(케이스 이메일과 보호자 이메일이
-- 일치하지 않는) 를 제거. 멱등.
-- =============================================================================

create or replace function public.link_case_to_customers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  case_email text;
  old_email text;
begin
  -- 케이스 이메일 정규화 — customer_profiles.email_normalized(=lower(email)) 와 동일 기준.
  case_email := lower(btrim(coalesce(new.data ->> 'email', '')));

  -- 소프트 삭제된 케이스는 link 작업 안 함 (listMyCases 가 deleted_at 필터).
  if new.deleted_at is not null then
    return new;
  end if;

  -- UPDATE: data.email 이 안 바뀌면 아무것도 안 함 (co_progress cascade 등 헛돌이 방지).
  -- 바뀌었으면 → 옛 email-match link 일괄 삭제 후 새 매칭 INSERT.
  if tg_op = 'UPDATE' then
    old_email := lower(btrim(coalesce(old.data ->> 'email', '')));
    if case_email = old_email then
      return new;
    end if;

    -- 옛 보호자(들) 와의 email-match 링크 제거. manual/share-token/phone-match 는 보존.
    delete from public.case_customer_links
    where case_id = new.id
      and linked_via = 'email-match';
  end if;

  -- 새 이메일이 빈 문자열이면 (이메일 삭제) — 위에서 옛 링크는 이미 정리됨, 추가 INSERT 없음.
  if case_email = '' then
    return new;
  end if;

  -- 새 이메일에 매칭되는 모든 보호자(가족 다인 가능) 에 email-match 로 링크. 멱등.
  insert into public.case_customer_links (case_id, user_id, linked_via)
  select new.id, cp.user_id, 'email-match'
  from public.customer_profiles cp
  where cp.email_normalized = case_email
  on conflict (case_id, user_id) do nothing;

  return new;
end;
$$;


-- ─────────────────────────────────────────────────
-- 1회성 백필 — 현재 어긋난 email-match link 정리.
--   케이스 data.email 과 보호자 email_normalized 가 일치하지 않는
--   email-match link 를 모두 삭제. manual/share-token/phone-match 는 보존.
-- ─────────────────────────────────────────────────
delete from public.case_customer_links l
using public.cases c, public.customer_profiles cp
where l.case_id = c.id
  and l.user_id = cp.user_id
  and l.linked_via = 'email-match'
  and cp.email_normalized is distinct from lower(btrim(coalesce(c.data ->> 'email', '')));

notify pgrst, 'reload schema';
