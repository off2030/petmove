-- Phase 11: 케이스 핸드오프 (다른 조직으로 정보 전달).
--
-- 모델: 단방향 fork. 보낸 쪽 원본 케이스는 그대로 유지하고, 받는 쪽 조직에 새 케이스를 생성.
--   - 복사 데이터: 고객 + 반려동물 정보만 (절차/검사/서류 정보는 미복사)
--   - 분리 후 재전송 불가 (같은 source_case_id 로 다시 보낼 수 없음 — pending/accepted 행이 있으면 차단)
--   - 송신: 모든 멤버 가능. 수신 수락/거부: 받는 쪽 모든 멤버 가능.
--
-- 추가 사항:
--   - cases.assigned_to: 케이스 담당자 (조직 설정 토글로 UI 노출 여부 결정).
--   - organization_settings 의 'case_assignee' key 로 담당자 기능 on/off (기본 off, 앱 코드 컨벤션).
--
-- RLS:
--   - case_transfers select: from_org 또는 to_org 멤버 (양방향 가시성)
--   - case_transfers insert: from_org 멤버 (status='pending' 만 허용)
--   - case_transfers update: from_org 멤버는 cancel 만, to_org 멤버는 accept/reject 만 (모두 pending → 종결 상태로만)
--   - delete: super_admin (감사 로그는 보존)

-- ─────────────────────────────────────────────────
-- 1) cases.assigned_to 컬럼 추가
-- ─────────────────────────────────────────────────

alter table public.cases
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists cases_assigned_to_idx
  on public.cases (assigned_to)
  where assigned_to is not null;

-- ─────────────────────────────────────────────────
-- 2) case_transfers 테이블
-- ─────────────────────────────────────────────────

create table if not exists public.case_transfers (
  id uuid primary key default gen_random_uuid(),

  -- 보낸 쪽 원본 (cascade: 원본 삭제 시 전송 기록도 정리)
  source_case_id uuid not null references public.cases(id) on delete cascade,

  -- 받는 쪽 새 케이스 (수락 시점에 채워짐). 받은 쪽이 케이스 삭제하면 null 로 끊김.
  target_case_id uuid references public.cases(id) on delete set null,

  from_org_id  uuid not null references public.organizations(id) on delete restrict,
  from_user_id uuid not null references auth.users(id)            on delete restrict,
  to_org_id    uuid not null references public.organizations(id) on delete restrict,
  to_user_id   uuid          references auth.users(id)            on delete set null,

  -- 보낼 당시의 고객+반려동물 정보 스냅샷 (수락 전·거부·취소 후에도 기록으로 남음)
  payload_snapshot jsonb not null,

  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled')),

  note text,                                  -- 송신자가 첨부하는 메시지
  response_note text,                         -- 수신자가 수락/거부 시 남긴 메모

  responded_at  timestamptz,
  responded_by  uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  -- to_org 가 from_org 와 같으면 자기 조직에 보내는 것 → 의미 없으므로 차단
  constraint case_transfers_diff_org check (from_org_id <> to_org_id)
);

create index if not exists case_transfers_source_idx on public.case_transfers (source_case_id);
create index if not exists case_transfers_target_idx on public.case_transfers (target_case_id) where target_case_id is not null;
create index if not exists case_transfers_to_org_status_idx on public.case_transfers (to_org_id, status);
create index if not exists case_transfers_from_org_idx on public.case_transfers (from_org_id, created_at desc);
create index if not exists case_transfers_to_user_idx on public.case_transfers (to_user_id, status) where to_user_id is not null;

-- 같은 source_case 에 대해 pending/accepted 가 동시에 둘 이상 존재하지 않도록.
-- (cancelled/rejected 는 여러 개 가능 — 다시 시도할 수 있음)
-- "분리 후 재전송 불가" 정책은 앱 코드 + 다음 unique 인덱스가 함께 보장:
--   accepted 가 한 번 생기면 같은 source 로 새 pending 을 만들 수 없음 (앱 단 차단).
create unique index if not exists case_transfers_source_open_unique
  on public.case_transfers (source_case_id)
  where status in ('pending','accepted');

