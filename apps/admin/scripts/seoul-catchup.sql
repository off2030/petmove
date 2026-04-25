
-- ====================================================
-- 20260423000001_org_business_number.sql
-- ====================================================

-- 조직에 사업자번호 컬럼 추가.
-- super-admin 조직 명부에서 UUID 대신 사업자번호로 식별.
-- 형식: 'XXX-XX-XXXXX' (10자리, 하이픈 포함) — 검증은 애플리케이션 레이어에서.

alter table public.organizations
  add column if not exists business_number text;

-- 로잔 seed
update public.organizations
   set business_number = '124-18-42859'
 where id = '00000000-0000-0000-0000-000000000001'
   and business_number is null;

-- ====================================================
-- 20260423000002_profiles_same_org_select.sql
-- ====================================================

-- 같은 org 에 속한 멤버끼리는 서로의 profile (email/name) 을 조회 가능하도록.
-- 증상: 설정 > 멤버 탭에서 본인 외 멤버가 email/name 공란으로 렌더링됨.
-- 원인: profiles_self_select 가 auth.uid() = id 혹은 super_admin 만 허용.
-- 해결: 동일 org 멤버십을 공유하는 경우에도 SELECT 허용하는 별도 PERMISSIVE 정책 추가.

create policy profiles_same_org_select on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.memberships m1
        join public.memberships m2 on m1.org_id = m2.org_id
       where m1.user_id = auth.uid()
         and m2.user_id = profiles.id
    )
  );

-- ====================================================
-- 20260423000003_org_vaccine_products.sql
-- ====================================================

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

-- ====================================================
-- 20260423000004_org_type.sql
-- ====================================================

-- 조직 유형 — 동물병원(hospital) 또는 운송회사(transport).
-- 운송회사는 자체 수의사가 없고 제휴 병원 정보를 입력해 PDF 에 사용.

alter table public.organizations
  add column if not exists org_type text not null default 'hospital';

alter table public.organizations
  drop constraint if exists organizations_org_type_check;

alter table public.organizations
  add constraint organizations_org_type_check
  check (org_type in ('hospital','transport'));

-- ====================================================
-- 20260423000005_merge_owner_admin.sql
-- ====================================================

-- Phase 14: owner/admin 역할 통합 → 2-tier 시스템 (admin, member)
-- 실질적으로 owner == admin 이었으므로 (is_org_admin 이 둘 다 true 반환) 의미론 정리.
-- 추가: admin 은 자기 조직 memberships 수정 가능 + last-admin 보호 트리거.

-- ─────────────────────────────────────────────────
-- 1. 기존 'owner' 데이터를 'admin' 으로 전환
-- ─────────────────────────────────────────────────

update public.memberships set role = 'admin' where role = 'owner';
update public.organization_invites set role = 'admin' where role = 'owner';

-- ─────────────────────────────────────────────────
-- 2. check constraint 재정의 — 'owner' 제거
-- ─────────────────────────────────────────────────

alter table public.memberships
  drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('admin','member'));

alter table public.organization_invites
  drop constraint if exists organization_invites_role_check;
alter table public.organization_invites
  add constraint organization_invites_role_check check (role in ('admin','member'));

-- ─────────────────────────────────────────────────
-- 3. is_org_admin() 단순화 — 'admin' 만 체크
-- ─────────────────────────────────────────────────

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.memberships
    where user_id = auth.uid()
      and org_id = p_org_id
      and role = 'admin'
  )
$$;

-- ─────────────────────────────────────────────────
-- 4. RLS: admin 이 자기 조직 memberships 수정/삭제 가능
--    INSERT 는 여전히 super_admin 만 (일반 플로우는 invite 수락 = service role).
-- ─────────────────────────────────────────────────

drop policy if exists memberships_write on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;

create policy memberships_insert on public.memberships
  for insert with check (public.is_super_admin());

create policy memberships_update on public.memberships
  for update
    using (public.is_super_admin() or public.is_org_admin(org_id))
    with check (public.is_super_admin() or public.is_org_admin(org_id));

create policy memberships_delete on public.memberships
  for delete using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─────────────────────────────────────────────────
-- 5. Last-admin 보호 트리거
--    admin → member 강등 또는 admin 삭제 시 해당 조직의 admin 수가 0 이 되면 reject.
--    service role (auth.uid() null) 은 bypass — 조직 삭제/유지보수용.
-- ─────────────────────────────────────────────────

