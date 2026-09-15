-- =============================================================================
-- outbound_clicks — 홈페이지(www)가 익명키로 기록할 수 있게 INSERT 정책을 연다.
--
-- WHY: www 는 공개 사이트다. 여기에 service_role 키(RLS 전부 우회 = DB 전권)를 두면,
-- 그 프로젝트의 서버 코드나 설정이 한 번만 새도 DB 전체가 열린다. 기록 하나 남기려고
-- 질 필요가 없는 위험이라 최소 권한(이 테이블에 INSERT 만)으로 낮춘다.
--
-- 무엇을 감수하나: 익명키(sb_publishable_…)는 원래 브라우저에 실려 나가는 공개 값이라,
-- 정책을 열면 **누구나 이 테이블에 행을 넣을 수 있다.** 협상 근거로 쓰는 숫자라
-- 오염되면 곤란하므로, 정책의 WITH CHECK 로 '모양이 맞는 행'만 통과시킨다:
--   - source 는 지금 쓰는 자리 이름만 (앱·홈페이지 네 가지)
--   - user_id·case_id 는 반드시 NULL — 익명이 **앱 사용자 기록을 위조하지 못하게**.
--     사람 수(distinct user)가 협상 문장의 핵심이라 이 칸의 신뢰가 제일 중요하다.
--   - event·partner_slug 의 짝은 이미 테이블 CHECK 제약이 본다(중복해 쓰지 않는다).
-- 그래도 홈페이지 노출·클릭 건수는 부풀릴 수 있다. 감당 못 할 만큼 오염되면 이 정책만
-- drop 하면 원래대로(service-role 전용) 돌아간다.
--
-- SELECT·UPDATE·DELETE 정책은 두지 않는다 — 익명은 넣기만 하고 읽지도 고치지도 못한다.
-- 앱(portal)·펫무브워크는 service_role 이라 RLS 자체를 우회하므로 영향이 없다.
--
-- 재실행 안전(멱등).
-- =============================================================================

-- 정책만으로는 부족하다 — 테이블 권한(GRANT)이 먼저다. RLS 는 '가진 권한을 좁히는' 장치라
-- INSERT 권한이 없으면 정책이 있어도 거부된다.
grant insert on table public.outbound_clicks to anon;

drop policy if exists outbound_clicks_anon_insert on public.outbound_clicks;

create policy outbound_clicks_anon_insert
  on public.outbound_clicks
  for insert
  to anon
  with check (
    source in ('journey-note', 'app-guide', 'www-article', 'www-quote')
    and user_id is null
    and case_id is null
  );

comment on table public.outbound_clicks is
  '외부 업체 접점의 노출·클릭 로그. 읽기는 service-role 전용, 쓰기는 익명(www)도 허용 — 정책 참고.';

notify pgrst, 'reload schema';
