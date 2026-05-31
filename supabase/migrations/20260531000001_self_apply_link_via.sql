-- case_customer_links.linked_via 허용 값에 'self-apply' 추가.
--
-- WHY: 펫무브 신청서가 인증 사용자 전용으로 변경되어, 본인이 직접 작성·제출한 케이스를
--      created 시점에 case_customer_links 로 본인 user_id 에 묶는다. 기존 값들과 구분:
--        - 'manual'        admin 이 직접 연결
--        - 'email-match'   이메일 매칭 자동 (admin 이 만든 케이스 ↔ 보호자 사후 매칭)
--        - 'phone-match'   전화번호 매칭 자동 (profile 입력 후 매칭)
--        - 'share-token'   공유 토큰으로 anon 진입
--        - 'self-apply'    보호자가 신청서로 직접 작성·제출 (신규)

alter table public.case_customer_links
  drop constraint if exists case_customer_links_linked_via_check;

alter table public.case_customer_links
  add constraint case_customer_links_linked_via_check
  check (linked_via in (
    'share-token',
    'email-match',
    'phone-match',
    'manual',
    'self-apply'
  ));