create or replace function public.ensure_last_admin_on_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_admin_count int;
begin
  -- service role 은 통과 (RLS 우회한 admin 클라이언트)
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- admin 제거/강등 케이스만 체크
  if tg_op = 'DELETE' and old.role = 'admin' then
    -- 체크 진행
    null;
  elsif tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin' then
    -- 체크 진행
    null;
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*) into v_other_admin_count
    from public.memberships
   where org_id = old.org_id
     and role = 'admin'
     and id <> old.id;

  if v_other_admin_count = 0 then
    raise exception '조직에 최소 1명의 관리자가 남아 있어야 합니다' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists memberships_ensure_last_admin on public.memberships;
create trigger memberships_ensure_last_admin
  before update or delete on public.memberships
  for each row execute function public.ensure_last_admin_on_memberships();

-- ====================================================
-- 20260423000006_seed_rojan_company_info_default.sql
-- ====================================================

-- organization_settings 에 key='company_info_default' 추가.
-- 이 값은 "기본값으로 되돌리기" 가 복원 대상으로 사용. 사용자가 company_info 를
-- 지우거나 잘못 수정해도 이 snapshot 으로 복구 가능.
-- seed 값 자체는 바뀌지 않고 고정. 나중에 업데이트하려면 별도 migration.

insert into public.organization_settings (org_id, key, value)
values (
  '00000000-0000-0000-0000-000000000001',
  'company_info_default',
  jsonb_build_object(
    'name_ko', '이진원',
    'clinic_ko', '로잔동물의료센터',
    'address_ko', '대한민국 서울시 관악구 관악로 29길 3, 수안빌딩 1층',
    'name_en', 'Jinwon Lee',
    'clinic_en', 'Lausanne Veterinary Medical Center',
    'address_en', '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
    'address_street_en', '1st floor, 3, Gwanak-ro 29-gil',
    'address_locality_en', 'Gwanak-gu, Seoul, Republic of Korea',
    'phone', '02-872-7588',
    'phone_intl', '+82-2-872-7588',
    'email', 'petmove@naver.com',
    'license_no', '9608',
    'transport_company_ko', '',
    'transport_company_en', '',
    'transport_contact_ko', '',
    'transport_contact_en', ''
  )
)
on conflict (org_id, key) do nothing;

-- ====================================================
-- 20260423000007_restrict_org_settings_to_admin.sql
-- ====================================================

-- Phase 14.1: 조직 설정 쓰기 권한을 admin (또는 super_admin) 로 제한.
-- 기존 정책은 is_org_member 였음 — 일반 멤버도 회사 정보·약품 목록을 수정할 수 있었음.
-- SELECT 는 기존대로 모든 멤버 허용 (멤버가 PDF 발급 등 정보를 조회해야 함).

-- ─────────────────────────────────────────────────
-- organization_settings
-- ─────────────────────────────────────────────────

drop policy if exists organization_settings_write on public.organization_settings;

create policy organization_settings_insert on public.organization_settings
  for insert
  with check (public.is_org_admin(org_id) or public.is_super_admin());

create policy organization_settings_update on public.organization_settings
  for update
  using (public.is_org_admin(org_id) or public.is_super_admin())
  with check (public.is_org_admin(org_id) or public.is_super_admin());

create policy organization_settings_delete on public.organization_settings
  for delete
  using (public.is_org_admin(org_id) or public.is_super_admin());

-- ─────────────────────────────────────────────────
-- org_vaccine_products
-- ─────────────────────────────────────────────────

drop policy if exists org_vaccine_products_insert on public.org_vaccine_products;
drop policy if exists org_vaccine_products_update on public.org_vaccine_products;
drop policy if exists org_vaccine_products_delete on public.org_vaccine_products;

create policy org_vaccine_products_insert on public.org_vaccine_products
  for insert
  with check (public.is_org_admin(org_id) or public.is_super_admin());

create policy org_vaccine_products_update on public.org_vaccine_products
  for update
  using (public.is_org_admin(org_id) or public.is_super_admin())
  with check (public.is_org_admin(org_id) or public.is_super_admin());

create policy org_vaccine_products_delete on public.org_vaccine_products
  for delete
  using (public.is_org_admin(org_id) or public.is_super_admin());

-- ====================================================
-- 20260424000001_org_disabled_checks.sql
-- ====================================================

