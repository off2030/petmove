-- =============================================================================
-- Phase 11.0: B2C Portal — 보호자 프로파일 + 케이스 매핑 + cases RLS 확장
--
-- portal (보호자 셀프서비스 앱) 의 데이터 베이스. admin 의 profiles 가 스태프
-- 본인 정보를 담는 것과 대칭으로, customer_profiles 는 보호자 본인 정보를 담는다.
-- auth.users 는 공유, 역할만 customer vs staff 로 분기.
--
-- 핵심:
--   - customer_profiles: 보호자 1명당 1행. user_id PK. phone / email_normalized 는
--     기존 cases.customer_data 와 자동 매칭하기 위한 키 (앱 단에서 normalize 후 저장).
--   - case_customer_links: 케이스 ↔ 보호자 N:M. 한 케이스에 가족 여러 명, 한 보호자가
--     여러 케이스를 동시에 가질 수 있음.
--   - cases SELECT 정책에 customer 매칭 OR 절 추가 — admin RLS 영향 0, OR 만 확장.
--
-- 자동 매칭 / share-token 셀프 링크는 server action 의 service role 로 우회 (RLS 는
-- 단지 안전망). admin 콘솔의 수동 링크/해제는 RLS 통과.
-- =============================================================================

-- ─────────────────────────────────────────────────
-- customer_profiles — 보호자 본인 정보 (auth.users 1:1)
-- ─────────────────────────────────────────────────
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,                                          -- 매칭 키 (digits-only normalize 는 앱 단)
  email_normalized text,                               -- 매칭 키 (lower(email))
  preferred_language text not null default 'ko',
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_profiles_phone_idx
  on public.customer_profiles (phone) where phone is not null;
create index if not exists customer_profiles_email_idx
  on public.customer_profiles (email_normalized) where email_normalized is not null;

-- 기존 set_updated_at() (initial_schema.sql) 재사용.
drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_updated_at();

-- RLS: self only. 다른 보호자/스태프는 customer_profiles 접근 불가.
alter table public.customer_profiles enable row level security;

drop policy if exists customer_profiles_self_select on public.customer_profiles;
create policy customer_profiles_self_select on public.customer_profiles
  for select using (auth.uid() = user_id or public.is_super_admin());

drop policy if exists customer_profiles_self_insert on public.customer_profiles;
create policy customer_profiles_self_insert on public.customer_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists customer_profiles_self_update on public.customer_profiles;
create policy customer_profiles_self_update on public.customer_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists customer_profiles_self_delete on public.customer_profiles;
create policy customer_profiles_self_delete on public.customer_profiles
  for delete using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────
-- case_customer_links — 케이스 ↔ 보호자 N:M 매핑
-- ─────────────────────────────────────────────────
create table if not exists public.case_customer_links (
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_via text not null
    check (linked_via in ('share-token', 'email-match', 'phone-match', 'manual')),
  primary key (case_id, user_id)
);

create index if not exists case_customer_links_user_idx
  on public.case_customer_links (user_id, linked_at desc);

alter table public.case_customer_links enable row level security;

-- SELECT: 본인 링크 OR 케이스 소속 org 멤버 OR super_admin.
drop policy if exists case_customer_links_select on public.case_customer_links;
create policy case_customer_links_select on public.case_customer_links
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.cases c
      where c.id = case_id and public.is_org_member(c.org_id)
    )
    or public.is_super_admin()
  );

-- INSERT/UPDATE: 케이스 소속 org 멤버 OR super_admin 만 (admin 수동 링크).
-- 자동 매칭(email/phone) 과 share-token 셀프 링크는 server action 의 service role.
drop policy if exists case_customer_links_insert on public.case_customer_links;
create policy case_customer_links_insert on public.case_customer_links
  for insert with check (
    exists (
      select 1 from public.cases c
      where c.id = case_id and public.is_org_member(c.org_id)
    )
    or public.is_super_admin()
  );

drop policy if exists case_customer_links_update on public.case_customer_links;
create policy case_customer_links_update on public.case_customer_links
  for update
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_id and public.is_org_member(c.org_id)
    )
    or public.is_super_admin()
  )
  with check (
    exists (
      select 1 from public.cases c
      where c.id = case_id and public.is_org_member(c.org_id)
    )
    or public.is_super_admin()
  );

-- DELETE: 본인은 자기 링크 해제 가능 (portal "이 케이스 더 이상 안 봄"),
-- 그 외엔 org 멤버 또는 super_admin.
drop policy if exists case_customer_links_delete on public.case_customer_links;
create policy case_customer_links_delete on public.case_customer_links
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.cases c
      where c.id = case_id and public.is_org_member(c.org_id)
    )
    or public.is_super_admin()
  );


-- ─────────────────────────────────────────────────
-- cases SELECT 정책 확장 — customer 매칭 OR 절 추가
-- ─────────────────────────────────────────────────
-- admin 영향 0: org_member / super_admin 절 그대로, customer 절 OR 만 더함.
-- 보호자가 자기에게 링크된 케이스 한정으로 select 가능.
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select using (
    public.is_org_member(org_id)
    or public.is_super_admin()
    or exists (
      select 1 from public.case_customer_links l
      where l.case_id = cases.id and l.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
