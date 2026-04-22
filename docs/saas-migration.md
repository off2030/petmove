# 펫무브워크 SaaS 전환 계획

**현재 단일 기관용 admin 앱을 멀티 테넌트 SaaS + 일반 고객용 B2C 앱(portal)으로 점진 전환.**

새 대화 창에서 이어갈 때 이 문서 + `git log --oneline -30` 확인하고 "현재 단계" 섹션부터 시작.

---

## 현재 상태 (2026-04-22 종료 시점)

### 핵심 로드맵 — 실질 완료

| Phase | 상태 | 요약 |
|---|---|---|
| 0 보안 | ✅ | Supabase·OpenAI·Kakao key rotate, DB CSV 백업, Vercel env 동기화 |
| 1 모노레포 | ✅ | `apps/admin` + `packages/{auth,db,domain,ui}` 스캐폴드, pnpm workspaces + Turborepo |
| 2 Auth + Email 로그인 | ✅ | Supabase Auth, profiles, /login, /logout, /auth/callback |
| 2.6 Seoul 이관 | ✅ | Mumbai (ap-south-1) → Seoul (ap-northeast-2) 데이터 + Vercel env 전환, 비번 재설정 |
| 3 memberships | ✅ | `memberships(user_id, org_id, role)`, PetMove → "로잔동물의료센터" rename, petmove@naver.com owner seed |
| 4 case_history.org_id | ✅ | 백필 + NOT NULL |
| 5 RLS | ✅ | is_super_admin / is_org_member / is_org_admin 헬퍼, cases/case_history/field_definitions/organizations/memberships/calculator_items/app_settings 정책, anon `/apply` 허용 |
| 7 organization_settings | ✅ | app_settings → org 별 분리, 4 config 파일 코드 전환 |
| 8 domain 패키지 | ✅ | destination-config, cert/inspection/import-report defaults, vaccine-lookup, procedure-checks, CaseRow 등 DB 타입 모두 `@petmove/domain` 이동. admin/lib/supabase/types.ts 는 shim |
| 9 Super Admin UI | ✅ | `/super-admin` 라우트, 전체 org 목록·생성·상세, is_super_admin 가드 |
| 10 초대 플로우 | ✅ | `organization_invites`, service role 수락, `/invite/[token]`, Settings 멤버 탭 |
| 10 확장 Resend | ✅ | 초대 이메일 자동 발송 (`lib/email/resend.ts` + template), best-effort, `RESEND_API_KEY` 등록 완료. 샌드박스 상태 — 도메인 verify 시 외부 발송 |
| + 기술부채 | ✅ | `AUTH_ENFORCED` 토글 제거, 로그인 open-redirect 방어, vet-info 하드코딩 제거 + 로잔 seed, profiles RLS super_admin 가시성 수정, memberships→profiles 중첩 select FK 부재 우회 (2회 쿼리 merge) |

**Phase 6 (Org 스위처 UI)** 는 단일 테넌트 맥락상 의도적 skip. 두 번째 테넌트 도입 시 구현.

### 다음 세션 시작 체크리스트

1. **최신 git log** — `git log --oneline -20` 으로 마지막 세션 커밋 확인

2. **펜딩 SQL 적용 확인** — 2026-04-22 세션에서 모두 양쪽 프로젝트 Run 확인됨:
   - ~~`20260422000006_drop_app_settings.sql`~~ ✅
   - ~~`20260422000007_seed_rojan_company_info.sql`~~ ✅
   - ~~`20260422000008_profiles_policy_fix.sql`~~ ✅ (super_admin 타 프로필 SELECT 버그)

3. **외부 설정 진행 여부** (아래 "외부 설정 잔여" 섹션 참조)
   - Google OAuth (가장 빠름, 1시간 내)
   - Resend 도메인 verify (도메인 소유 시)
   - Kakao 비즈앱 검수 대기 상태
   - Naver custom OIDC (복잡도 높음, 후순위)

4. **Mumbai 삭제 일정** — 2026-05-05 전후로 1~2주 정상 동작 검증 기간. 그 이후:
   - Supabase Dashboard → Mumbai 프로젝트 Settings → Delete
   - Kakao Developers Redirect URI 에서 Mumbai `.../jxya.../auth/v1/callback` 제거
   - `apps/admin/.env.local` 에서 구 Mumbai 슬롯(`NEXT_PUBLIC_SUPABASE_URL` 등) 제거, `NEW_*` 를 정식 이름으로 rename
   - Vercel env 도 동일 정리
   - `apps/admin/scripts/migrate-*.mjs` 와 `rename-*.mjs` 는 역할 끝났으니 삭제

5. **다음 구현 대상 후보** (우선순위 본인 판단):
   - Phase 11 `apps/portal` B2C 스캐폴딩 (큰 스코프)
   - Sentry 에러 추적 (오늘 본 bug 류 예방)
   - 결제/요금제 기반 설계 (Stripe vs 토스)
   - 토스트 알림 시스템 (인라인 에러 → 글로벌)
   - CSV 내보내기 (Settings > 데이터 관리 placeholder 완성)

### 외부 설정 잔여 (OAuth 프로바이더 + 이메일 도메인)

로그인 버튼은 UI 에 이미 있음 (`/login` 페이지, Naver/Kakao/Google + 이메일). 하지만 프로바이더별 Supabase 설정 + 외부 콘솔 등록이 필요함.

#### Google OAuth

**현재 상태**: 미설정. 로그인 버튼 클릭 시 에러 예상. 코드는 `provider: 'google'` 로 signInWithOAuth 호출.

**절차** (1회성):
1. https://console.cloud.google.com → 새 프로젝트 생성 (예: `petmove-auth`)
2. APIs & Services → OAuth consent screen → External → 앱 이름 `펫무브워크`, 지원 이메일 본인, 개발자 연락처
   - Scopes: email, profile, openid (기본)
   - Test users: 개발 중인 유저 추가 (Published 전)
3. APIs & Services → Credentials → **Create Credentials** → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Name: `Supabase Seoul`
   - Authorized redirect URIs: `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback`
4. 발급된 Client ID / Client Secret 복사
5. https://supabase.com/dashboard/project/ugywxiyivfzflqkcnqvu/auth/providers → **Google** 토글 ON → Client ID / Secret 붙여넣기 → Save
6. (Mumbai 삭제 전까지는 동일 작업을 Mumbai 에도 반복)
7. production verify: `petmove.vercel.app/login` → "Google 로 로그인" 성공 확인

**블로커**: 없음. 1시간 내 완료 가능.

#### Kakao OAuth

**현재 상태**: **블로커**. 비즈앱 미등록으로 KOE205 에러. Mumbai 에만 설정 완료, Seoul 미복제.

