-- Keep share-link field identity tied to the destination tab/scope used at creation.
-- field_keys remains for legacy links and submit whitelisting; field_ids is the
-- resolver identity used to reproduce the same ordered field layout later.

alter table public.case_share_links
  add column if not exists destination_scope text,
  add column if not exists field_ids text[] not null default '{}';

update public.case_share_links
set field_ids = field_keys
where field_ids = '{}';

notify pgrst, 'reload schema';
