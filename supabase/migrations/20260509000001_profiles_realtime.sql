-- 봇 (또는 사용자) 의 name/avatar_url 변경이 메시지 모듈 헤더·목록에 즉시 반영되려면
-- profiles 테이블이 supabase_realtime publication 에 등록되어 있어야 함. 등록 안 된
-- 환경에서 idempotent 하게 추가.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END$$;