**절차 (비즈앱 검수 통과 후)**:
1. https://developers.kakao.com/console/app/1098838 — 카카오 앱 콘솔
   - 비즈 전환 신청 (사업자등록증 필요) → 승인 (수일 소요)
2. 앱 설정 → 카카오 로그인 → Redirect URI → **편집**:
   - 추가: `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback` (Seoul)
   - 기존 Mumbai `.../jxya.../auth/v1/callback` 은 Mumbai 삭제 시 함께 제거
3. 동의 항목 → 이메일(account_email) 필수 체크 (비즈앱이어야 가능)
4. Supabase Seoul Providers → Kakao 토글 ON → REST API 키 + Client Secret 붙여넣기
5. Mumbai Kakao 설정(Client ID/Secret) 과 동일 값인지 확인 (같은 카카오 앱 사용)
6. verify: `/login` → "카카오로 로그인" → KOE205 없이 진행

**블로커**: 비즈앱 검수 (외부). 기간 불확실.

#### Naver OAuth (커스텀 OIDC)

**현재 상태**: 미설정. Supabase builtin 아님 — **Custom OIDC provider** 로 등록 필요.

**절차**:
1. https://developers.naver.com/apps → 애플리케이션 등록
   - 애플리케이션 이름: `펫무브워크`
   - 사용 API: **네이버 로그인**
   - 환경: PC 웹
   - 서비스 URL: `https://petmove.vercel.app`
   - Callback URL: `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback`
2. 등록 완료 후 Client ID / Client Secret 확인
3. Supabase 는 Naver 를 built-in 지원 안 함 → **Custom OIDC** 로 등록:
   - 현재 Supabase Custom OIDC 는 Enterprise 플랜 이상 또는 직접 JWT 교환 구현 필요
   - **실용적 대안**: Naver ID 를 이메일로 변환해 이메일 로그인으로 우회, 또는 클라이언트에서 Naver SDK 직접 사용 → JWT 받아서 Supabase signInWithIdToken 호출
   - 또는 `login-form.tsx` 의 Naver 버튼을 일단 숨김 처리 (Phase 11 이후 재검토)

**블로커**: Supabase 플랜 업그레이드 OR 커스텀 OIDC 브릿지 구현. 비용·복잡도 있음.

#### Resend 이메일 도메인 verify

**현재 상태**: API 키 등록 완료. 샌드박스(`onboarding@resend.dev`) 로 본인(`off2030@gmail.com`) 에게만 발송 가능.

**절차 (외부 발송 가능하게)**:
1. 본인 소유 도메인 (예: `petmove.com`, `petmove.co.kr`) 준비
2. https://resend.com/domains → **Add Domain** → 도메인 입력
3. 제시되는 DNS 레코드 (MX, TXT SPF, TXT DKIM, 선택적으로 DMARC) 를 도메인 등록업체(가비아, Cloudflare 등) 콘솔에 추가
4. Resend 콘솔에서 **Verify** → 녹색 체크 (보통 10분, 최대 24시간)
5. Vercel env `INVITE_EMAIL_FROM=invites@petmove.com` 추가 + Redeploy
6. 검증: 임의 이메일로 초대 생성 → 수신 확인

**블로커**: 도메인 소유 필요.

### 마이그레이션 이후 남는 작업 (우선순위순)

**SaaS 런칭 전제조건**
- 결제/요금제 (Stripe/토스, plans 테이블, 사용량 미터링)
- 공개 가입 플로우 (super_admin 수동 org 생성 → 고객 self-service 가입)
- 이용약관·개인정보처리방침 페이지 (법적)
- GDPR/KISA 개인정보보호법 준수 (삭제 요청, 내보내기, 동의)

**Phase 11+ 확장**
- `apps/portal` B2C 고객용 앱 (Phase 11)
- i18n (현재 한국어 하드코딩)
- ~~초대 이메일 자동 발송 (Resend/AWS SES)~~ **완료** — Resend 연동, 도메인 verify 만 대기

**운영 품질**
- 에러 추적 (Sentry)
- 사용량 분석 (PostHog/Plausible)
- Audit log — super_admin 의 임시 기관 전환·조작 기록
- 성능: `/cases` 가 전체 데이터 인메모리 로드 — 10,000+ 스케일 시 페이지네이션·가상 스크롤
- 백업 자동화 (Phase 0 는 CSV 수동 내보내기)

**UX 폴리싱**
- 토스트 알림 시스템 (현재 인라인만)
- CSV 내보내기 (Settings > 데이터 관리 탭 placeholder)
- Super Admin UI 확장 — 임시 기관 전환(impersonation), 멤버 CRUD UI
- Mobile 반응형 점검

**코드 위생**
- `apps/admin/scripts/import-xlsx.mjs` 하드코딩 ORG_ID (CLI 도구, 낮은 우선순위)
- `apps/admin/data/vaccine-products.json` + `packages/domain/src/data/vaccine-products.json` 중복 (스크립트 전용, 허용 중)
- Vercel env `AUTH_ENFORCED` (코드에서 제거됨, Vercel dashboard 에서 삭제하면 깔끔)

### 오늘 생성된 핵심 파일

- `supabase/migrations/20260422000001_memberships.sql` ~ `20260422000007_seed_rojan_company_info.sql` (7개)
- `apps/admin/lib/supabase/active-org.ts` — `getActiveOrgId()` 헬퍼
- `apps/admin/lib/supabase/admin.ts` — service role client
- `apps/admin/lib/actions/invites.ts` — create/list/revoke/accept/listMembers
- `apps/admin/lib/actions/super-admin.ts` — listAllOrgs/getOrgDetail/createOrg
- `apps/admin/scripts/set-password.mjs` — Auth 비번 직접 설정 (recovery 우회)
- `apps/admin/app/invite/[token]/page.tsx` — 초대 수락 핸들러
- `apps/admin/app/super-admin/page.tsx` + `components/super-admin/super-admin-app.tsx`
- `apps/admin/components/settings/members-section.tsx` — 멤버 탭
- `apps/admin/app/login/login-form.tsx` — 서버 가드 + 클라이언트 폼 분리

### 재현 불가능한 결정 (복기용)

- **Seoul RLS 불일치**: schema-consolidated 로 Seoul 생성 시 기본 RLS on 으로 테이블 생성 + policy 0개 → 전부 차단. Phase 5 직전 `DISABLE ROW LEVEL SECURITY` 수동 실행해서 Mumbai 와 맞춤 → Phase 5 에서 policy 작성 후 정식 enable
- **Supabase direct DB hostname IPv4 불가**: `db.<ref>.supabase.co` 는 IPv6-only. `pg` 로 migration apply 시도는 실패. 이후 작업은 SQL Editor 로만
- **Auth 비번 이관 한계**: `migrate-auth-users.mjs` 는 bcrypt 해시 이식 불가라 임시 비번 재생성. `set-password.mjs` 로 우회. recovery 플로우는 아직 없음 (Phase 11+)

