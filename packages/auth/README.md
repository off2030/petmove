# @petmove/auth

admin · portal 가 공유하는 Supabase Auth 클라이언트 모음.

## 구성

`@supabase/ssr` 위에 얇은 wrapper 3종 — 모두 동일 Seoul 프로젝트의 `auth.users`
를 공유한다. 역할 분기 (스태프 vs 보호자) 는 호출 측에서 `profiles` /
`customer_profiles` 존재 여부로 판단.

| Export | 환경 | 용도 |
|---|---|---|
| `supabaseBrowser` | client | cookie 기반 세션 — middleware 와 세션 공유 |
| `createClient()` | server | RSC / Server Action / Route Handler. `next/headers` 의 cookies 를 읽어 세션 유지. React `cache()` 로 request-scoped 메모이즈 |
| `createAdminClient()` | server-only | service_role 클라이언트, RLS 우회. 토큰 기반 anon 접근 (`/share/[token]` 등) 과 자동화에서만 사용 |

## 서브패스 분리

```json
"exports": {
  ".":        "./src/index.ts",   // supabaseBrowser, createAdminClient
  "./server": "./src/server.ts"   // createClient (next/headers 의존)
}
```

**왜?** `next/headers` 는 Server Component 컨텍스트에서만 동작한다. index 가
re-export 하면 client component 가 `@petmove/auth` 만 import 해도 Next 가 `server.ts`
를 client bundle 에 끌어가서 "next/headers is only available in Server Components"
런타임 에러가 발생. 그래서 server 전용은 별도 subpath.

## 사용 예

### Client component

```tsx
'use client'
import { supabaseBrowser } from '@petmove/auth'

const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
```

### Server component / Server action

```ts
import { createClient } from '@petmove/auth/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```

### Anon-token 흐름 (RLS 우회 필요)

```ts
'use server'
import { createAdminClient } from '@petmove/auth'

const admin = createAdminClient()
const { data } = await admin.from('case_share_links').select('*').eq('token', token)
```

`createAdminClient()` 는 `SUPABASE_SERVICE_ROLE_KEY` env 가 필수. 누락 시
`throw`. 절대 client component 에서 import 하지 말 것 — 빌드 타임엔 무관해
보여도, Next 의 트리쉐이킹 한계로 service role key 가 client bundle 에 노출될
위험이 있다 (admin 에서 가능. portal 은 대부분 안전).

## env 요구사항

| 변수 | 노출 | 필수 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | always |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | always |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | `createAdminClient()` 호출 경로만 |

`.env.local` 은 gitignored. 새 환경 셋업 시 admin/portal 의 `.env.example` 참고.

## admin / portal 의 차이

- **admin**: 인증된 스태프 컨텍스트. `lib/supabase/active-org.ts` 가 본인 첫
  membership 또는 super_admin impersonation cookie 로 활성 org 결정.
- **portal**: 보호자 컨텍스트. 첫 로그인 시 `customer_profiles` row 자동 생성
  (`apps/portal/lib/supabase/customer.ts` 의 `ensureCustomerProfile`).
- 분기는 `@petmove/auth` 가 모르게 — wrapper 는 동일, 상위 lib 가 책임.

## RLS 정책 작성 시 주의

cases ↔ case_customer_links 같은 교차 테이블 RLS 는 **반드시 SECURITY DEFINER 헬퍼**
로 우회. inline `exists(select 1 from public.X ...)` 는 X 의 RLS 정책을 재평가해서
무한 재귀 (`42P17`) 발생. 사례:
[`supabase/migrations/20260511000001_fix_cases_customer_rls_recursion.sql`](../../supabase/migrations/20260511000001_fix_cases_customer_rls_recursion.sql).

올바른 패턴:

```sql
create or replace function public.is_case_customer(p_case_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.case_customer_links l
    where l.case_id = p_case_id and l.user_id = auth.uid())
$$;
grant execute on function public.is_case_customer(uuid) to anon, authenticated;

create policy cases_select on public.cases for select using (
  public.is_org_member(org_id) or public.is_super_admin() or public.is_case_customer(id)
);
```