-- ─────────────────────────────────────────────────
-- 3) RLS
-- ─────────────────────────────────────────────────

alter table public.case_transfers enable row level security;

-- SELECT: 양쪽 조직 멤버 모두 가능 (보낸 기록·받은 기록 양쪽에서 보임)
drop policy if exists case_transfers_select on public.case_transfers;
create policy case_transfers_select on public.case_transfers
  for select using (
    public.is_org_member(from_org_id)
    or public.is_org_member(to_org_id)
    or public.is_super_admin()
  );

-- INSERT: from_org 멤버만, status 는 무조건 pending 으로만 생성 가능
drop policy if exists case_transfers_insert on public.case_transfers;
create policy case_transfers_insert on public.case_transfers
  for insert with check (
    (public.is_org_member(from_org_id) or public.is_super_admin())
    and status = 'pending'
  );

-- UPDATE: from_org 멤버(취소) 또는 to_org 멤버(수락/거부). 종결된 행은 변경 불가.
-- (status 전이 검증은 트리거가 담당 — RLS 만으로는 'pending → 다른 상태' 만 허용 어려움)
drop policy if exists case_transfers_update on public.case_transfers;
create policy case_transfers_update on public.case_transfers
  for update using (
    public.is_org_member(from_org_id)
    or public.is_org_member(to_org_id)
    or public.is_super_admin()
  ) with check (
    public.is_org_member(from_org_id)
    or public.is_org_member(to_org_id)
    or public.is_super_admin()
  );

-- DELETE: super_admin 만 (감사 로그 보존)
drop policy if exists case_transfers_delete on public.case_transfers;
create policy case_transfers_delete on public.case_transfers
  for delete using (public.is_super_admin());

-- ─────────────────────────────────────────────────
-- 4) 상태 전이 검증 트리거
--    pending → accepted/rejected/cancelled 만 허용. 종결 상태는 변경 불가.
--    accepted/rejected 는 to_org 멤버만, cancelled 는 from_org 멤버만 수행.
-- ─────────────────────────────────────────────────

create or replace function public.case_transfers_validate_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 종결 상태에서는 status 자체가 변경되면 안됨
  if old.status <> 'pending' and new.status <> old.status then
    raise exception '이미 처리된 전송입니다 (현재 상태: %)', old.status
      using errcode = 'P0001';
  end if;

  -- 같은 종결 상태 안에서 무의미한 update 도 방지 (responded_at 등 변경 차단)
  if old.status <> 'pending' then
    -- 같은 행이 이미 pending 이 아니면 실질적 변경은 막음 (내부 시스템만 갱신 가능 — service role 우회)
    if new.status = old.status
       and (new.target_case_id is distinct from old.target_case_id
            or new.responded_at is distinct from old.responded_at) then
      -- 단, target_case_id 가 null → 값 으로 채워지는 것은 accept 트리거 내부에서만 발생.
      -- 외부 update 는 super_admin 외에는 차단.
      if not public.is_super_admin() then
        raise exception '종결된 전송은 수정할 수 없습니다'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- pending → cancelled 는 from_org 멤버만
  if old.status = 'pending' and new.status = 'cancelled' then
    if not (public.is_org_member(old.from_org_id) or public.is_super_admin()) then
      raise exception '취소는 보낸 조직의 멤버만 가능합니다'
        using errcode = 'P0001';
    end if;
  end if;

  -- pending → accepted/rejected 는 to_org 멤버만
  if old.status = 'pending' and new.status in ('accepted','rejected') then
    if not (public.is_org_member(old.to_org_id) or public.is_super_admin()) then
      raise exception '수락/거부는 받는 조직의 멤버만 가능합니다'
        using errcode = 'P0001';
    end if;
    -- responded_by/responded_at 자동 채움 (앱 단에서도 채우지만 안전망)
    if new.responded_at is null then
      new.responded_at := now();
    end if;
    if new.responded_by is null then
      new.responded_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists case_transfers_validate_status_change on public.case_transfers;
create trigger case_transfers_validate_status_change
  before update on public.case_transfers
  for each row execute function public.case_transfers_validate_status_change();
