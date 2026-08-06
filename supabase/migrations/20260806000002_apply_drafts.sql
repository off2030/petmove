-- =============================================================================
-- 신청 폼 임시 저장 (apply_drafts) — 2026-08-06
-- =============================================================================
-- WHY: /apply 는 목적지 → 보호자 → 반려동물 3~4단계이고, 중간에 나가면 입력이
--      전부 사라진다. 그래서 (a) 사용자는 처음부터 다시 써야 하고,
--      (b) 우리는 "폼까지 왔다가 포기한 사람"과 "아예 안 들어온 사람"을 구분할
--      방법이 없다 — 케이스는 제출 순간에야 생기므로 둘 다 흔적이 없다.
--
--      임시 저장을 서버에 두면 둘 다 해결된다. 사용자는 이어서 쓰고,
--      운영은 draft 는 있는데 case 는 없는 계정 = 중도 이탈로 볼 수 있다.
--
-- 사용자당 한 건(진행 중인 신청은 하나). 제출 성공 시 삭제.
-- 개인정보(이름·전화·주소)가 담기므로 30일 지난 draft 는 자동 삭제한다.
-- =============================================================================

create table if not exists public.apply_drafts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- 어느 신청 창구에서 쓰던 것인지 (직영 /apply vs 조직 /apply/<slug>).
  org_id     uuid references public.organizations (id) on delete set null,
  -- 마지막으로 보고 있던 단계 — 어디서 멈추는지 진단에 쓰인다.
  step       int not null default 1,
  -- 폼 상태 스냅샷. 스키마를 고정하지 않는다(폼 필드가 자주 바뀜).
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.apply_drafts is
  '신청 폼 작성 중 임시 저장 — 사용자당 1건. 제출 성공 시 삭제, 30일 경과분 자동 정리.';
comment on column public.apply_drafts.step is
  '마지막으로 보던 단계. draft 있는데 case 없는 계정 = 중도 이탈, step 이 이탈 지점.';

create index if not exists apply_drafts_updated_idx
  on public.apply_drafts (updated_at desc);

-- RLS — 본인 draft 만. 남의 작성 중 개인정보를 볼 수 없어야 한다.
alter table public.apply_drafts enable row level security;

drop policy if exists "apply_drafts_select_own" on public.apply_drafts;
create policy "apply_drafts_select_own" on public.apply_drafts
  for select using (auth.uid() = user_id);

drop policy if exists "apply_drafts_insert_own" on public.apply_drafts;
create policy "apply_drafts_insert_own" on public.apply_drafts
  for insert with check (auth.uid() = user_id);

drop policy if exists "apply_drafts_update_own" on public.apply_drafts;
create policy "apply_drafts_update_own" on public.apply_drafts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "apply_drafts_delete_own" on public.apply_drafts;
create policy "apply_drafts_delete_own" on public.apply_drafts
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────
-- 오래된 draft 정리 — 개인정보를 무기한 들고 있지 않는다.
-- ─────────────────────────────────────────────────
create or replace function public.purge_stale_apply_drafts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.apply_drafts where updated_at < now() - interval '30 days';
$$;

comment on function public.purge_stale_apply_drafts() is
  '30일 이상 방치된 신청 임시저장 삭제. pg_cron 매일 실행.';

-- 계정 삭제 처리와 같은 시간대에 하루 한 번 (pg_cron 이 있는 환경에서만).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-stale-apply-drafts')
      where exists (select 1 from cron.job where jobname = 'purge-stale-apply-drafts');
    perform cron.schedule(
      'purge-stale-apply-drafts',
      '30 17 * * *',  -- UTC 17:30 = KST 02:30
      $cron$select public.purge_stale_apply_drafts()$cron$
    );
  end if;
end $$;
