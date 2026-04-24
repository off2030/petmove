-- 신청폼으로 새 케이스 INSERT 시 admin 브라우저가 즉시 받을 수 있도록
-- supabase_realtime publication 에 cases 테이블 추가.
-- 이미 추가돼 있으면 에러 무시.

do $$
begin
  alter publication supabase_realtime add table public.cases;
exception
  when duplicate_object then
    null;
end $$;
