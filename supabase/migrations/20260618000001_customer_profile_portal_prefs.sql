-- 펫무브(portal) 보호자 앱 환경설정 토글 2개.
--
-- 설정 > '고급'(자기책임 모드)에서 보호자가 직접 켠다. 계정 전체(customer_profiles) 저장 —
-- 기기·여정 무관하게 따라온다. 기본 OFF(현행 동작 보존).
--
--  - free_input_mode: 입력불가 차단(전부) 해제 + '주의'/case 경고 숨김. 아무 날짜·정보를
--    입력·저장 가능, 준비 책임은 보호자가 진다. '안내'(유효기간 임박·추가 백신 등)와
--    추가 백신/검사 카드는 그대로 유지(검증과 무관한 도움 안내라).
--  - hide_step_descriptions: 일정 탭 각 단계의 정적 설명문(how-to) 숨김. 상태 안내
--    (오늘 예정일·진행 중 등)와 알림은 유지.
--
-- portal updateMyProfile 서버액션이 self_update RLS(auth.uid()=user_id) 위에서 갱신.
-- admin(펫무브워크)·서류 발행엔 영향 없음(표시용 환경설정).

alter table public.customer_profiles
  add column if not exists free_input_mode boolean not null default false,
  add column if not exists hide_step_descriptions boolean not null default false;

comment on column public.customer_profiles.free_input_mode is
  '펫무브 자기책임 모드 — 입력불가 차단 해제 + 주의/경고 숨김(안내는 유지). 기본 false.';
comment on column public.customer_profiles.hide_step_descriptions is
  '펫무브 일정 탭 단계 정적 설명문 숨김(상태 안내는 유지). 기본 false.';
