-- 조직별 자동 채움 규칙: trigger 필드가 입력되면 target 필드를 offset 일수만큼
-- 자동으로 채움. 케이스 저장 시 backend 에서 적용.
-- 예: 호주 출국일 입력 → 내원일을 출국일-2 로 자동 입력

create table if not exists public.org_auto_fill_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  destination_key text not null,           -- 'australia', 'us_hawaii', 'all' (모든 목적지) 등
  trigger_field text not null,             -- 'departure_date', 'vet_visit_date' 등
  target_field text not null,              -- 'vet_visit_date', 'parasite_internal_dates' 등
  offsets_days int[] not null,             -- [-2] 단일, [-28, -2] 같이 여러 entry
  overwrite_existing boolean not null default false,
  enabled boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_auto_fill_rules_org_id_idx
  on public.org_auto_fill_rules (org_id);

create index if not exists org_auto_fill_rules_lookup_idx
  on public.org_auto_fill_rules (org_id, destination_key, trigger_field) where enabled = true;

-- updated_at 자동 갱신
create or replace function public.touch_org_auto_fill_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_org_auto_fill_rules_updated_at on public.org_auto_fill_rules;
create trigger trg_org_auto_fill_rules_updated_at
  before update on public.org_auto_fill_rules
  for each row execute function public.touch_org_auto_fill_rules_updated_at();

-- ───── RLS ─────
alter table public.org_auto_fill_rules enable row level security;

drop policy if exists org_auto_fill_rules_select on public.org_auto_fill_rules;
create policy org_auto_fill_rules_select on public.org_auto_fill_rules
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists org_auto_fill_rules_insert on public.org_auto_fill_rules;
create policy org_auto_fill_rules_insert on public.org_auto_fill_rules
  for insert with check (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists org_auto_fill_rules_update on public.org_auto_fill_rules;
create policy org_auto_fill_rules_update on public.org_auto_fill_rules
  for update using (public.is_org_admin(org_id) or public.is_super_admin())
  with check (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists org_auto_fill_rules_delete on public.org_auto_fill_rules;
create policy org_auto_fill_rules_delete on public.org_auto_fill_rules
  for delete using (public.is_org_admin(org_id) or public.is_super_admin());
