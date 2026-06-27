-- =============================================================================
-- A안: 케이스↔보호자 소유권을 user_id 링크로 영구화 — 이메일 변경이 링크를 끊지 않게.
--
-- 배경: 20260605000001 이 link_case_to_customers 트리거에 "이메일 변경 시 옛
-- email-match 링크 삭제" 블록을 넣었다. 그 결과 정당한 편집인데도 보호자 소유권이
-- 끊겼다:
--   - 고객이 앱에서 연락 이메일을 바꾸면 → cases.data.email 전파 → 옛 링크 삭제 →
--     "내 케이스"에서 동물이 사라짐(로그아웃 후 재로그인 시 확인됨).
--   - 관리자가 펫무브워크에서 케이스 이메일을 (서류용 진짜 이메일 등으로) 고치면 →
--     마찬가지로 끊김. 특히 Apple "이메일 가리기" 고객은 email_normalized 가 릴레이
--     주소라, 관리자가 진짜 이메일로 고치는 순간 user_id 가 영구 분리됐다.
--
-- 수정(A안): 소유권은 한번 연결되면 user_id 로 고정. 트리거를 다시 "추가 전용"으로 —
-- 이메일이 일치하는 보호자를 INSERT 만 하고, 어떤 링크도 DELETE 하지 않는다.
-- (20260519000005 의 원래 함수 동작으로 회귀.)
--   - 소유권 "제거/재배정" 은 관리자 명시 액션(case_customer_links DELETE, org 멤버
--     RLS 허용)으로만. 이메일 편집의 부수효과로 끊지 않는다.
--   - 고객의 연락 이메일 편집은 cases.data.email(매칭키)을 더는 건드리지 않는다
--     (apps/portal applyGuardianToCase 에서 email 전파 제거) — 추가 전용 트리거에서
--     생길 수 있는 "남의 로그인 이메일로 바꿔 타인 자동 링크" 누수를 차단.
--
-- 파괴적 백필 없음 — 기존 링크는 모두 보존. (20260605 의 1회성 삭제로 이미 끊긴
-- 링크는 복구하지 않는다 — 잘못된 재링크 위험. 필요 시 관리자 수동 링크로 처리.)
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
  -- A안: INSERT 만 — 기존 링크는 절대 DELETE 하지 않는다 (소유권 영구화).
  insert into public.case_customer_links (case_id, user_id, linked_via)
  select new.id, cp.user_id, 'email-match'
  from public.customer_profiles cp
  where cp.email_normalized = case_email
  on conflict (case_id, user_id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
