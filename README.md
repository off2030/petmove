# PETMOVE 모노레포

반려동물 해외 이동 검역 사업의 **별도 두 앱**:

- **펫무브워크** (`apps/admin`) — 동물병원·에이전시 스태프용 B2B SaaS **웹앱**. 현재 prod 운영 중.
- **펫무브** / PETMOVE (`apps/portal`) — 보호자(고객)용 B2C **유료** **모바일 앱**. 웹(petmove.co.kr) + iOS/Android 네이티브(Capacitor remote URL). 베타 출시 직전.

DB·인증·도메인 규칙만 공유. UI·server actions·도메인 모델은 분리. 한 앱의 코드를 다른 앱에서 직접 import 하지 않는다. 폴더별 작업 룰은 [apps/admin/CLAUDE.md](apps/admin/CLAUDE.md) / [apps/portal/CLAUDE.md](apps/portal/CLAUDE.md).

## 구조

```
petmove/
├── apps/
│   ├── admin/                  Next.js 16 — B2B 스태프 콘솔 (현재 prod)
│   └── portal/                 Next.js 16 + Capacitor — B2C 보호자 앱
│                                · 웹: https://petmove.co.kr (예정)
│                                · iOS/Android: 앱스토어 (com.petmove.portal)
├── packages/
│   ├── auth/                   @petmove/auth — Supabase browser/server/admin 클라이언트
│   │                            · 서브패스: `.` (브라우저+admin), `./server` (next/headers 의존)
│   ├── domain/                 @petmove/domain — 도메인 로직·타입·데이터
│   │                            · procedure-checks, destination-config, fields, share-*
│   │                            · /data/*.json (breeds, colors, destinations)
│   └── ui/                     @petmove/ui — 공용 UI primitives
│                                · PageShell, ListRow, PillButton, DateTextField, Calendar, ...
├── supabase/migrations/        93개 SQL 마이그 — Seoul 프로젝트 (ugywxiyivfzflqkcnqvu)
├── scripts/
│   ├── lint-rls.mjs            RLS 무한 재귀 (42P17) 사전 검출
│   ├── lint-all.mjs            turbo lint + lint-rls 통합
│   └── backfill-case-customer-links.mjs   기존 케이스 ↔ 보호자 이메일 매칭 백필
├── docs/
│   ├── portal-plan.md          Phase 11.0 portal 개발 계획 단일 출처
│   ├── portal-deploy-checklist.md   Vercel + Capacitor + App Store/Play 배포 매뉴얼
│   ├── saas-migration.md       전체 SaaS 전환 로드맵
│   ├── design-system.md        Editorial 디자인 토큰
│   └── legal/{terms,privacy}.md   약관·개인정보처리방침 (1차 초안)
└── .github/workflows/ci.yml    push/PR 마다 lint (eslint + RLS) + tsc 자동
```

## 개발

### 첫 셋업
```bash
git clone https://github.com/off2030/petmove.git
cd petmove
pnpm install
pnpm db:link    # Supabase Seoul 프로젝트 연결
```

`.env.local` 3개 필요 (gitignored):
- `apps/admin/.env.local`
- `apps/portal/.env.local`
- (없으면 dev 서버 부팅 시 Supabase env 누락 에러)

`apps/<app>/.env.example` 참고. Supabase 공개 키 + service role 필요.

### dev 서버
```bash
pnpm --filter @petmove/admin dev    # admin → localhost:3001
pnpm --filter @petmove/portal dev   # portal → localhost:3002
```

### 빌드 / 린트 / 타입체크
```bash
pnpm build            # turbo build (admin + portal)
pnpm lint             # turbo lint (eslint) + lint:rls 둘 다 항상 실행
pnpm lint:rls         # RLS 재귀 정적 분석 단독 실행
pnpm exec tsc --noEmit -p apps/admin    # 패키지별 타입체크
```

### DB
```bash
pnpm db:diff          # 로컬 ↔ 원격 스키마 차이 미리보기
pnpm db:push          # 마이그 적용 (운영 DB)
pnpm db:reset         # 로컬 supabase 만 — 원격 영향 X
```

### Capacitor (portal native)
```bash
cd apps/portal
pnpm cap:sync                  # 웹 → native 동기화
pnpm cap:open:android          # Android Studio 열림
pnpm cap:open:ios              # macOS 에서만 — Xcode 열림
```

### 백필 (portal 출시 후)
```bash
pnpm backfill:case-links              # dry-run (변경 X)
pnpm backfill:case-links:apply        # 실제 INSERT
```

## 진행 상황

### admin (B2B) — prod 운영 중
- https://petmovework.vercel.app (도메인 분리 후 app.petmove.co.kr)
- 기능: 케이스 CRUD, 자동 검증·PDF 생성, 메시지, 검사·일정 관리, 결제, super-admin
- 마이그 93건 적용

### portal (B2C) — 베타 출시 직전
- Phase 11.0 (portal-plan.md):
  - 11.0.1 스캐폴딩 ✅
  - 11.0.2 packages/ui 승격 ✅
  - 11.0.3 인증 (customer_profiles) ✅
  - 11.0.4 케이스 매핑 (case_customer_links + RLS) ✅
  - 11.0.5 /share/[token] 이전 ✅
  - 11.0.6 /apply 이전 ✅
  - 11.0.7 내 케이스 목록·상세 ⏳ (디자인 freeze 대기, 데이터 레이어 준비됨)
  - 11.0.8 약관·개인정보처리방침 ✅
  - 11.0.9 PWA + 모바일 폴리싱 ✅
  - 11.0.10 베타 배포 ⏳ (Vercel 도메인 + Apple Dev + Play Console)

### 네이티브 앱
- Capacitor remote URL 모드 (Next.js 웹을 WebView 로 래핑, 콘텐츠 변경은 Vercel 재배포만으로 즉시 반영)
- Bundle ID: `com.petmove.portal` (등록 전 임시. Apple Dev 가입 후 등록 시도)
- Android 프로젝트 scaffold 됨 (apps/portal/android/)
- iOS 는 macOS 작업기에서 `pnpm exec cap add ios` 한 번 실행 필요

## 두 가지 주의 (사고 사례)

### 1. `@petmove/auth` 서브패스 분리
client component 가 `@petmove/auth` 만 import 해도 Next 가 server.ts (next/headers
의존) 를 client bundle 에 끌고 가서 build 실패. exports 를 두 개로 분리:
- `@petmove/auth` — browser + admin 클라이언트
- `@petmove/auth/server` — createClient (서버 전용, next/headers)

자세히: `packages/auth/README.md`.

### 2. RLS 무한 재귀 (42P17)
정책 본문에 inline `from public.<other_table>` subquery 가 있고 그 테이블 정책도
원래 테이블을 같은 패턴으로 참조하면 Postgres 가 무한 평가 → SSR 500.

**해결**: 교차 테이블 체크를 `SECURITY DEFINER` 함수로 우회 (`is_org_member`,
`is_case_customer` 등 패턴). 사례:
`supabase/migrations/20260511000001_fix_cases_customer_rls_recursion.sql`.

**예방**: `pnpm lint:rls` 가 양방향 사이클 자동 검출. CI 가 push 마다 실행.

## 라이선스

비공개 / 상업용.
