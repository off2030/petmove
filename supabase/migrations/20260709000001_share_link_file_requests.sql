-- 정보 요청 링크: 요청된 파일 첨부 슬롯 key 배열.
-- 라벨·필수여부는 도메인 정의(SHARE_FILE_REQUESTS)로 되살리므로 key 만 저장한다.
alter table public.case_share_links
  add column if not exists file_request_keys text[];
