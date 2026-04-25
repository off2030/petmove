# 권한 모델

펫무브워크 멀티 테넌트 SaaS 권한 체계 — RLS 정책·헬퍼 함수·서버 액션 가드의 단일 출처.

권한 변경 시 이 문서를 먼저 업데이트하고 마이그레이션을 작성한다.

---

## 두 축

권한은 **독립된 두 축** 의 합성:

1. **`profiles.is_super_admin`** — SaaS 운영자. boolean. 모든 조직 데이터 우회 접근.
2. **`memberships.role`** — 특정 조직 내 역할. `admin` 또는 `member` 중 하나.

한 사용자는 두 축을 동시에 가질 수 있다 (예: SaaS 운영자가 직접 로잔의 admin 으로도 일하는 경우).

### Role 종류

| Role | 의미 |
|---|---|
| `admin` | 조직의 관리자. 멤버 초대·제거·역할 변경, 조직 설정 편집 가능 |
| `member` | 일반 멤버. 케이스 CRUD 가능, 멤버·설정 변경 불가 |

> **구버전 호환 메모**: 초기 설계는 `owner`/`admin`/`member` 3-tier 였으나 의미상 `owner == admin` 이라 `20260423000005_merge_owner_admin.sql` 에서 통합됨. 코드/DB 어디에도 `owner` 가 남아있으면 안 됨 (남았다면 마이그레이션 누락).

---

## 헬퍼 함수 (DB)

모두 `security definer + search_path=public`. RLS 정책의 빌딩 블록.

| 함수 | 반환 | 설명 |
|---|---|---|
| `is_super_admin()` | bool | 현재 `auth.uid()` 의 `profiles.is_super_admin` |
| `is_org_member(org_id)` | bool | 현재 유저가 해당 org 의 membership 보유 여부 |
| `is_org_admin(org_id)` | bool | 현재 유저가 해당 org 의 `role='admin'` 보유 여부 |

`auth.uid()` 가 `null` (service role) 이면 모두 `false`. service role 은 RLS 자체를 우회하므로 정책 통과 여부와 무관.

---

## 테이블별 RLS 매트릭스

`SA` = `is_super_admin()`. `M(org)` = `is_org_member(org_id)`. `A(org)` = `is_org_admin(org_id)`.

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `cases` | `M(org) ∨ SA` | `M(org) ∨ SA` (+ anon → 로잔만) | `M(org) ∨ SA` | `M(org) ∨ SA` |
| `case_history` | `M(org) ∨ SA` | `M(org) ∨ SA` | `M(org) ∨ SA` | `M(org) ∨ SA` |
| `field_definitions` | `org_id IS NULL ∨ M(org) ∨ SA` | `SA` | `SA` | `SA` |
| `organizations` | `M(id) ∨ SA` | `SA` | `SA` | `SA` |
| `memberships` | 본인 ∨ `SA` ∨ `M(org)` | `SA` | `A(org) ∨ SA` | `A(org) ∨ SA` |
| `organization_invites` | `A(org) ∨ SA` | `A(org) ∨ SA` | (없음 — service role) | `A(org) ∨ SA` |
| `organization_settings` | `M(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` |
| `org_vaccine_products` | `M(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` |
| `org_auto_fill_rules` | `M(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` |
| `org_disabled_checks` | `M(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` | `A(org) ∨ SA` |
| `calculator_items` | `authenticated` (전체) | `SA` | `SA` | `SA` |
| `app_settings` | `authenticated` (전체) | `SA` | `SA` | `SA` |
| `profiles` | 본인 ∨ `SA` ∨ 같은 org 멤버 | (트리거) | 본인 ∨ `SA` | `SA` |

**원칙**:
- **데이터 편집(케이스·기록)** 은 모든 멤버 허용
- **조직 설정·약품·자동화** 는 admin 이상만 (`A(org) ∨ SA`)
- **멤버십 관리** 는 admin 또는 super_admin
- **플랫폼 공용 (calculator/field_definitions/app_settings)** 은 super_admin 만 편집

---

