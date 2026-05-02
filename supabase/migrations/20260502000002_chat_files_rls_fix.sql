-- chat-files 스토리지 RLS 를 통합 채팅 모델에 맞게 재정의.
--
-- WHY: 20260426000003 의 정책은 conversations.user_a_id/user_b_id 를 참조하지만
--      20260427000001 (unify_chat) 에서 해당 컬럼이 사라지고 conversation_participants
--      모델로 통합. 결과: chat-files 업로드 시 RLS 가 항상 실패 →
--      'new row violates row-level security policy' 에러.
--
-- FIX: 같은 헬퍼 (public.is_conversation_participant) 를 사용해 참여자만 통과.

drop policy if exists chat_files_select on storage.objects;
create policy chat_files_select on storage.objects
  for select using (
    bucket_id = 'chat-files'
    and (
      public.is_super_admin()
      or public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects
  for insert
  with check (
    bucket_id = 'chat-files'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

-- delete 정책은 owner = auth.uid() 만 보므로 unify 영향 없음. 유지.
