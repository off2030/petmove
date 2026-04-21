# 펫무브워크 SaaS 전환 계획

**현재 단일 기관용 admin 앱을 멀티 테넌트 SaaS + 일반 고객용 B2C 앱(portal)으로 점진 전환.**

새 대화 창에서 이어갈 때 이 문서 + `git log --oneline -30` 확인하고 "현재 단계" 섹션부터 시작.

---

## 현재 상태

- **날짜**: 2026-04-21
- **완료된 Phase**: Phase 0 ✅, Phase 1 ✅
- **진행 중**: (없음)
- **다음**: Phase 2 — Supabase Auth + 네이버 로그인

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

### Phase 2 시작 전 체크리스트

1. `phase-2-auth` 브랜치 생성 (master 분기)
2. 네이버 개발자 앱 등록 (callback URL: `https://jxyalwbstsqpecavqfkb.supabase.co/auth/v1/callback`)
3. Supabase Dashboard → Authentication → Providers:
   - 커스텀 OIDC (네이버) 추가
   - Google 활성화
   - Kakao 활성화
   - Email/Password 활성화 (백업)
4. `profiles` 테이블 + `handle_new_user()` 트리거 migration 작성
5. `/login` 페이지 (admin 앱) 구현 — 네이버·카카오·구글 버튼
6. middleware 추가 (처음엔 **off** 상태로 배포)
7. `pemove@naver.com`으로 첫 로그인 → `profiles` 로우 확인
8. `update profiles set is_super_admin = true where email = 'pemove@naver.com'`
9. middleware **on** → cutover

매 Phase 끝날 때 이 섹션을 업데이트한다.

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
