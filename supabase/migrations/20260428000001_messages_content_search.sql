-- 채팅방 내 메시지 풀텍스트 검색 — pg_trgm + GIN 인덱스.
-- ILIKE '%query%' 가 trigram 인덱스 덕에 빠르게 동작.
-- 한국어 (CJK) 도 trigram 으로 substring 매칭 가능 — tsvector 보다 단순하고 케이스에 적합.

create extension if not exists pg_trgm;

-- deleted 메시지는 검색 결과에서 제외하므로 부분 인덱스로.
create index if not exists messages_content_trgm_idx
  on public.messages
  using gin (content gin_trgm_ops)
  where deleted_at is null;
