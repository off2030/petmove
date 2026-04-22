-- Phase 5 롤백: RLS 전부 disable. 정책은 남아있어도 비활성 상태면 무해.
-- 응급 시 Supabase SQL Editor 에 붙여넣고 실행.

alter table public.cases disable row level security;
alter table public.case_history disable row level security;
alter table public.field_definitions disable row level security;
alter table public.organizations disable row level security;
alter table public.memberships disable row level security;
alter table public.calculator_items disable row level security;
alter table public.app_settings disable row level security;