-- 조직별 절차 검증 규칙 on/off 저장.
-- 행 존재 = 해당 org 에서 규칙 비활성화. 행 삭제 = 다시 활성화.
-- check_id 는 코드의 ProcedureCheck.id (예: 'jp.rabies-prime-after-91days-old') 를 그대로 저장.
-- 코드에서 규칙이 사라져도 row 는 남지만 검증 시 무시됨 — 깔끔하게 청소하려면 별도 쿼리 필요.

create table if not exists public.org_disabled_checks (
  org_id uuid not null references public.organizations(id) on delete cascade,
  check_id text not null,
  disabled_at timestamptz not null default now(),
  disabled_by uuid references auth.users(id) on delete set null,
  primary key (org_id, check_id)
);

create index if not exists org_disabled_checks_org_id_idx
  on public.org_disabled_checks (org_id);

-- ───── RLS ─────
alter table public.org_disabled_checks enable row level security;

-- SELECT: 모든 org 멤버. 케이스 검증 시 멤버가 disabled 목록을 읽어야 함.
drop policy if exists org_disabled_checks_select on public.org_disabled_checks;
create policy org_disabled_checks_select on public.org_disabled_checks
  for select using (public.is_org_member(org_id) or public.is_super_admin());

-- WRITE: admin 만. 멤버는 보기만 가능.
drop policy if exists org_disabled_checks_insert on public.org_disabled_checks;
create policy org_disabled_checks_insert on public.org_disabled_checks
  for insert with check (public.is_org_admin(org_id) or public.is_super_admin());

drop policy if exists org_disabled_checks_delete on public.org_disabled_checks;
create policy org_disabled_checks_delete on public.org_disabled_checks
  for delete using (public.is_org_admin(org_id) or public.is_super_admin());

-- ====================================================
-- 20260424000002_realtime_cases.sql
-- ====================================================

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

-- ====================================================
-- 20260424000003_fix_anon_apply_policy.sql
-- ====================================================

-- /apply 공개 신청폼이 새 publishable key (sb_publishable_*) 사용 시 RLS 위반 fix.
-- 기존 정책은 `to anon` 으로 한정돼 있었지만, sb_publishable 키는 더 이상 'anon'
-- role 로 매핑되지 않을 수 있어 매치되지 않음.
-- with check 의 org_id 제약은 그대로 유지하여 보안 동등.

drop policy if exists cases_anon_apply on public.cases;
create policy cases_anon_apply on public.cases
  for insert
  with check (org_id = '00000000-0000-0000-0000-000000000001');

-- ====================================================
-- 20260424000004_debug_role.sql
-- ====================================================

-- Temporary debug function to inspect role/JWT for /apply path.
create or replace function public.debug_who_am_i()
returns json
language sql
security invoker
as $$
  select json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'jwt_role', current_setting('request.jwt.claims', true)::json->>'role',
    'jwt_sub', current_setting('request.jwt.claims', true)::json->>'sub'
  );
$$;
grant execute on function public.debug_who_am_i() to anon, authenticated, public;

-- ====================================================
-- 20260424000005_drop_debug_role.sql
-- ====================================================

-- 20260424000004 의 임시 디버그 함수 제거.
drop function if exists public.debug_who_am_i();

-- ====================================================
-- 20260424000006_org_auto_fill_rules.sql
-- ====================================================

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

-- ====================================================
-- 20260424000007_auto_fill_species_filter.sql
-- ====================================================

-- 자동 채움 규칙에 species 조건 추가.
-- 호주 같은 경우 강아지와 고양이의 구충 간격이 다르기 때문에 species 별로 규칙을 분리.

alter table public.org_auto_fill_rules
  add column if not exists species_filter text not null default 'all';

-- 'all' | 'dog' | 'cat' 만 허용
alter table public.org_auto_fill_rules
  drop constraint if exists org_auto_fill_rules_species_filter_chk;
alter table public.org_auto_fill_rules
  add constraint org_auto_fill_rules_species_filter_chk
  check (species_filter in ('all', 'dog', 'cat'));

-- 기존 lookup index 에 species_filter 도 포함 (WHERE 절 때문에 drop/recreate 는 불필요 — index 는 enabled 만 필터)

-- ====================================================
-- 20260424000008_seed_rojan_auto_fill_rules.sql
-- ====================================================