---

### Phase 3 완료 (2026-04-22)

- [x] `supabase/migrations/20260422000001_memberships.sql` 생성 — Seoul 에 SQL Editor 로 적용
- [x] `memberships(user_id, org_id, role)` 테이블 + 유니크/체크 제약 + updated_at 트리거
- [x] `organizations` id=…001 이름을 "PetMove" → **"로잔동물의료센터"** rename
- [x] `petmove@naver.com` → 로잔 `owner` row 삽입
- 앱은 아직 memberships 안 씀 → 운영 영향 0. RLS 도 off 유지 (Phase 5 에서 enable + policy 작성)

### Phase 4 완료 (2026-04-22)

- [x] `supabase/migrations/20260422000002_case_history_org_id.sql` 생성 — Seoul 적용
- [x] `case_history.org_id` 추가 (nullable) → `cases.org_id` 로 백필 → NOT NULL + index
- [x] Seoul 백필 결과: 1,106행 전부 로잔 단일 org (distinct_orgs=1)
- **스코프 판단**:
  - `cases.org_id` / `field_definitions.org_id` 는 initial_schema 단계부터 존재 → 작업 없음
  - `calculator_items` — 국가별 견적 아이템, 플랫폼 공용 유지 (Phase 5 RLS 에서 authenticated 전체 select 로 처리)
  - `app_settings` — Phase 7 에서 `organization_settings` 로 분리 예정이라 보류
- 앱 쿼리는 아직 org_id 필터 안 씀 → 운영 영향 0

### Phase 5 완료 (2026-04-22)

**코드 변경** (commit `aba72d6`):
- `lib/supabase/active-org.ts` — `getActiveOrgId()` 헬퍼 (단일 org 전제, memberships 조회)
- `create-case`, `create-case-with-data` — 하드코딩 ORG_ID → `getActiveOrgId()`
- `duplicate-case` — `source.org_id` 상속 (cross-org 복제 차단)
- `cases.updateCaseField` — case_history insert 에 org_id 주입 (Phase 4 NOT NULL 대응)
- `apply-case` — 공개 플로우라 하드코딩 유지 (RLS 의 anon INSERT policy 로 허용)

**DB 변경** (`supabase/migrations/20260422000003_phase5_rls.sql`):
- 헬퍼 함수 2개: `is_super_admin()`, `is_org_member(org_id)` (둘 다 `security definer`)
- cases / case_history / field_definitions / organizations / memberships / calculator_items / app_settings RLS enable + 정책 작성
- 공개 `/apply` 용 anon INSERT policy (로잔 org 한정)
- 롤백 파일: `20260422000003_phase5_rls_rollback.sql`

**리허설 & 검증** (Mumbai = staging):
- [x] Mumbai 에 Phase 3+4+5 catch-up 적용
- [x] super_admin(`petmove@naver.com`) — 1,798건 표시 ✅
- [x] 멤버십 없는 유저(`petmove.drive@gmail.com`) — 0건 ✅ (RLS 차단 증명)
- [x] 멤버십 추가 후 — 1,798건 표시 ✅

**Production 적용**:
- [x] Seoul 에 Phase 5 RLS SQL 적용
- [x] `petmove.vercel.app/cases` 1,835건 정상
- [x] case 수정 → case_history insert org_id 채워짐 확인 (최근 5행 전부 로잔)

### Phase 7 완료 (2026-04-22)

- [x] `supabase/migrations/20260422000004_organization_settings.sql` — Mumbai + Seoul 적용
- [x] `organization_settings(org_id, key, value jsonb)` 테이블 + RLS (본인 org or super_admin) + updated_at 트리거
- [x] 기존 `app_settings` 2행 → `organization_settings` (로잔) 로 이관 — 양쪽 환경 동일
- [x] 앱 코드 4개 교체 — `from('app_settings')` → `from('organization_settings').eq('org_id', orgId)`:
  - `lib/vet-info.ts` (company_info)
  - `lib/inspection-config.ts`
  - `lib/cert-config.ts`
  - `lib/import-report-config.ts`
- `app_settings` 테이블은 당분간 유지 (정리는 Phase 8+ 또는 별도 clean-up)

### Phase 8 완료 (2026-04-22)

- [x] `packages/domain/src/` 로 client-safe 도메인 로직 이동:
  - `destination-config.ts`
  - `inspection-config-defaults.ts`
  - `cert-config-defaults.ts`
  - `import-report-defaults.ts`
  - `vaccine-lookup.ts` + `data/vaccine-products.json`
- [x] `packages/domain/src/index.ts` 에서 flat re-export
- [x] `packages/domain/tsconfig.json` 추가
- [x] `apps/admin/package.json` 에 `@petmove/domain: workspace:*` dep 추가
- [x] admin 코드 21개 파일 import 경로 `@/lib/X` → `@petmove/domain` 으로 일괄 교체 (sed)
- [x] admin 빌드 통과
- ~~**보류**: `procedure-checks/` 는 `CaseRow` 타입(DB-backed)에 의존 → 별도 Phase 에서 타입 분리 후 이동~~ **완료** — Phase 8 확장 commit 에서 처리
- **Phase 8 확장 (2026-04-22)**: `packages/domain/src/types.ts` 에 `CaseRow`/`CaseStatus`/`FieldDefinition`/`CalculatorItem` 정의, `procedure-checks/` 를 `packages/domain/src/procedure-checks/` 로 이동. `apps/admin/lib/supabase/types.ts` 는 domain re-export shim 으로 변환 — 44개 admin 파일 import 경로 유지
- **중복 주의**: `apps/admin/data/vaccine-products.json` 은 admin 스크립트들(test-*.mjs)이 사용 중이라 남김 (도메인 패키지에도 사본 유지)

### Phase 10 완료 (2026-04-22)

**DB** (`supabase/migrations/20260422000005_organization_invites.sql`):
- `organization_invites(id, org_id, email, role, token uuid unique, expires_at, created_at/by, accepted_at/by)` — token 기반 초대
- 헬퍼 `is_org_admin(org_id)` (security definer) — owner/admin 여부
- `memberships` SELECT 정책 확장 — 본인 + super_admin + 같은 org 의 owner/admin
- invites RLS — 관리 권한은 owner/admin + super_admin. 수락 플로우는 service role 우회

