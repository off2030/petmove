-- 상대방 "읽음" 실시간 표시 — message_reads 의 SELECT 를 같은 채널 참여자에게 열고,
-- supabase_realtime publication 에 추가해 클라이언트가 상대 read 갱신을 즉시 수신.

-- SELECT: 같은 conversation 참여자면 서로의 read 상태를 볼 수 있음.
-- INSERT/UPDATE/DELETE: 본인만.
drop policy if exists message_reads_self on public.message_reads;
drop policy if exists message_reads_select on public.message_reads;
drop policy if exists message_reads_insert_self on public.message_reads;
drop policy if exists message_reads_update_self on public.message_reads;
drop policy if exists message_reads_delete_self on public.message_reads;

create policy message_reads_select on public.message_reads
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = message_reads.conv_id
        and auth.uid() in (c.user_a_id, c.user_b_id)
    )
  );

create policy message_reads_insert_self on public.message_reads
  for insert with check (user_id = auth.uid());

create policy message_reads_update_self on public.message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy message_reads_delete_self on public.message_reads
  for delete using (user_id = auth.uid());

-- Realtime publication 추가
do $$
begin
  alter publication supabase_realtime add table public.message_reads;
exception
  when duplicate_object then null;
end $$;
