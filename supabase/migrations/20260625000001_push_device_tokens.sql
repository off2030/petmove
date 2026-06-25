-- 네이티브 앱(FCM/APNs) 푸시 디바이스 토큰 저장.
--
-- WHY: 펫무브(portal) 네이티브 앱이 "관리자 완료 → 푸시"(목적지별 마일스톤)를 받으려면
--      기기별 푸시 토큰이 필요. 기존 push_subscriptions(웹푸시: endpoint/p256dh/auth)와는
--      형태가 다른 FCM/APNs 단일 토큰이라 별도 테이블로 둔다.
--
-- 한 사용자가 여러 기기(폰·태블릿)에서 등록 가능 → user_id 는 unique 가 아니고 token 이 unique.
-- 같은 기기 재등록 시 upsert(onConflict token).
--
-- RLS: 본인 토큰만 select/insert/update/delete. 발송은 service-role 클라이언트로 RLS 우회.

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_device_tokens_user_id_idx
  on public.push_device_tokens(user_id);

alter table public.push_device_tokens enable row level security;

create policy push_device_tokens_select_own on public.push_device_tokens
  for select using (user_id = auth.uid());

create policy push_device_tokens_insert_own on public.push_device_tokens
  for insert with check (user_id = auth.uid());

create policy push_device_tokens_update_own on public.push_device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_device_tokens_delete_own on public.push_device_tokens
  for delete using (user_id = auth.uid());