## 서버 액션 가드

RLS 가 1차 방어선이지만, UX 사고 방지·정책으로 표현 어려운 규칙은 서버 액션 단에서 추가 차단.

| 액션 | 추가 가드 | 위치 |
|---|---|---|
| `removeMember` | 자기 자신 제거 차단 | `lib/actions/invites.ts` |
| `acceptInvite` | 이메일 일치 / 만료 / 중복 수락 | `lib/actions/invites.ts` |
| `createInvite` | 이메일 형식 검증 | `lib/actions/invites.ts` |
| super-admin 액션 전반 | `requireSuperAdmin()` 게이트 | `lib/actions/super-admin.ts` |

### DB 트리거 가드

- **last-admin 보호** (`memberships_ensure_last_admin`): `admin` 의 DELETE 또는 `admin → member` UPDATE 시 해당 org 의 다른 admin 수가 0 이면 `P0001` 예외. service role (`auth.uid() IS NULL`) 은 우회 — 조직 삭제·유지보수용.

---

## anon (비로그인) 접근

공개 신청 폼만 허용:

- `cases.cases_anon_apply` — anon 으로 INSERT, `org_id = '00000000-0000-0000-0000-000000000001'` (로잔) 조건. 멀티 테넌트 전환 시 변경 필요.

그 외 모든 테이블은 anon SELECT/INSERT/UPDATE/DELETE 차단.

---

## 알려진 미구현·제한

- **다른 org 멤버 관리 UI**: super_admin 은 RLS 상 모든 org 의 memberships/invites 를 다룰 수 있지만, 현재 `/super-admin` UI 는 **조회 전용**. settings 페이지는 `getActiveOrgId()` 기반 → super_admin 도 자기 active org 만 보임. 임시 기관 전환(impersonation) 미구현.
- **organizations DELETE UI 없음**: 정책상 super_admin 가능하지만 버튼 없음. 직접 SQL 또는 Supabase Dashboard 사용.
- **role 변경 UI** (`admin ↔ member`): RLS·트리거는 준비됨. UI 추가 예정.
- **profiles SELECT 정책의 "같은 org 멤버"**: `20260423000002_profiles_same_org_select` 에서 도입. 멤버 탭에서 다른 멤버 이름·이메일 표시용.

---

## 권한 추가·변경 체크리스트

새 테이블·정책 추가 시:

1. **마이그레이션 작성** — `supabase/migrations/YYYYMMDDNNNNNN_*.sql`
2. **헬퍼 함수 재사용** — 새 boolean 함수 만들지 말 것 (`is_org_admin` 등 기존 활용)
3. **RLS enable + 4개 정책** (SELECT/INSERT/UPDATE/DELETE) — 기본은 `M(org) ∨ SA` (전 멤버 읽기), `A(org) ∨ SA` (admin 만 쓰기)
4. **이 문서 매트릭스 업데이트**
5. **서버 액션 가드 추가** (필요 시) — UX 사고 방지용
6. **양쪽 환경 (Mumbai/Seoul) 적용** — 한쪽만 적용 시 RLS 불일치로 사용자별 다른 동작

---

## 참고 마이그레이션

- `20260422000003_phase5_rls.sql` — Phase 5 RLS 헬퍼·정책 도입
- `20260422000005_organization_invites.sql` — Phase 10 초대 + `is_org_admin` 도입
- `20260422000008_profiles_policy_fix.sql` — super_admin 의 타 프로필 SELECT
- `20260423000002_profiles_same_org_select.sql` — 같은 org 멤버 간 프로필 SELECT
- `20260423000005_merge_owner_admin.sql` — owner/admin 통합 + last-admin 트리거
- `20260423000007_restrict_org_settings_to_admin.sql` — settings/products 쓰기 admin 제한
- `20260424000001_org_disabled_checks.sql` — 비활성 검증 룰 RLS
- `20260424000003_fix_anon_apply_policy.sql` — anon /apply 정책 보정
- `20260424000006_org_auto_fill_rules.sql` — 자동화 룰 RLS
