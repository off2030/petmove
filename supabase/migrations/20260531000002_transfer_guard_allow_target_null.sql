-- 케이스 영구삭제가 "종결된 전송은 수정할 수 없습니다"에 막히던 버그 수정.
--
-- 원인: 케이스가 종결된 case_transfer 의 target 이면, 케이스 영구삭제 시
--   target_case_id 가 `on delete set null` 로 비워진다(= case_transfers UPDATE).
--   validate_status_change(BEFORE UPDATE) 트리거가 "종결 행의 target_case_id 변경"을
--   super_admin 아니면 차단 → 케이스 삭제 전체가 실패했다. (service-role 도 auth.uid()
--   가 null 이라 is_super_admin()=false → 동일하게 막힘.)
--
-- 수정: target_case_id 를 NULL 로 비우는 것(= 대상 케이스 삭제로 인한 FK set-null 정리)은
--   허용한다. 종결된 전송을 다른 케이스로 '재지정'(non-null 변경)하거나 responded_at 을
--   바꾸는 진짜 변조는 그대로 차단. (set null 은 FK 의 의도된 동작.)

create or replace function public.case_transfers_validate_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 종결 상태에서는 status 자체가 변경되면 안됨
  if old.status <> 'pending' and new.status <> old.status then
    raise exception '이미 처리된 전송입니다 (현재 상태: %)', old.status
      using errcode = 'P0001';
  end if;

  -- 같은 종결 상태 안에서 무의미한 update 차단 — 단, target_case_id 를 NULL 로 비우는
  -- 것(대상 케이스 삭제로 인한 set-null)은 허용한다.
  if old.status <> 'pending' then
    if new.status = old.status
       and ((new.target_case_id is distinct from old.target_case_id and new.target_case_id is not null)
            or new.responded_at is distinct from old.responded_at) then
      if not public.is_super_admin() then
        raise exception '종결된 전송은 수정할 수 없습니다'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- pending → cancelled 는 from_org 멤버만
  if old.status = 'pending' and new.status = 'cancelled' then
    if not (public.is_org_member(old.from_org_id) or public.is_super_admin()) then
      raise exception '취소는 보낸 조직의 멤버만 가능합니다'
        using errcode = 'P0001';
    end if;
  end if;

  -- pending → accepted/rejected 는 to_org 멤버만
  if old.status = 'pending' and new.status in ('accepted','rejected') then
    if not (public.is_org_member(old.to_org_id) or public.is_super_admin()) then
      raise exception '수락/거부는 받는 조직의 멤버만 가능합니다'
        using errcode = 'P0001';
    end if;
    if new.responded_at is null then
      new.responded_at := now();
    end if;
    if new.responded_by is null then
      new.responded_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
