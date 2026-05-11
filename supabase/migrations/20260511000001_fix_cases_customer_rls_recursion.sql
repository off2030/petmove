-- Fix RLS recursion introduced by customer case links.
--
-- Problem:
--   cases_select queried case_customer_links, while case_customer_links_* policies
--   queried cases. Postgres evaluates RLS on those subqueries too, so a simple
--   select from cases could recurse with:
--     42P17 infinite recursion detected in policy for relation "cases"
--
-- Solution:
--   Move the cross-table checks into SECURITY DEFINER helpers so policy evaluation
--   does not recursively invoke the other table's RLS policy.

create or replace function public.is_case_customer(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.case_customer_links l
    where l.case_id = p_case_id
      and l.user_id = auth.uid()
  )
$$;

create or replace function public.can_access_case_as_staff(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = p_case_id
      and (public.is_org_member(c.org_id) or public.is_super_admin())
  )
$$;

grant execute on function public.is_case_customer(uuid) to anon, authenticated;
grant execute on function public.can_access_case_as_staff(uuid) to anon, authenticated;

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select using (
    public.is_org_member(org_id)
    or public.is_super_admin()
    or public.is_case_customer(id)
  );

drop policy if exists case_customer_links_select on public.case_customer_links;
create policy case_customer_links_select on public.case_customer_links
  for select using (
    auth.uid() = user_id
    or public.can_access_case_as_staff(case_id)
  );

drop policy if exists case_customer_links_insert on public.case_customer_links;
create policy case_customer_links_insert on public.case_customer_links
  for insert with check (
    public.can_access_case_as_staff(case_id)
  );

drop policy if exists case_customer_links_update on public.case_customer_links;
create policy case_customer_links_update on public.case_customer_links
  for update
  using (
    public.can_access_case_as_staff(case_id)
  )
  with check (
    public.can_access_case_as_staff(case_id)
  );

drop policy if exists case_customer_links_delete on public.case_customer_links;
create policy case_customer_links_delete on public.case_customer_links
  for delete using (
    auth.uid() = user_id
    or public.can_access_case_as_staff(case_id)
  );

notify pgrst, 'reload schema';