**코드**:
- `lib/supabase/admin.ts` — `createAdminClient()` (service role, 토큰 기반 수락 등 신뢰 플로우 전용)
- `lib/actions/invites.ts` — createInvite / listInvites / revokeInvite / listMembers / acceptInvite
- `app/invite/[token]/page.tsx` — 수락 핸들러. 미로그인 시 `/login?next=/invite/TOKEN` 리다이렉트, 로그인 후 자동 수락 → /cases
- `components/settings/members-section.tsx` — 멤버 목록 + 대기 초대 + 생성 폼 (초대 생성 시 링크 자동 복사)
- settings-app: "멤버" 탭 추가

**수락 플로우**:
1. Owner/admin 이 Settings → 멤버 에서 이메일+역할 입력 → "초대 생성" → 링크 자동 복사
2. 대상자에게 링크 공유 (이메일 발송은 수동 — Phase 11+ 에서 Resend 연동 검토)
3. 대상자 링크 클릭 → 미로그인 시 `/login` → 로그인 후 `/invite/TOKEN` 자동 재진입 → acceptInvite → membership 자동 추가 → `/cases` 로
4. 이메일 불일치 / 만료 / 이미 수락됨 시 에러 화면 표시

### Phase 9 완료 (2026-04-22)

- `app/super-admin/page.tsx` — is_super_admin 체크 후 전체 조직 목록 표시 (비 super_admin 은 /cases 리다이렉트)
- `components/super-admin/super-admin-app.tsx` — 좌측: 조직 목록 + 생성 폼, 우측: 선택 조직 상세 (멤버·대기 초대)
- `lib/actions/super-admin.ts` — `listAllOrgs`, `getOrgDetail`, `createOrg` (전부 `requireSuperAdmin` 가드 + service role)
- UI 진입점: 현재는 direct URL `/super-admin` 만. 토바 링크는 추가 안 함 (is_super_admin flag topbar 전달 플러밍 비용 대비 이득 낮음 — 북마크 권장)

### Phase 0 완료 (2026-04-21)

- [x] 기존 작업 5개 커밋 + push (master)
- [x] `.gitignore`에 백업 파일 패턴 추가
- [x] DB 데이터 CSV 백업 (Table Editor → Export)
- [x] DB 비밀번호 리셋 (`.env.local`에 `SUPABASE_DB_PASSWORD` 저장)
- [x] Supabase Secret key 로테이트 (구 키 삭제)
- [x] Supabase Publishable key 로테이트 (구 키 삭제)
- [x] OpenAI Key 로테이트
- [x] Kakao REST API Key 로테이트
- [x] Vercel env 5종 동기화 + Redeploy
- [x] 프로덕션(`petmove.vercel.app/cases`) 정상 동작 확인

### Phase 1 완료 — 모노레포 재배치 (2026-04-21, saas-migration 브랜치)

