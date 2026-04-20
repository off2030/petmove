-- 단일 사용자 앱이므로 cases 테이블과 같이 RLS 를 비활성화.
-- (다른 테이블도 RLS 미사용. 인증 강제 시 따로 도입.)
alter table app_settings disable row level security;
