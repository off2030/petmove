-- =============================================================================
-- Microchip uniqueness must ignore soft-deleted rows
--   Original constraint: unique (org_id, microchip) over the whole table.
--   Problem: after a case is soft-deleted (deleted_at set), its microchip still
--   occupies the unique slot, so re-registering the same pet (drop-in file
--   upload, xlsx import, manual create) fails with "이미 등록된 마이크로칩".
--   Fix: drop the full-table constraint, replace with a partial unique index
--   scoped to live rows (deleted_at IS NULL).
-- =============================================================================

alter table cases
  drop constraint if exists cases_org_microchip_unique;

create unique index if not exists cases_org_microchip_unique
  on cases (org_id, microchip)
  where deleted_at is null;
