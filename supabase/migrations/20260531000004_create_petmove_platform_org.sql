-- 펫무브 직영(플랫폼) 조직 생성 + org_type 'platform' 신설 + 조직별 신청 링크용 slug.
--
-- 직영(펫무브) = 두 가지 보관소:
--   1) 펫무브 앱 고객 '직접 신청' (어느 병원/에이전시에도 안 속함)
--   2) 삭제된 조직에서 '이관'된 케이스 (고객 데이터 보존)
-- 병원/에이전시 org 와 RLS(is_org_member)로 격리되고, super_admin 만 관리.
--
-- TODO(별도): 직영 케이스의 수출서류 PDF 발급자 정보(기본 Jinwon Lee/관악) 시드 —
--   직영에 케이스가 생기기 전 organization_settings 에 company 정보 넣기.

-- 1) org_type 에 'platform' 추가 (기존 hospital/transport 외)
alter table public.organizations drop constraint if exists organizations_org_type_check;
alter table public.organizations
  add constraint organizations_org_type_check
  check (org_type in ('hospital','transport','platform'));

-- 2) 조직별 신청 링크용 slug — 예: /apply/lvmc. 대소문자 무시 고유. 직영은 slug 없음(/apply = 직영).
alter table public.organizations add column if not exists slug text;
create unique index if not exists organizations_slug_lower_unique
  on public.organizations (lower(slug)) where slug is not null;

-- 3) 로잔 핸들
update public.organizations
  set slug = 'lvmc'
  where id = '00000000-0000-0000-0000-000000000001' and slug is null;

-- 4) 직영(펫무브) 조직 — 고정 UUID
insert into public.organizations (id, name, org_type)
values ('00000000-0000-0000-0000-000000000002', '펫무브', 'platform')
on conflict (id) do nothing;

-- 5) super_admin 을 직영 멤버(admin)로 — 케이스 열람 + 신규 신청 봇 알림 수신.
insert into public.memberships (user_id, org_id, role)
select id, '00000000-0000-0000-0000-000000000002', 'admin'
from public.profiles where is_super_admin = true
on conflict (user_id, org_id) do nothing;

notify pgrst, 'reload schema';
