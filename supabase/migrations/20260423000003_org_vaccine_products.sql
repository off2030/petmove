-- 조직별 약품(백신·구충제) 재고 테이블 + RLS + 로잔 seed.
-- Phase 1: 설정 > 약품 관리 CRUD UI 용. lookup 함수들은 아직 JSON 유지 (Phase 2 에서 이전).

create table if not exists public.org_vaccine_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  vaccine text,
  product text,
  manufacturer text not null,
  batch text,
  expiry text, -- YYYY-MM-DD or YYYY-MM
  year int,
  weight_min numeric,
  weight_max numeric,
  size text,
  parasite_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_vaccine_products_org_id_idx
  on public.org_vaccine_products (org_id);

create index if not exists org_vaccine_products_org_category_idx
  on public.org_vaccine_products (org_id, category);

-- updated_at 자동 갱신 트리거
create or replace function public.touch_org_vaccine_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_org_vaccine_products_updated_at on public.org_vaccine_products;
create trigger trg_org_vaccine_products_updated_at
  before update on public.org_vaccine_products
  for each row execute function public.touch_org_vaccine_products_updated_at();

-- ───── RLS ─────
alter table public.org_vaccine_products enable row level security;

drop policy if exists org_vaccine_products_select on public.org_vaccine_products;
create policy org_vaccine_products_select on public.org_vaccine_products
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists org_vaccine_products_insert on public.org_vaccine_products;
create policy org_vaccine_products_insert on public.org_vaccine_products
  for insert with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists org_vaccine_products_update on public.org_vaccine_products;
create policy org_vaccine_products_update on public.org_vaccine_products
  for update using (public.is_org_member(org_id) or public.is_super_admin())
  with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists org_vaccine_products_delete on public.org_vaccine_products;
create policy org_vaccine_products_delete on public.org_vaccine_products
  for delete using (public.is_org_member(org_id) or public.is_super_admin());

