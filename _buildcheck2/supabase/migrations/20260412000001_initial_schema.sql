-- =============================================================================
-- Initial schema for PetMove (pet overseas relocation quarantine SaaS)
-- Multi-tenant from day one (org_id on all business tables).
-- Core identity fields are regular columns; everything else lives in data jsonb
-- driven by field_definitions for runtime flexibility.
-- =============================================================================

-- Organizations: multi-tenant root (vet clinic / pet transport agency)
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cases: one row per pet relocation case
create table cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete restrict,

  -- Regular columns (search / uniqueness / auth / filter)
  microchip        text not null,                 -- pet microchip number, unique within org
  customer_name    text not null,                 -- 보호자 한글
  customer_name_en text,                          -- 보호자 영문
  pet_name         text,                          -- 동물 한글
  pet_name_en      text,                          -- 동물 영문
  destination      text,                          -- 도착 국가 (free text for now, ISO codes later)
  status           text not null default '신규',  -- 신규/진행중/보류/완료/취소

  -- Flexible fields: anything not worth its own column
  data jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- microchip must be unique *within* an org (same chip could theoretically
  -- appear in two different agencies' books; we scope uniqueness per-tenant)
  constraint cases_org_microchip_unique unique (org_id, microchip),

  -- status must be one of the known values
  constraint cases_status_check check (status in ('신규','진행중','보류','완료','취소'))
);

create index cases_org_idx         on cases(org_id);
create index cases_destination_idx on cases(destination);
create index cases_status_idx      on cases(status);
create index cases_created_idx     on cases(created_at desc);
create index cases_customer_idx    on cases(customer_name);
create index cases_pet_idx         on cases(pet_name);
-- GIN index makes JSONB field searches fast once we need them
create index cases_data_gin_idx    on cases using gin (data);

-- Field definitions: UI metadata that drives forms, lists, timeline
-- org_id = null  -> platform default (shared across all orgs)
-- org_id = X     -> org-specific override / extra field
create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,

  key           text not null,              -- machine name used inside data jsonb
  label         text not null,              -- human label shown in UI
  type          text not null,              -- text / longtext / date / number / select / multiselect
  group_name    text,                       -- UI grouping (기본정보, 예방접종, 검사, ...)
  display_order int  not null default 0,    -- ordering within group
  options       jsonb,                      -- for select/multiselect: [{value, label_ko, label_en}]
  countries     text[],                     -- null / {} = visible for all destinations; otherwise allowlist
  is_step       boolean not null default false,  -- true -> appears on timeline
  is_active     boolean not null default true,   -- soft delete flag

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint field_definitions_type_check check (type in ('text','longtext','date','number','select','multiselect')),
  constraint field_definitions_org_key_unique unique (org_id, key)
);

create index field_definitions_org_idx   on field_definitions(org_id);
create index field_definitions_step_idx  on field_definitions(is_step) where is_step = true;

-- =============================================================================
-- updated_at trigger
-- =============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create trigger cases_set_updated_at
  before update on cases
  for each row execute function set_updated_at();

create trigger field_definitions_set_updated_at
  before update on field_definitions
  for each row execute function set_updated_at();

-- =============================================================================
-- Seed: default organization for single-tenant MVP
-- Fixed UUID so we can reference it deterministically from app code / imports.
-- =============================================================================
insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'PetMove')
on conflict (id) do nothing;
