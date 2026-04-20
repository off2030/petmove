-- 단일행 key-value 설정 저장소. 회사/수의사 정보 등 글로벌 설정용.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- 인증된 사용자만 읽기/쓰기.
create policy "app_settings_read"
  on app_settings for select
  to authenticated
  using (true);

create policy "app_settings_write"
  on app_settings for all
  to authenticated
  using (true)
  with check (true);
