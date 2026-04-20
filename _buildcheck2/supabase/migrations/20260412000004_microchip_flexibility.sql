-- =============================================================================
-- Microchip flexibility
--   1) allow cases without a microchip yet (168 existing rows have customer
--      info but no chip number) — they can be filled in later
--   2) support pets that carry two (or more) microchips via an array column
-- =============================================================================

-- 1) microchip becomes nullable
--    The (org_id, microchip) UNIQUE constraint still prevents duplicate primary
--    chips within the same org. Postgres unique indexes treat multiple NULLs as
--    distinct, so N rows can have null microchip without violating uniqueness.
alter table cases
  alter column microchip drop not null;

-- 2) additional microchips (0 or more) live in an array column
--    Examples:
--      microchip        = '985 112 011 062 278'   -- primary, shown by default
--      microchip_extra  = {'410 100 007 507 942'} -- backup chip from re-scan
--    Login/search query:
--      WHERE microchip = $1 OR $1 = ANY(microchip_extra)
alter table cases
  add column microchip_extra text[] not null default '{}'::text[];

-- GIN index makes "$1 = ANY(microchip_extra)" and array containment queries fast
create index cases_microchip_extra_gin_idx
  on cases using gin (microchip_extra);

comment on column cases.microchip        is 'Primary microchip number (nullable until known)';
comment on column cases.microchip_extra  is 'Additional microchip numbers (0 or more). Login lookup checks both columns.';