- [x] `saas-migration` 브랜치 생성 (master 분기)
- [x] pnpm(10.33.0) 설치 + `.npmrc` (`node-linker=hoisted` — Windows pnpm 호환)
- [x] 코드 이동 → `apps/admin/` (app·components·lib·data·public·scripts + next/postcss/tailwind/tsconfig + .env.local/.env.example)
- [x] 루트 `package.json`을 워크스페이스 루트로 축소 (turbo + supabase CLI만 유지) / `apps/admin/package.json`에 Next.js deps 이관
- [x] `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
- [x] `turbo.json` (build/dev/lint/start tasks)
- [x] `packages/{db,domain,auth,ui}/` 빈 뼈대 (`@petmove/*` scoped)
- [x] 로컬 검증 — `pnpm -F admin build` 성공, `pnpm dev` (turbo) 구동, `/apply` 200, `/cases` 200
- [x] Vercel 배포 설정 업데이트 — Root Directory `apps/admin`, "Include files outside the root directory" Enabled (pnpm-workspace·packages/ 접근용), Turborepo 자동 감지
- [x] PR #1 프리뷰 빌드 성공 → master 병합 (`b84aa38`) → `petmove.vercel.app/cases` 200

**주의** — 새 컴퓨터·worktree에서 시작 시: Phase 0에서 로테이트된 키가 이 기기의 `.env.local`에 없을 수 있음. `apps/admin/.env.local`을 Supabase 대시보드 현재 키로 덮어쓸 것.

### Phase 2 완료 — Supabase Auth + Email 로그인 (2026-04-21)

**적용 커밋**
- `624d0a5` — Auth 스캐폴딩 (profiles migration, /login, /auth/callback, /logout, proxy.ts)
- `19e1e79` — /login Suspense 래핑 (useSearchParams prerender 이슈)
- `1cdc3c6` — PR #2 merge to master
- `9fb70f7` — browser client 을 `@supabase/ssr createBrowserClient` 로 전환 (SSR 쿠키 공유 필수)
- `20260421000002_profiles_rls_fix.sql` — profiles RLS 자기참조 재귀 제거

**최종 계정**
- Supabase Auth user: `petmove@naver.com` (ID `29b97da2-b3f5-4e28-854b-29eeb23504bf`)
- `profiles.is_super_admin = true`

**Vercel env**
- `AUTH_ENFORCED=true` (Production only)

**운영 엔드포인트**
- `/login` — 네이버/카카오/구글 버튼 (아직 disabled) + 이메일 로그인
- `/auth/callback` — OAuth code→session 교환 (소셜 추가 시 활성)
- `/logout` — signOut 후 `/login` 리다이렉트
- `proxy.ts` — 인증 체크(로그인만 되면 통과, Phase 3 전까지 super_admin 게이트 완화 — `0ae0bf3`)
  - 접근 통제는 Supabase Dashboard → Authentication → Users → "Add user" 로 초대받은 계정만 가능
  - 현재 2명: `petmove@naver.com` (super_admin), `petmove.drive@gmail.com` (신규 직원 계정)

**미완료(다음 단계)**

- [ ] Google OAuth provider 활성화 (GCP OAuth Client 생성 → Supabase Google provider 에 Client ID/Secret 등록)
- [~] Kakao OAuth provider 활성화 — **블로커**(비즈앱 미등록으로 `account_email` 검수 불가). 상세: 아래 "Phase 2.5 Kakao 상태"
- [ ] 네이버 로그인 — **리스크 확인 필요**: 정식 OIDC `id_token` 대신 OAuth2 access_token → Supabase "Custom OIDC" 호환 안 될 수 있음
  - 대안 A: 자체 `/api/auth/naver` route → naver access_token → 이메일 조회 → Supabase admin API (service_role) 로 user 매칭 → magic link 세션 발급
  - 대안 B: 네이버 제외
- [ ] 앱 헤더에 로그인 유저 표시 + 로그아웃 버튼 (현재 `/logout` 수동 URL 접속만 가능)
- [x] Supabase URL Configuration: Site URL + Redirect URL allowlist (Kakao 세팅하며 완료)

**디버깅 노트**
- 최초 로그인 실패 원인 2가지:
  1. `lib/supabase/browser.ts` 가 `@supabase/supabase-js` 의 `createClient` 사용 → localStorage 저장 → middleware(server) 가 세션 못 봄. `@supabase/ssr createBrowserClient` 로 교체 후 해결.
  2. `profiles_self_select` 정책의 EXISTS 자기 참조 → 재귀로 서버측 select 실패 → `super_admin` 체크 항상 false. 정책을 `auth.uid() = id` 단일 조건으로 단순화.

매 Phase 끝날 때 이 섹션을 업데이트한다.

### Phase 2.5 Kakao 상태 (2026-04-21, 블로커)

**요약** — Kakao OAuth 버튼이 Supabase callback 까지는 도달하나, `account_email` 동의항목 미설정으로 KOE205. 비즈앱 전환 + 검수 없이는 해결 불가. 다음 세션에 아래 3개 경로 중 하나 선택 후 진행.

**완료한 설정**

- Supabase Dashboard → Authentication → Providers → **Kakao** Enabled
  - Client ID: `d09f09c097ed58ffefa70fc788fd263a` (petmovework REST API key)
  - Client Secret: petmovework 키에 붙여둔 것
  - Callback URL(=Supabase 가 보여주는): `https://jxyalwbstsqpecavqfkb.supabase.co/auth/v1/callback`
- Supabase Dashboard → Authentication → **URL Configuration**
  - Site URL: `https://petmove.vercel.app`
  - Redirect URLs: `https://petmove.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`
- Kakao Developers (앱 ID `1098838`, 이름 "펫무브")
  - 앱 설정 → 플랫폼 키 → **petmovework (REST API)** 키 수정
  - 카카오 로그인 리다이렉트 URI 등록: `https://jxyalwbstsqpecavqfkb.supabase.co/auth/v1/callback`
  - 카카오 로그인 → 일반 → 사용 설정 **ON**, OpenID Connect OFF
  - 동의항목
    - `profile_nickname` → **선택 동의** (목적: "로그인 후 관리자 이름 표시")
    - `profile_image` → **선택 동의**
    - `account_email` → **권한 없음** (비즈앱만 설정 가능 — 클릭 불가)
- 코드 커밋 `eb2fb68` — `apps/admin/app/login/page.tsx` 에서 Kakao 일 때만 `scopes='profile_nickname profile_image'` override (기본 `account_email` 포함을 피하려는 시도)

**현재 블로커**

- Supabase GoTrue 서버가 Kakao provider 기본 scope 에 `account_email` 을 **강제 머지**함. 클라이언트 `options.scopes` override 로 제외 불가 (실측: 2단계 인증 이후 KOE205 에러 메시지에 `account_email` 만 남음).
- 앱이 **비즈앱 아님** (`추가 기능 신청` 페이지에서 "이 앱은 비즈 앱이 아닙니다"). 따라서 `account_email` 동의항목 자체를 설정할 수 없음.

**다음 세션 — 선택지 3개**

**경로 A — 비즈앱 전환 + account_email 검수** (정석)
- 사업자등록번호 또는 단체 정보 등록 → 비즈앱 전환
- `카카오 로그인 → 동의항목 → 카카오계정(이메일)` → 선택 동의 + 동의 목적 입력
- 검수 제출 (사유·스크린샷·개인정보처리방침 URL 필요)
- 승인까지 보통 1~3영업일
- 완료되면 현재 설정으로 바로 동작

**경로 B — Google OAuth 먼저** (우회)
- Kakao 는 비즈앱 승인 대기로 두고, Google 로 Phase 2.5 마감
- GCP Console → APIs & Services → OAuth consent screen + Credentials → OAuth Client ID (Web)
  - Authorized redirect URI: `https://jxyalwbstsqpecavqfkb.supabase.co/auth/v1/callback`
- Supabase → Authentication → Providers → Google → Client ID/Secret 붙여넣기
- `apps/admin/app/login/page.tsx` Google 버튼은 이미 배선돼 있음 — provider 만 켜면 동작
- 소요 1~2시간

**경로 C — 커스텀 Kakao OAuth 라우트** (최후 수단)
- Supabase GoTrue 의 기본 scope 강제를 우회하는 자체 구현
- `apps/admin/app/api/auth/kakao/route.ts` 신설
  - `GET`: `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&scope=profile_nickname%20profile_image` 로 리다이렉트 (내가 원하는 scope 만)
  - callback: code → `/oauth/token` → access_token → `/v2/user/me` 로 nickname+kakao_id 조회
  - Supabase admin API (`supabaseAdmin.auth.admin.createUser` / `generateLink`) 로 유저 생성 + magic link 세션 발급
- 구현·디버깅 최소 4~6시간, 이메일 없이 유저 매칭을 어떻게 할지 별도 결정 필요 (kakao_id 를 user metadata 에 저장)
- 네이버 OIDC 비호환 대비 대안 A 와 동일 패턴이므로 재사용 여지 있음

**권장** — B(Google) 로 Phase 2 마감 → A(비즈앱) 는 백그라운드에서 검수 대기 → 둘 다 끝나면 Phase 3 진입.

### Phase 2.6 Seoul 리전 이관 (2026-04-22, Step 1~4 완료)

**결과 요약**
- 신규 프로젝트: `ugywxiyivfzflqkcnqvu` (ap-northeast-2 Seoul)
- 기존 프로젝트: `jxyalwbstsqpecavqfkb` (ap-south-1 Mumbai) — **유지** (1~2주 보관 후 삭제)
- 데이터 이관 검증: src/dst 전 테이블 행수 일치 (organizations 1, field_definitions 46, cases 1835, case_history 1106, app_settings 2, calculator_items 228, profiles 2)
- Storage: 162/162 파일 복사
- Auth: 2명 UUID 유지 생성 (임시 비번 발급됨 — 카카오 로그인 사용 중이므로 실사용엔 영향 없음)
- Vercel env 3종 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) → Seoul 값으로 교체 + Redeploy 완료
- Supabase Seoul Auth URL Configuration: Site URL + Redirect URLs 2개 등록 완료

**실행 중 만난 이슈 & 해결**
- 한글 문자 인코딩: `clip.exe` (Git Bash) → Windows 클립보드 경로에서 CP949 로 깨짐. PowerShell `Set-Clipboard` 로 해결 (스크립트는 UTF-8 그대로 보존됨)
- `cases.status='applied'` 43행 → 제약 `('진행중','완료','보류','취소')` 위반. `migrate-data.mjs` `transform` 으로 `applied` → `진행중` 매핑
- `calculator_items.id` 가 `generated always as identity` → 명시 삽입 불가. `transform` 으로 id 제거 + `(country,item_name)` 유니크를 conflict key 로 사용
- `field_definitions` dst에 92행 (seed 46 + src 46 중복). `fix-field-defs-dedup.mjs` 로 src 에 없는 id (seed 측) 46행 삭제

**Phase 2.6 Production 검증 완료 (2026-04-22 두 번째 세션 / 신규 PC)**

- [x] `apps/admin/.env.local` 재생성 (Mumbai = 정식 슬롯, Seoul = `NEW_*`)
- [x] Vercel `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 불일치 발견 → Seoul 키로 교체 + Redeploy
- [x] Auth 임시 비번 재설정 (`scripts/set-password.mjs` 신규 — service role 로 직접 갱신, recovery 플로우 없이 우회)
- [x] **RLS 불일치 발견 + 임시 수정**
  - Mumbai: `cases` / `case_history` / `field_definitions` / `organizations` 전부 RLS **off** (단일 기관이라 policy 없이 운영)
  - Seoul: schema-consolidated 적용 시 RLS **on** 으로 생성됨 + policy 0개 → 전부 차단 → UI 에서 "총 0건"
  - 임시 패치: Seoul SQL Editor 에서 위 4개 테이블 `DISABLE ROW LEVEL SECURITY` 실행 (Mumbai 와 동일 상태로 맞춤)
  - Phase 3 memberships 기반 RLS 재도입 시 다시 enable 하고 policy 작성 — `apps/admin/proxy.ts` 주석에도 이미 명시됨
- [x] 케이스 1,835건 / 계산기 228행 / 조직 설정 표시 확인

**Phase 2.6 잔여 (Kakao 비즈앱 블로커 해제 후)**

1. Supabase Seoul → Authentication → Providers → Kakao 복제
2. Kakao Developers → Redirect URI 추가: `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback`
3. 최종: 1~2주 정상 동작 확인 후 Mumbai 프로젝트 삭제 + `.env.local` 에서 `NEW_*` → 정식 이름 rename

---

**Phase 2.6 원본 체크리스트 (참고용 — 완료)**

0. **사전 준비 (다른 PC)**
   - `git pull` (이 커밋 포함)
   - `apps/admin/.env.local` 은 gitignore 됨 → Bitwarden/이전 PC 에서 값 가져오거나 Supabase Dashboard 에서 재복사
     - `NEW_SUPABASE_URL`, `NEW_SUPABASE_PUBLISHABLE_KEY`, `NEW_SUPABASE_SERVICE_ROLE_KEY`, `NEW_SUPABASE_DB_PASSWORD`
     - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (구 Mumbai — rollback 및 이관 스크립트용)
     - `OPENAI_API_KEY`, `KAKAO_REST_API_KEY`
   - `pnpm install` (필요 시)

1. **Supabase Seoul → Authentication → Providers → Kakao 복제**
   - Mumbai 설정을 그대로 복사: `https://supabase.com/dashboard/project/jxyalwbstsqpecavqfkb/auth/providers` → Kakao → Client ID / Secret 복사
   - Seoul: `https://supabase.com/dashboard/project/ugywxiyivfzflqkcnqvu/auth/providers` → Kakao → Enable + 같은 값 붙여넣기

2. **Kakao Developers → Redirect URI 추가**
   - `https://developers.kakao.com/console/app/1098838` → 카카오 로그인 → Redirect URI → 편집
   - **추가** (기존 Mumbai 것은 rollback 대비 유지): `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback`

3. **Production 검증**
   - `https://petmove.vercel.app` 접속 → 이메일 로그인 (`petmove.drive@gmail.com` 비번 동일, Mumbai 프로젝트에서 썼던 비번 그대로 — Auth 이관 시 **임시 비번으로 재생성** 되었음에 주의)
     - 기존 비번 안 먹히면 Supabase Dashboard → Authentication → Users → 해당 유저 ⋯ → "Send password recovery" 로 메일 발송
   - 케이스 목록 1,835건, 재무 계산기 228행, 조직 설정 등 모두 보이는지 확인
   - 카카오 로그인 버튼 클릭 → (이전 Phase 2.5 블로커인 KOE205 여전히 재현될 것 — 비즈앱 검수 전까지는 이메일로만 사용)
   - 체감 속도: Mumbai 시절 대비 로그인/페이지 전환 빨라졌는지

4. **최종**
   - 1~2주 이상 정상 동작 확인 후 Mumbai 프로젝트 삭제 (Supabase Dashboard → 프로젝트 Settings → Delete)
   - `.env.local` 에서 구 Mumbai 슬롯 (`NEXT_PUBLIC_SUPABASE_URL` 등) 제거 + `NEW_*` 를 정식 이름으로 리네임

**참고 — Auth 비번**
- `migrate-auth-users.mjs` 실행 시 2명에게 임시 비번이 새로 발급됨 (원래 Mumbai 비번은 bcrypt 해시라 이식 불가)
- 가장 깔끔한 방법: Seoul Dashboard → Authentication → Users → 해당 유저 ⋯ → "Send password recovery" 메일 발송 후 각자 재설정
- 임시 비번 값은 이관 당시 터미널 출력에 있음 — 커밋하지 않음

---

### Phase 2.6 Seoul 리전 이관 (초기 스펙 — 참고용)

**배경** — 현재 Supabase 프로젝트 리전이 `AWS ap-south-1` (뭄바이). 한국↔뭄바이 RTT 150~200ms 로 로그인·페이지 로딩 전반이 체감 느림. `ap-northeast-2` (Seoul) 로 이관하면 RTT 10~30ms.

**이관 규모 (가볍다)**
- DB: 0.035 GB (35 MB)
- Storage: 0.018 GB (18 MB) — `attachments` 버킷 1개, public, UUID 폴더 구조 (케이스별)
- Auth users: 2명 (`petmove@naver.com`, `petmove.drive@gmail.com`)
- Plan: Free (Nano) — 새 프로젝트도 Free 로 생성 가능

**이관이 건드리지 않는 것**
- Vercel 프로젝트·도메인 (`petmove.vercel.app` 그대로)
- Kakao Developers 앱 (단 Redirect URI 만 새 Supabase URL 로 교체 필요)
- GitHub 레포·코드 (env 만 바뀜)

**실행 순서 (총 30~40분)**

**Step 1 (Claude) — 덤프 + 스크립트 준비**
- `pg_dump` 로 기존 DB 전체 덤프 → `backups/pre-seoul-migration-YYYYMMDD.sql`
- Storage 이관 스크립트 (`apps/admin/scripts/migrate-storage.ts`) — 기존→신규 버킷 파일 스트리밍 복사
- Auth 유저 재생성 스크립트 (`apps/admin/scripts/migrate-auth-users.ts`) — service_role admin API 로 2명 생성, `is_super_admin` 플래그 복원
- 실행용 체크리스트 문서

**Step 2 (사용자) — 새 프로젝트 생성**
- Supabase Dashboard → "New Project"
- 이름: `petmove-seoul` (제안)
- Region: **Northeast Asia (Seoul) / `ap-northeast-2`**
- DB Password 설정 → Claude 에게 전달
- API Keys 3종 복사 → Claude 에게 전달 (Project URL, Publishable, Secret)

**Step 3 (Claude) — 스키마 + 데이터 + Storage + Auth 복원**
- 새 프로젝트에 migrations 적용 (`supabase db push` 또는 덤프 restore)
- `attachments` 버킷 생성 + 파일 복사 스크립트 실행
- Auth 유저 2명 재생성 + `profiles.is_super_admin = true` 복원 (petmove@naver.com)
- 로컬 `apps/admin/.env.local` 을 새 값으로 갱신 → `pnpm -F admin dev` 로 로그인·케이스 조회 검증

**Step 4 (사용자) — 프로덕션 전환**
- Vercel env 교체 (Redeploy):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY`
  - `SUPABASE_DB_PASSWORD`
  - (`OPENAI_API_KEY`, `AUTH_ENFORCED` 는 그대로)
- Supabase 새 프로젝트 → Authentication → URL Configuration:
  - Site URL: `https://petmove.vercel.app`
  - Redirect URLs: `https://petmove.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`
- Kakao Developers → petmovework REST API 키 수정 → Redirect URI 교체:
  - 기존: `https://jxyalwbstsqpecavqfkb.supabase.co/auth/v1/callback`
  - 신규: `https://<새프로젝트id>.supabase.co/auth/v1/callback`

**Step 5 (Claude) — 검증**
- 기존 vs 신규 테이블 row count 비교 쿼리
- Storage 파일 개수 비교
- 로그인 RTT 재측정 (지연 개선 확인)
- 이상 없으면 기존 프로젝트는 **1~2주 보관 후 삭제** (롤백 여지 남김)

**내일 재개 시 사전 점검**
- `apps/admin/.env.local` 에 `SUPABASE_DB_PASSWORD` 있는지 (Phase 0 에서 저장됨)
- `pg_dump --version` 동작 여부 (없으면 `supabase db dump` CLI 대체)
- Storage 버킷 최상단 경고 "Clients can list all files" — 이관과 무관, Phase 5 RLS 정비 때 같이 처리

**리스크**
- Free 플랜이라 "Migrate project" 기능 없음 → 신규 프로젝트 생성 방식으로만 가능
- Supabase 한 organization 당 Free 프로젝트 2개까지 허용 (현재 1개, 신규까지 2개 — 한도 내)
- 전환 직후 Kakao OAuth Redirect URI 미갱신 시 로그인 깨짐 → Step 4 순서 엄수

---

## 목표 구조

```
petmove/                      ← 모노레포 (pnpm workspaces + Turborepo)
  apps/
    admin/                    ← 현재 앱. B2B SaaS 관리자 (병원·에이전시 스태프)
    portal/                   ← 미래 B2C 고객 앱 (일반인 self-serve)
  packages/
    db/                       ← Supabase 클라이언트 + generated types + RLS 헬퍼
    domain/                   ← procedure-checks · destination-config · 백신·증명서 룩업 · 날짜 유틸
                              ★ SaaS 핵심 IP (공통 규정 검증 레지스트리)
    auth/                     ← Supabase Auth 래퍼 + OrgContext + 로그인 컴포넌트
    ui/                       ← (선택) 공통 프리미티브
  docs/                       ← 이 문서 등
```

---

## 핵심 결정 사항

### 1. 멀티 테넌트 모델
- **organizations** (기관) = 테넌트. 데이터 격리 단위.
- **memberships** (user_id, org_id, role) = 한 유저가 여러 기관에 각기 다른 역할로 소속 가능.
- **cases** 등 기관 소유 테이블은 `org_id` NOT NULL.
- **RLS**로 DB 레벨에서 기관 경계 강제.

### 2. 사용자 권한
- **기관 내 역할**: `owner` / `admin` / `member` / `viewer`
- **SaaS 전역 권한**: `profiles.is_super_admin = true` → 모든 기관 접근 (운영자용)
- 두 축 분리. super_admin은 RLS 정책에서 예외 조항으로 처리.

### 3. 인증
- **Supabase Auth** 기반
- Provider: 네이버(커스텀 OIDC) + 카카오(내장) + 구글(내장) + 이메일 백업
- 관리자 첫 계정: `pemove@naver.com` → `is_super_admin = true` + 로잔 `owner`

### 4. 검증·SOP·증명서 커스터마이즈
| 항목 | 범위 | 저장 |
|---|---|---|
| 국가별 법정 검증 규정 | SaaS 공통 | `packages/domain/procedure-checks/` 코드 |
| 기관 SOP (자체 체크) | 기관별 | `organization_custom_checks` 테이블 |
| 공통 체크 오버라이드 (심각도·문구) | 기관별 | `organization_check_overrides` 테이블 |
| 일정 템플릿 (출국일 기준 역산) | 기관별 | `organization_schedule_templates` 테이블 |
| 국가별 증명서 양식 | SaaS 공통 | `data/pdf-field-mappings.json` + 템플릿 PDF |
| 기관별 정보(주소·원장·서명·도장·로고) | 기관별 | `organization_settings` |
| 국가 → 증명서 매핑 규칙 | 기관별 오버라이드 가능 | `organization_settings.cert_config` |
| 기관 자체 양식 (invoice 등) | 기관별 (Phase 11+) | `organization_templates` + 업로드 |

### 5. 첫 고객
- **로잔동물의료센터** (`type = 'clinic'`)
- 기존 모든 데이터를 이 기관으로 backfill

---

## Phase 로드맵

각 Phase는 독립 배포·롤백 가능하도록 끊는다. ★ 표시가 실제 사용자 체감 영향 있는 cutover.

### Phase 0 — 안전장치 (반나절)
- [ ] DB 전체 덤프 백업 (로컬 `.sql`)
- [ ] Storage 버킷 상태 기록
- [ ] `saas-migration` 브랜치 생성 (main은 현재 운영)
- [ ] `.env.local` 백업

### Phase 1 — 모노레포 재배치 (1일) ✅
- [x] pnpm workspaces + Turborepo 셋업
- [x] 루트 코드를 `apps/admin/`로 이동
- [x] `packages/{db,domain,auth,ui}` 빈 뼈대 생성
- [x] 로컬에서 `pnpm -F admin dev` 정상 작동 확인
- [x] 배포 파이프라인 Vercel 업데이트 (Root Directory = `apps/admin`)
- 기능 변화 0, 운영 영향 0

### Phase 2 — Supabase Auth + 네이버 로그인 ★ (2일)
- [ ] 네이버 개발자 앱 등록 (callback URL 등록)
- [ ] Supabase Dashboard에 커스텀 OIDC 설정 (네이버) + 내장 Google·Kakao 활성화
- [ ] `profiles` 테이블 + `handle_new_user()` 트리거
- [ ] `/login` 페이지 (admin 앱) — 네이버·카카오·구글 버튼
- [ ] middleware — 로그인 없으면 `/login` 리다이렉트 (처음엔 **off** 상태로 배포)
- [ ] `pemove@naver.com`으로 첫 로그인 테스트 → `profiles` 로우 생성 확인
- [ ] SQL: `update profiles set is_super_admin = true where email = 'pemove@naver.com'`
- [ ] middleware **on** → 이후 앱 사용 시 로그인 필수 (이게 cutover)

### Phase 3 — 기관·멤버십 스키마 (1일)
- [ ] `organizations` 테이블
- [ ] `memberships` 테이블
- [ ] 로잔동물의료센터 row 삽입
- [ ] `pemove@naver.com` → 로잔 owner로 membership 추가
- 앱은 아직 이 테이블들을 사용 안 함 → 운영 영향 0

### Phase 4 — 기존 데이터에 org_id 추가 (1일)
- [ ] `cases` + 기관 소유 테이블들에 `org_id uuid` 추가 (nullable 시작)
- [ ] 전부 `org_id = 로잔 id`로 backfill
- [ ] NOT NULL 강제
- 앱은 아직 이 컬럼 사용 안 함 → 운영 영향 0

### Phase 5 — RLS 활성화 + 앱 코드 반영 ★ (1~2일)
- [ ] staging에서 전체 리허설
- [ ] RLS 정책 작성 (cases 외 모든 기관 소유 테이블)
- [ ] 앱 쿼리에 `org_id` 필터 추가 + 쓰기 시 `org_id` 자동 주입
- [ ] super_admin 예외 조항 모든 정책에 포함
- [ ] 스모크 테스트: 케이스 CRUD, 검증 동작, PDF 발급
- 운영 영향 있음 — staging 검증 필수

### Phase 6 — Org 컨텍스트 UI (1~2일)
- [ ] `packages/auth`에 `OrgContext` + `useOrg()` 훅
- [ ] 로그인 후 `memberships` 조회 → 소속 기관 로드
- [ ] 토바에 기관 스위처 (1개면 이름만 표시, 2개+면 드롭다운)
- [ ] localStorage로 최근 선택 기관 저장

### Phase 7 — 설정 분리 (1~2일)
- [ ] `organization_settings(org_id, key, value JSONB)` 테이블
- [ ] 기존 `app_settings` 데이터 → `organization_settings` 이관 (org_id = 로잔)
- [ ] 서버 액션들(`saveInspectionConfig`, `saveCertConfig`, `saveImportReportConfig`, `saveCompanyInfo`)이 `currentOrgId` 수신
- [ ] 설정 탭 UI는 현재 기관 컨텍스트 사용
- [ ] 신구 병행 기간 두고 검증 후 legacy 테이블 제거

### Phase 8 — domain 패키지 추출 (1일)
- [ ] `procedure-checks/`, `destination-config.ts`, `cert-config-defaults.ts`, `vaccine-lookup.ts`, `inspection-config-defaults.ts`, 날짜 유틸을 `packages/domain/`으로 이동
- [ ] admin 앱 import 경로를 `@petmove/domain/...`로 변경
- [ ] 기능 변화 0 — 순수 리팩터

### Phase 9 — Super Admin UI (0.5일)
- [ ] `/super-admin` 라우트 (`is_super_admin` 가드)
- [ ] 기관 목록·생성·멤버 조회
- [ ] 임시 기관 전환 기능 (감사 로그)

### Phase 10 — 초대·가입 플로우 (1~2일)
- [ ] `organization_invites(token, org_id, email, role, expires_at)`
- [ ] Settings > 멤버 탭 UI
- [ ] 초대 링크 → 소셜 로그인 → membership 자동 추가

### Phase 11+ — 확장 (우선순위 따라)
- **B2C 포털 스캐폴딩**: `apps/portal` 생성, 고객용 읽기 전용 뷰
- **결제**: Stripe 연동, `organizations.billing_status`
- **SOP 커스텀 체크**: `organization_custom_checks` + 설정 UI
- **일정 템플릿**: `organization_schedule_templates` + 출국일 입력 시 제안 다이얼로그
- **기관 자체 양식 업로드**: `organization_templates` + 필드 매핑 UI
- **다국어** 고객 안내 문구

---

## 연속성 메커니즘 (새 대화창에서 이어갈 때)

1. **자동 로드**: `MEMORY.md`에 "SaaS 전환 계획 존재 + 이 문서 경로" 기록됨 — 매 대화 시작 시 자동 참조
2. **이 문서 읽기**: 새 대화에서 "이어서 하자. `docs/saas-migration.md` 읽고 `git log --oneline -30` 확인해줘" 한 줄이면 내가 전체 맥락 복원
3. **진행 갱신**: 매 Phase 완료 시 이 문서의 "현재 상태" 섹션 + 해당 Phase 체크박스 업데이트 (커밋 메시지에 "update migration doc" 포함)
4. **결정 추가**: 전환 중 새로 합의한 결정 사항은 "핵심 결정 사항" 섹션에 append

---

## 리스크 & 대비책

| 리스크 | 영향 | 대비 |
|---|---|---|
| 네이버 OAuth 설정 오류로 로그인 불가 | 락아웃 | 매직 링크·구글·이메일 로그인 백업 활성화 |
| Phase 5 RLS 배포 후 쿼리 전부 실패 | 운영 중단 | staging 리허설 필수, 롤백 스크립트 (RLS drop) 미리 준비 |
| Phase 7 중 설정 읽기·쓰기 불일치 | 설정 페이지 오작동 | 신구 동시 쓰기 → 모니터링 → legacy 제거 순 |
| Backfill 중 새 케이스 생성 | 고아 레코드 | Backfill + NOT NULL 강제를 짧은 창에 같이 실행, 또는 default 값으로 로잔 id |
| 모노레포 전환 후 빌드·배포 실패 | 배포 중단 | staging에서 완전 검증 후 본 배포, 기존 설정 백업 |

---

## 참고

- 현재 코드베이스 구조는 `CLAUDE.md` 참조 (없으면 `/init`)
- 진행 이력: `git log --oneline` (Phase별 커밋 메시지 prefix: `[phase-N]`)
- 검증 시스템의 공통 규정 등록은 `lib/procedure-checks/jp.ts` 패턴 유지 → Phase 8에서 `packages/domain/procedure-checks/`로 이전
