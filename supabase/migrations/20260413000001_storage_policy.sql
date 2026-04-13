-- Allow all operations on the attachments bucket (RLS off for MVP)
create policy "Allow all on attachments"
  on storage.objects for all
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');
