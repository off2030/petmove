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
