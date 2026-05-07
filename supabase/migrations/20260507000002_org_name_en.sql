-- 조직 영문명 — 외부 공유 폼(/share/[token]) 헤더에 영문 표기를 노출하기 위함.
-- 한글 organizations.name 은 그대로 두고, 영문 표기가 별도로 필요한 경우만 채움.
alter table organizations add column if not exists name_en text;
