-- 'for all' 정책이 upsert(INSERT) 시 WITH CHECK 를 제대로 적용하지 못하는
-- 케이스가 있어, calculator_items 와 동일한 패턴으로 분리.
drop policy if exists "app_settings_read" on app_settings;
drop policy if exists "app_settings_write" on app_settings;

create policy "Anyone can read app_settings"
  on app_settings for select
  using (true);

create policy "Authenticated can insert app_settings"
  on app_settings for insert
  to authenticated
  with check (true);

create policy "Authenticated can update app_settings"
  on app_settings for update
  to authenticated
  using (true)
  with check (true);