-- ───── 로잔 seed ─────
-- packages/domain/src/data/vaccine-products.json 기준 2026-04-23 스냅샷.
-- 이미 seed 된 org 는 skip (idempotent).
do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from public.org_vaccine_products where org_id = rojan) then
    insert into public.org_vaccine_products
      (org_id, category, vaccine, product, manufacturer, batch, expiry, year, weight_min, weight_max, size, parasite_id)
    values
      -- rabies
      (rojan, 'rabies', 'Rabisin', null, 'Boehringer Ingelheim', 'E19623', '2025-01-06', 2023, null, null, null, null),
      (rojan, 'rabies', 'Rabisin', null, 'Boehringer Ingelheim', 'E59694', '2025-01-31', 2024, null, null, null, null),
      (rojan, 'rabies', 'Rabisin', null, 'Boehringer Ingelheim', 'F52512', '2026-06-15', 2025, null, null, null, null),
      (rojan, 'rabies', 'Rabisin', null, 'Boehringer Ingelheim', 'G98321', '2027-10-07', 2026, null, null, null, null),
      -- comprehensive_dog
      (rojan, 'comprehensive_dog', 'Canishot DHPPL', null, 'CAVAC', '323 DPL 02', '2025-06-07', null, null, null, null, null),
      (rojan, 'comprehensive_dog', 'Canishot DHPPL', null, 'CAVAC', '324 EDPL 07', '2026-04-09', null, null, null, null, null),
      (rojan, 'comprehensive_dog', 'Canishot DHPPL', null, 'CAVAC', '325 DPL 01', '2027-03-05', null, null, null, null, null),
      -- comprehensive_cat
      (rojan, 'comprehensive_cat', 'Nobivac 1-HCPCH', null, 'MSD Animal Health', '02071456C', '2025-10-13', null, null, null, null, null),
      (rojan, 'comprehensive_cat', 'Nobivac 1-HCPCH', null, 'MSD Animal Health', '02071481B', '2026-10-02', null, null, null, null, null),
      -- civ
      (rojan, 'civ', 'CaniFlu-Max', null, 'GCVP', '123CIV07Z', '2025-09-06', null, null, null, null, null),
      (rojan, 'civ', 'Fluvax H3N2', null, 'CAVAC', '324CNFL03', '2026-04-29', null, null, null, null, null),
      -- kennel_cough
      (rojan, 'kennel_cough', 'Vanguard B', null, 'Zoetis', '791956', '2028-01-12', null, null, null, null, null),
      -- parasite_combo_dog
      (rojan, 'parasite_combo_dog', null, 'NexGard Spectra', 'Boehringer Ingelheim', 'G97530', '2027-06', null, 1.35, 3.5, '1.35-3.5kg', 'nexgard_spectra_dog'),
      (rojan, 'parasite_combo_dog', null, 'NexGard Spectra', 'Boehringer Ingelheim', 'H22417', '2027-09', null, 3.5, 7.5, '3.5-7.5kg', 'nexgard_spectra_dog'),
      (rojan, 'parasite_combo_dog', null, 'NexGard Spectra', 'Boehringer Ingelheim', 'H26328', '2027-09', null, 7.5, 15, '7.5-15kg', 'nexgard_spectra_dog'),
      (rojan, 'parasite_combo_dog', null, 'NexGard Spectra', 'Boehringer Ingelheim', 'H11662', '2027-07', null, 15, 30, '15-30kg', 'nexgard_spectra_dog'),
      -- parasite_combo_cat
      (rojan, 'parasite_combo_cat', null, 'NexGard Cat Combo', 'Boehringer Ingelheim', 'G21637A', '2027-05', null, 0, 2.5, '~2.5kg', 'nexgard_cat_combo_cat'),
      (rojan, 'parasite_combo_cat', null, 'NexGard Cat Combo', 'Boehringer Ingelheim', 'G58432E', '2027-10', null, 2.5, 7.5, '2.5-7.5kg', 'nexgard_cat_combo_cat'),
      -- parasite_external_dog
      (rojan, 'parasite_external_dog', null, 'Frontline Plus', 'Boehringer Ingelheim', 'F74992C', '2026-12-31', null, null, null, null, 'frontline_plus_dog'),
      (rojan, 'parasite_external_dog', null, 'Frontline Plus', 'Boehringer Ingelheim', 'G20536B', '2027-05', null, 10, 20, '10-20kg', 'frontline_plus_dog'),
      (rojan, 'parasite_external_dog', null, 'Frontline Plus', 'Boehringer Ingelheim', 'F98640B', '2027-03', null, 20, 40, '20-40kg', 'frontline_plus_dog'),
      -- parasite_external_cat
      (rojan, 'parasite_external_cat', null, 'Frontline Spray', 'Boehringer Ingelheim', null, null, null, null, null, null, 'frontline_spray_cat'),
      -- parasite_internal_dog
      (rojan, 'parasite_internal_dog', null, 'Drontal Plus', 'Elanco', 'KV035S6', '2026-03-08', null, null, null, null, 'drontal_plus_dog'),
      (rojan, 'parasite_internal_dog', null, 'Drontal Plus', 'Elanco', 'KVO53HV', '2028-01-03', null, null, null, null, 'drontal_plus_dog'),
      -- heartworm_dog
      (rojan, 'heartworm_dog', null, 'Heartgard Plus (ivermectin 68mcg / pyrantel 57mg)', 'Boehringer Ingelheim', 'F94293', '2027-01', null, 0, 11, '~11kg', null),
      (rojan, 'heartworm_dog', null, 'Heartgard Plus (ivermectin 136mcg / pyrantel 114mg)', 'Boehringer Ingelheim', 'G33907', '2027-05', null, 11, 22, '11-22kg', null),
      (rojan, 'heartworm_dog', null, 'Heartgard Plus (ivermectin 272mcg / pyrantel 227mg)', 'Boehringer Ingelheim', 'G06564', '2027-03', null, 22, 45, '22-45kg', null);
  end if;
end $$;
