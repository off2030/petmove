-- Web Push 구독 저장 테이블.
--
-- WHY: PWA 알림(메시지·만료 임박 백신 등) 발송하려면 사용자별 푸시 endpoint 필요.
--      한 사용자가 여러 디바이스(데스크톱 + 모바일)에서 구독할 수 있으므로
--      user_id 는 unique 가 아니고 endpoint 가 unique. 같은 디바이스 재구독 시 upsert.
--
-- RLS: 사용자는 본인 구독만 select/insert/update/delete. 발송은 service-role 클라이언트로 RLS 우회.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_subscriptions_update_own on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (user_id = auth.uid());
