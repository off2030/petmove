-- Temporary debug function to inspect role/JWT for /apply path.
create or replace function public.debug_who_am_i()
returns json
language sql
security invoker
as $$
  select json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'jwt_role', current_setting('request.jwt.claims', true)::json->>'role',
    'jwt_sub', current_setting('request.jwt.claims', true)::json->>'sub'
  );
$$;
grant execute on function public.debug_who_am_i() to anon, authenticated, public;
