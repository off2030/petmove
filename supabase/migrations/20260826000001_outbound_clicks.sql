-- =============================================================================
-- outbound_clicks — 앱 안에서 외부 업체로 나가는 접점의 노출·클릭 기록.
--
-- 첫 용도: 여정 '운송 예약/항공권 구매' 카드 하단의 운송업체 안내(협의 전 트래픽 실험).
-- 업체와 제휴가 없는 상태라 "우리 고객이 운송업체를 실제로 찾는가"를 숫자로 먼저 확인한다.
--
-- 측정 모델:
--   - event='impression' : 안내 블록이 화면에 실제로 보인 순간 1건. partner_slug = NULL
--     (업체별이 아니라 목록 단위 노출 — 클릭률의 분모).
--   - event='tel'|'mail' : 업체별 연락 시도. partner_slug 필수.
--   전화번호를 평문으로 노출하지 않고 버튼으로만 두기 때문에 이 기록이 곧 연락 시도다.
--   (그래도 '앱에서 이름만 보고 나중에 검색해서 전화' 같은 경로는 못 잡는다 — 하한선.)
--
-- destination 을 같이 남겨 나라별로 쪼갤 수 있게 한다(화물 전용국 vs 동반 가능국).
-- user_id 는 중복 제거용(같은 사람이 여러 번 열어도 '몇 명이 눌렀나'를 셀 수 있게).
--
-- RLS: 정책을 하나도 두지 않는다 = service-role 전용. 기록은 서버 액션이,
-- 조회는 펫무브워크 슈퍼어드민 액션이 service-role 로 한다. 고객·스태프 직접 접근 불가.
-- =============================================================================

create table if not exists public.outbound_clicks (
  id bigint generated always as identity primary key,
  event text not null check (event in ('impression', 'tel', 'mail', 'web')),
  -- impression 은 목록 단위라 slug 가 없고, 클릭은 반드시 업체를 지목한다.
  partner_slug text,
  constraint outbound_clicks_slug_matches_event
    check ((event = 'impression') = (partner_slug is null)),
  /** 노출 위치 — 'journey-flight-step' 등. 자리를 늘리면 여기서 갈린다. */
  source text not null,
  /** 여행지(한글 토큰). 나라별 반응 차이를 보기 위해. */
  destination text,
  user_id uuid references auth.users(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists outbound_clicks_created_idx
  on public.outbound_clicks (created_at desc);
create index if not exists outbound_clicks_event_idx
  on public.outbound_clicks (event, partner_slug);

comment on table public.outbound_clicks is
  '외부 업체 접점의 노출·클릭 로그. service-role 전용(RLS 정책 없음).';

alter table public.outbound_clicks enable row level security;

notify pgrst, 'reload schema';
