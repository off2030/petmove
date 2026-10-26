-- 자동화 메타데이터만 저장한다. 고객·동물·검사·신고 테이블과 연결하지 않는다.
create schema if not exists private;
create table if not exists private.automation_calendar_keys (
  id boolean primary key default true check (id),
  token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$')
);
alter table private.automation_calendar_keys enable row level security;
revoke all on private.automation_calendar_keys from public, anon, authenticated;

-- 홈페이지에는 service_role 키를 배포하지 않는다. 별도 키는 이 두 테이블만 허용한다.
create or replace function private.automation_calendar_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.automation_calendar_keys k
    where k.token_sha256 = encode(extensions.digest(
      coalesce(current_setting('request.headers', true)::jsonb ->> 'x-calendar-key', ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.automation_calendar_allowed() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.automation_calendar_allowed() to anon, authenticated;

create table if not exists public.automation_calendar_schedules (
  id text primary key check (length(id) between 1 and 180),
  name text not null check (length(name) between 1 and 180),
  category text not null check (category in ('content','operations','system')),
  source text not null check (source in ('codex','github')),
  host text not null check (length(host) between 1 and 80),
  schedule_kind text not null check (schedule_kind in ('rrule','cron')),
  schedule_expression text not null check (length(schedule_expression) between 1 and 400),
  timezone text not null check (timezone in ('Asia/Seoul','UTC')),
  state text not null check (state in ('ACTIVE','PAUSED','UNKNOWN')),
  description text not null default '' check (length(description) <= 800),
  source_url text check (source_url is null or length(source_url) <= 400),
  synced_at timestamptz not null default now()
);
create table if not exists public.automation_calendar_runs (
  id text primary key check (length(id) between 1 and 200),
  schedule_id text not null references public.automation_calendar_schedules(id),
  state text not null check (state in ('running','succeeded','failed','skipped','needs_attention')),
  started_at timestamptz not null,
  ended_at timestamptz,
  reported_at timestamptz not null default now(),
  summary text not null default '' check (length(summary) <= 600),
  source_url text check (source_url is null or length(source_url) <= 400),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists automation_calendar_runs_started_idx on public.automation_calendar_runs(started_at desc);
create index if not exists automation_calendar_runs_schedule_idx on public.automation_calendar_runs(schedule_id, started_at desc);
alter table public.automation_calendar_schedules enable row level security;
alter table public.automation_calendar_runs enable row level security;
revoke all on public.automation_calendar_schedules, public.automation_calendar_runs from public, anon, authenticated;
grant select, insert, update on public.automation_calendar_schedules, public.automation_calendar_runs to anon;
create policy automation_schedule_read on public.automation_calendar_schedules for select to anon using ((select private.automation_calendar_allowed()));
create policy automation_schedule_insert on public.automation_calendar_schedules for insert to anon with check ((select private.automation_calendar_allowed()));
create policy automation_schedule_update on public.automation_calendar_schedules for update to anon using ((select private.automation_calendar_allowed())) with check ((select private.automation_calendar_allowed()));
create policy automation_run_read on public.automation_calendar_runs for select to anon using ((select private.automation_calendar_allowed()));
create policy automation_run_insert on public.automation_calendar_runs for insert to anon with check ((select private.automation_calendar_allowed()));
create policy automation_run_update on public.automation_calendar_runs for update to anon using ((select private.automation_calendar_allowed())) with check ((select private.automation_calendar_allowed()));
