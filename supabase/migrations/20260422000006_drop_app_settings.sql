-- Phase 7 후속 정리: app_settings 테이블 제거.
-- Phase 7 에서 organization_settings 로 이관 완료 + 앱 코드 전환 완료 + 프로덕션 검증 완료.
-- 이후 app_settings 는 dead data/schema — 안전하게 drop.

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_write on public.app_settings;
drop policy if exists "app_settings_read" on public.app_settings;
drop policy if exists "app_settings_write" on public.app_settings;

drop table if exists public.app_settings;
