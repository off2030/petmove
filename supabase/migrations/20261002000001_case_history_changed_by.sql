-- case_history 에 변경한 사람(changed_by) 기록.
--
-- 2026-09 하리·채소가 실제 미검사인데 검사 탭에서 '완료'로 찍혔다. 이력엔 언제·무엇만
-- 있고 누가 했는지가 없어 경위 확인이 막혔다.
--
-- 앱 코드의 insert 는 로그인 사용자 세션 클라이언트라 auth.uid() 가 잡힌다. 코드 수정 없이
-- 모든 insert 경로(서버 액션·동시 진행 cascade 트리거 등)를 덮도록 BEFORE INSERT 트리거로 채운다.
-- 로그인 세션이면 auth.uid() 를 강제(클라이언트가 다른 사람으로 위장 불가), service role 등
-- 세션이 없으면 넘어온 값 유지(고객 공개 폼 = null).
--
-- 대시보드 SQL 에디터로 적용 — 재실행 안전(멱등).

alter table public.case_history
  add column if not exists changed_by uuid references auth.users(id) on delete set null;

create or replace function public.case_history_set_changed_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.changed_by := coalesce(auth.uid(), new.changed_by);
  return new;
end;
$$;

drop trigger if exists case_history_set_changed_by on public.case_history;
create trigger case_history_set_changed_by
  before insert on public.case_history
  for each row execute function public.case_history_set_changed_by();

create index if not exists case_history_changed_by_idx
  on public.case_history (changed_by, changed_at desc);
