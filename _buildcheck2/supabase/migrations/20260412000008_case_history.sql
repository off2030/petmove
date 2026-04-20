-- Case change history for undo/audit
create table case_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  field_key text not null,
  field_storage text not null check (field_storage in ('column', 'data')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);

create index case_history_case_idx on case_history(case_id, changed_at desc);