-- 로잔동물의료센터 기본 자동 채움 규칙 seed.
-- 이미 룰이 있으면 (사용자가 수동으로 추가) skip — idempotent.

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from public.org_auto_fill_rules where org_id = rojan) then
    insert into public.org_auto_fill_rules
      (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
    values
      -- 하와이: 내원일 → 내/외부 구충 (당일)
      (rojan, 'hawaii', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
      (rojan, 'hawaii', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
      -- 호주: 출국일 → 내원일(-2); 내원일 → 구충 (당일, -29)
      (rojan, 'australia', 'all', 'departure_date', 'vet_visit_date', array[-2], 1),
      (rojan, 'australia', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0, -29], 2),
      (rojan, 'australia', 'all', 'vet_visit_date', 'external_parasite_dates', array[0, -29], 3),
      -- 호주 강아지: CIV 1차 → 2차(+14)
      (rojan, 'australia', 'dog', 'civ_dates[0]', 'civ_dates[1]', array[14], 4),
      -- 뉴질랜드: 출국일 → 내원일(-2); 내원일 → 구충·심장사상충 (당일, -29)
      (rojan, 'new_zealand', 'all', 'departure_date', 'vet_visit_date', array[-2], 1),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0, -29], 2),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'external_parasite_dates', array[0, -29], 3),
      (rojan, 'new_zealand', 'all', 'vet_visit_date', 'heartworm_dates', array[0, -29], 4);
  end if;
end $$;

-- ====================================================
-- 20260424000009_seed_rojan_rabies_trigger_rules.sql
-- ====================================================

-- 로잔 추가 자동 채움 규칙: 광견병 1차 입력 시 다른 백신 1차를 같은 날로 자동 입력.
-- 호주/뉴질랜드 강아지: 종합백신 + 켄넬코프 + CIV
-- 호주/뉴질랜드 고양이: 종합백신

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- 호주 강아지
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 10),
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 11),
    (rojan, 'australia', 'dog', 'rabies_dates[0]', 'civ_dates[0]', array[0], 12),
    -- 호주 고양이
    (rojan, 'australia', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 20),
    -- 뉴질랜드 강아지
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 10),
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 11),
    (rojan, 'new_zealand', 'dog', 'rabies_dates[0]', 'civ_dates[0]', array[0], 12),
    -- 뉴질랜드 고양이
    (rojan, 'new_zealand', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 20);
end $$;

-- ====================================================
-- 20260424000010_seed_rojan_internal_parasite_rules.sql
-- ====================================================

-- 로잔: 영국·아일랜드·몰타·노르웨이·핀란드 — 내원일 → 내부구충 같은 날.
-- 영국은 config key 'uk' 사용. 나머지 4개는 Korean 이름을 destination_key 로 저장
-- (apply engine 에서 config key 가 아닐 경우 case.destination substring match 로 폴백).

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    (rojan, 'uk', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '아일랜드', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '몰타', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '노르웨이', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, '핀란드', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1);
end $$;

-- ====================================================
-- 20260424000011_seed_rojan_more_rules.sql
-- ====================================================

-- 로잔 추가 자동 채움 규칙 (2차):
-- 필리핀, 싱가포르, 터키, 아랍에미리트, 브라질, 멕시코, 괌

do $$
declare
  rojan constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  insert into public.org_auto_fill_rules
    (org_id, destination_key, species_filter, trigger_field, target_field, offsets_days, display_order)
  values
    -- 필리핀
    (rojan, 'philippines', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'philippines', 'all', 'rabies_dates[0]', 'internal_parasite_dates', array[0], 2),
    -- 싱가포르
    (rojan, 'singapore', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'singapore', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 2),
    (rojan, 'singapore', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 3),
    -- 터키
    (rojan, 'turkey', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'turkey', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 아랍에미리트
    (rojan, 'uae', 'all', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    -- 브라질
    (rojan, 'brazil', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'brazil', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 멕시코
    (rojan, 'mexico', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 1),
    (rojan, 'mexico', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 2),
    -- 괌 강아지: 광견병 → 종합백신 + 켄넬코프
    (rojan, 'guam', 'dog', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 1),
    (rojan, 'guam', 'dog', 'rabies_dates[0]', 'kennel_cough_dates[0]', array[0], 2),
    -- 괌 고양이: 광견병 → 종합백신
    (rojan, 'guam', 'cat', 'rabies_dates[0]', 'general_vaccine_dates[0]', array[0], 3),
    -- 괌 공통: 내원일 → 내외부구충 + 심장사상충
    (rojan, 'guam', 'all', 'vet_visit_date', 'internal_parasite_dates', array[0], 10),
    (rojan, 'guam', 'all', 'vet_visit_date', 'external_parasite_dates', array[0], 11),
    (rojan, 'guam', 'all', 'vet_visit_date', 'heartworm_dates', array[0], 12);
end $$;
