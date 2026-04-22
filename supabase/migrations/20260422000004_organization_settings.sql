-- Phase 7: organization_settings 분리. 기존 app_settings 를 org 별 키값 저장소로 재구성.
-- app_settings 테이블은 당분간 유지 (다음 phase 에서 제거). 앱 코드는 이 마이그레이션 이후 배포되는 코드에서 organization_settings 만 사용.

create table if not exists public.organization_settings (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

create index if not exists organization_settings_org_idx on public.organization_settings (org_id);

-- updated_at 자동 갱신
create or replace function public.touch_organization_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organization_settings_updated_at on public.organization_settings;
create trigger organization_settings_updated_at
  before update on public.organization_settings
  for each row execute function public.touch_organization_settings_updated_at();

-- RLS: 본인 org 만, super_admin 예외
alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists organization_settings_write on public.organization_settings;
create policy organization_settings_write on public.organization_settings
  for all using (public.is_org_member(org_id) or public.is_super_admin())
  with check (public.is_org_member(org_id) or public.is_super_admin());

-- 기존 app_settings → organization_settings 로 이관 (로잔 org 로 할당). Idempotent.
insert into public.organization_settings (org_id, key, value, updated_at)
select '00000000-0000-0000-0000-000000000001', key, value, updated_at
  from public.app_settings
on conflict (org_id, key) do nothing;

-- 확인
select count(*) as migrated_rows from public.organization_settings;
