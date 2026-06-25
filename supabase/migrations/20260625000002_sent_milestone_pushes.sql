-- 관리자 완료 → 앱 푸시 "이미 보낸 마일스톤" 기록 — 케이스당 1회 발송 보장(중복 제거).
--
-- WHY: 발송 크론(scripts/send-milestone-pushes.ts)이 주기적으로 완료 마일스톤을 스캔하는데,
--      한 번 보낸 알림을 매번 다시 보내면 안 된다. key(=케이스+마일스톤 안정 식별자)를 여기에
--      기록하고, 발송 전 INSERT ... ON CONFLICT DO NOTHING 으로 '선점'한 경우에만 보낸다
--      (크론 중첩 시에도 정확히 1회).
--
-- key 형태: '{caseId}|titer' · '{caseId}|japan|advance' · '{caseId}|japan|jp-export'
--          · '{caseId}|{thailand|philippines}|import-permit' (milestone-pushes.ts 와 동일).
--
-- RLS: 정책 없음 = API(anon/authed)에선 접근 불가. 발송 크론은 직접 DB 연결(SUPABASE_DB_URL,
--      postgres 롤)로 RLS 우회. 케이스 삭제 시 cascade 로 함께 정리.

create table if not exists public.sent_milestone_pushes (
  key text primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists sent_milestone_pushes_case_id_idx
  on public.sent_milestone_pushes(case_id);

alter table public.sent_milestone_pushes enable row level security;
