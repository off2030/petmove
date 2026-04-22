-- Phase 7 후속 정리: app_settings 테이블 제거.
-- Phase 7 에서 organization_settings 로 이관 완료 + 앱 코드 전환 완료 + 프로덕션 검증 완료.
-- 이후 app_settings 는 dead data/schema — 안전하게 drop.

-- 완전 idempotent 하게: 테이블이 있을 때만 policy drop 시도 (drop policy 는
-- 테이블 참조 자체를 resolve 하려 하기 때문에 table 부재 시 42P01 에러를 냄).
do $$
begin
  if exists (select 1 from pg_class where relname = 'app_settings' and relnamespace = 'public'::regnamespace) then
    execute 'drop policy if exists app_settings_select on public.app_settings';
    execute 'drop policy if exists app_settings_write on public.app_settings';
    execute 'drop policy if exists "app_settings_read" on public.app_settings';
    execute 'drop policy if exists "app_settings_write" on public.app_settings';
  end if;
end $$;

drop table if exists public.app_settings;
