-- Phase 12: 외부 정보 입력용 매직 링크.
--
-- 활용 예: 보호자에게 "전화번호·주소 채워주세요", 외부 동물병원에 "백신 일정 입력",
--          운송회사에 "출발일 알려주세요" 등 — 받는 쪽은 계정 없이 토큰 URL 만 열면
--          허용된 필드만 채워서 제출 가능. 결과는 원본 케이스에 자동 반영.
--
-- 디자인:
--   - field_keys: 채울 수 있는 필드 화이트리스트 (cases 컬럼 또는 data jsonb 키 — flat 배열)
--   - template: 사전 정의 묶음 라벨 (customer / animal / vaccinations / departure / custom)
--               UI 가 빠르게 묶음 선택할 수 있도록 분류용. NULL = 커스텀 선택.
--   - 토큰: gen_random_uuid() — URL 안전, 추측 불가
--   - 만료: 기본 30 일 (앱에서 sender 가 변경 가능)
--   - 사용 추적: submitted_at, submitter_name (서명), revoked_at (sender 취소)
--
-- 보안:
--   - 토큰만 알면 누구나 열 수 있으므로 단계적 안전장치:
--     - 만료 검증 (expires_at)
--     - 취소 검증 (revoked_at)
--     - submitted_at 후 재제출 차단 (single_use 효과)
--     - 화이트리스트 외 필드는 절대 쓰지 않음 (앱 단)
--   - RLS: 기본 deny, org 멤버만 자기 조직 링크 관리. 익명 read/write 는 server action 에서 admin client 우회.

create table if not exists public.case_share_links (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,

  token uuid not null unique default gen_random_uuid(),

  template text,                             -- 'customer' / 'animal' / 'vaccinations' / 'departure' / 'custom'
  field_keys text[] not null default '{}',   -- 화이트리스트
  title text,                                -- 발신자가 받는 사람에게 보여줄 안내 메시지

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),

  submitted_at timestamptz,
  submitter_name text,
  submitter_note text,

  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create index if not exists case_share_links_case_idx on public.case_share_links (case_id);
create index if not exists case_share_links_org_idx on public.case_share_links (org_id, created_at desc);

-- RLS: org 멤버 또는 super_admin 만 select/insert/update/delete.
-- 토큰 기반 익명 접근은 서버 액션이 service role 로 우회.
alter table public.case_share_links enable row level security;

drop policy if exists case_share_links_select on public.case_share_links;
create policy case_share_links_select on public.case_share_links
  for select using (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_share_links_insert on public.case_share_links;
create policy case_share_links_insert on public.case_share_links
  for insert with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_share_links_update on public.case_share_links;
create policy case_share_links_update on public.case_share_links
  for update using (public.is_org_member(org_id) or public.is_super_admin())
  with check (public.is_org_member(org_id) or public.is_super_admin());

drop policy if exists case_share_links_delete on public.case_share_links;
create policy case_share_links_delete on public.case_share_links
  for delete using (public.is_org_member(org_id) or public.is_super_admin());

notify pgrst, 'reload schema';
