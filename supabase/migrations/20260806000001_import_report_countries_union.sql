-- 신고 탭 국가 — 조직 저장값에 사전 통지·신고 대행 국가 병합 (2026-08-06 사용자 지시)
--
-- WHY: organization_settings.import_report_countries 스냅샷은 defaults 를 전면
--      대체하므로, DEFAULT_IMPORT_REPORT_COUNTRIES 에 새 국가를 추가해도 이미 설정을
--      저장한 조직에는 반영되지 않는다. www CTA 작업에서 확정한 대행 명단
--      (일본·대만·태국·필리핀·하와이 + 키프로스·아일랜드·몰타·노르웨이·이스라엘·미국,
--      아르헨티나 제외)을 기존 선택에 **합집합**으로 더한다 — 조직이 직접 추가한
--      국가는 그대로 보존. 멱등(재실행 무해).
update public.organization_settings
set value = (
      select coalesce(jsonb_agg(c order by c), '[]'::jsonb)
      from (
        select distinct c
        from (
          select jsonb_array_elements_text(value) as c
          union
          select unnest(array[
            '일본', '대만', '태국', '필리핀', '하와이',
            '키프로스', '아일랜드', '몰타', '노르웨이', '이스라엘', '미국'
          ]) as c
        ) merged
      ) dedup
    ),
    updated_at = now()
where key = 'import_report_countries';
