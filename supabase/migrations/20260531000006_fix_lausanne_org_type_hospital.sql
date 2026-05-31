-- 로잔(lvmc)은 동물병원 — 과거 org_type 이 간헐적으로 transport 로 잡히던 값 즉시 보정.
-- 앞으로는 조직정보 저장 시 채운 정보로 자동 판정(app: syncOrgTypeFromData)되지만,
-- 현재 잘못된 값이 남아 있으면 PDF 발급자(수의사) 칸이 비어 출력될 수 있어 즉시 교정.
-- 직영(platform) 등 다른 조직은 건드리지 않음.

update public.organizations
set org_type = 'hospital', updated_at = now()
where slug = 'lvmc'
  and org_type is distinct from 'hospital'
  and org_type <> 'platform';
