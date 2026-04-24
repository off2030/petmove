-- 자동 채움 규칙에 species 조건 추가.
-- 호주 같은 경우 강아지와 고양이의 구충 간격이 다르기 때문에 species 별로 규칙을 분리.

alter table public.org_auto_fill_rules
  add column if not exists species_filter text not null default 'all';

-- 'all' | 'dog' | 'cat' 만 허용
alter table public.org_auto_fill_rules
  drop constraint if exists org_auto_fill_rules_species_filter_chk;
alter table public.org_auto_fill_rules
  add constraint org_auto_fill_rules_species_filter_chk
  check (species_filter in ('all', 'dog', 'cat'));

-- 기존 lookup index 에 species_filter 도 포함 (WHERE 절 때문에 drop/recreate 는 불필요 — index 는 enabled 만 필터)
