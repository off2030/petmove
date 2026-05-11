# 펫무브 (PETMOVE) — B2C 유료 모바일 앱 개발 계획

**`apps/portal` — 반려인(보호자)이 자기 케이스를 직접 보고, 입력하고, 추적하는 B2C 유료 모바일 앱.** 동물병원·에이전시 스태프용 SaaS 인 **펫무브워크**(`apps/admin`) 와는 **별도의 앱**. DB·도메인 규칙만 공유.

> 문서에서 **펫무브 / PETMOVE / portal** = 이 앱 (apps/portal). **펫무브워크 / admin** = 자매 SaaS (apps/admin). 두 앱은 코드·UI·도메인 분리.

상위 SaaS 전환 계획은 [`docs/saas-migration.md`](saas-migration.md) Phase 11. 본 문서는 펫무브 앱 자체의 비전·범위·데이터모델·마일스톤만 다룬다.

작성일 2026-05-10. 다음 작업자는 이 문서 + `git log --oneline -20` + admin 의 `app/share/[token]/`, `app/apply/` 부터 읽으면 된다.

---

## 1. 비전

> 보호자가 자기 반려동물의 출국 케이스를 **언제든 열어 진행 상황을 보고, 필요한 정보를 채우고, 발급된 서류를 받을 수 있는 단일 창구**.

### 한 줄 차이
- **펫무브워크** (B2B SaaS 웹앱, `apps/admin`): 병원·에이전시 스태프가 여러 케이스를 처리하는 운영 콘솔
- **펫무브** (B2C 유료 모바일 앱, `apps/portal`): 보호자가 자기 케이스 1~N건만 본인 시점에서 들여다보는 고객용 앱

### 왜 분리하는가
- **권한 모델이 다름** — admin 은 org 멤버십 기반, portal 은 케이스 단위 보호자 매핑
- **UX 톤이 다름** — admin 은 정보 밀도, portal 은 안심·진행감
- **번들 크기·복잡도** — admin 의 PDF 생성·자동화 룰·계산기 등은 portal 에 불필요
- **법적/규제** — portal 만 약관·개인정보처리방침의 수신자 동의 흐름이 들어감

---

## 2. 현재 자산 — 이미 admin 안에 살고 있는 고객 접점

portal 은 무에서 시작하지 않는다. 다음 3개 흐름이 이미 production 에서 동작 중이고, portal 의 시드가 된다.

| 경로 | 역할 | 인증 | portal 이전 시 |
|---|---|---|---|
| `/share/[token]` | 보호자가 토큰 URL 로 케이스 일부 필드 입력 (단발) | 토큰만 (anon) | **그대로 이전 + 확장** — 케이스 전체 뷰로 |
| `/apply` | 신규 케이스 신청서 (ko/en 다국어) | 토큰 (anon) | **portal 신청 페이지로 흡수** |
| `/invite/[token]` | 스태프 초대 수락 | 토큰 + 소셜 로그인 | admin 잔류 (B2B) |

**핵심 인사이트**: 토큰 기반 익명 접근 + 화이트리스트 필드 + service role 우회 패턴은 [`supabase/migrations/20260503000005_case_share_links.sql`](../supabase/migrations/20260503000005_case_share_links.sql) 에 이미 잡혀있다. portal MVP 는 이 패턴을 **로그인 사용자에게도 확장**하는 것에 가깝다.

---

## 3. 사용자 페르소나

### A. 발급된 링크를 따라 들어오는 보호자 (가장 흔함)
- 병원에서 카톡/문자로 받은 `share` 링크 클릭 → 정보 입력 → 끝
- **현재**: 링크당 1회. 케이스가 어떻게 진행됐는지 모름
- **portal 에서**: 같은 링크 또는 가입하면 케이스 진행 상황 계속 확인 가능

### B. 직접 신청 후 케이스를 추적하는 보호자
- petmove.co.kr 에서 직접 출국 신청 → 담당 기관 배정 → 진행 추적
- **현재**: `/apply` 제출 후 후속은 카톡/전화로
- **portal 에서**: 신청-진행-수령까지 한 화면에서

### C. 여러 마리·여러 출국을 가진 보호자 (적지만 충성도 높음)
- 다묘다견 가구, 외교관·주재원 가족
- 케이스 N건을 본인 계정 아래에 모아서 봄

### 비대상
- 병원·에이전시 스태프 (admin 사용)
- super_admin / 운영자 (admin 의 `/super-admin`)

---

## 4. MVP 범위 — Phase 11.0 결정안

**원칙**: 11.0 은 "현재 admin 의 share/apply 를 portal 로 이주 + 인증 더하기" 까지로 제한. 결제·환불·다국어 풀세트는 11.1+ 로 미룬다.

### 11.0 에 포함 (권장)
- ✅ **로그인 없이도 가능한 토큰 뷰** — 기존 `/share/[token]` 동등 + 케이스 진행 상태 read-only 표시
- ✅ **이메일/소셜 로그인 가입** — Supabase Auth (admin 과 동일 인프라)
- ✅ **내 케이스 목록** — 로그인하면 본인 이메일/전화로 매칭된 케이스 자동 연결
- ✅ **신청서** — `/apply` 이전, 가입자는 사전 채움
- ✅ **약관·개인정보처리방침 페이지** — 법적 전제
- ✅ **모바일 우선** — admin 의 PWA 패턴 재사용 (홈 화면 추가, 푸시 인프라)

### 11.0 에 **포함하지 않음** (의도적 컷)
- ❌ 결제 (11.2)
- ❌ 푸시 알림 발송 트리거 (admin PWA 2단계와 함께 11.1)
- ❌ 다국어 풀세트 — `/apply` 의 ko/en 만 유지, 나머지는 ko (11.3)
- ❌ 메시지 (보호자 ↔ 기관 채팅) — 11.2 또는 별도 트랙
- ❌ PDF 다운로드 — 11.1 (서류 발급 알림 + 안전한 다운로드 링크)
- ❌ 결제내역·세금계산서 — 11.2

### 결정됨 (2026-05-10)
1. **도메인** — `petmove.co.kr`=portal, `app.petmove.co.kr`=admin **방향 확정**. 단 최종 적용은 MVP 배포 직전. 그 전까지 코드는 `NEXT_PUBLIC_PORTAL_BASE_URL` 환경변수로 추상화.
2. **가입 트리거** — 가입 유도 + 무가입 옵션 병행.
3. **첫 출시 채널** — 로잔 보호자만 **수개월** 베타 → 안정성 확인 후 전체 공개.

---

## 5. 데이터 모델 변경

### 새 테이블 (portal 전용)

```sql
-- 보호자 프로파일. profiles 와 별개 (profiles 는 스태프용).
-- auth.users 는 공유, 역할만 분리.
create table customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,                    -- 케이스 매칭 키
  email_normalized text,         -- 케이스 매칭 키 (lower(email))
  preferred_language text default 'ko',
  marketing_opt_in boolean default false,
  terms_accepted_at timestamptz, -- 약관 동의 시각
  privacy_accepted_at timestamptz,
  created_at timestamptz default now()
);

-- 케이스 ↔ 보호자 매핑. 한 케이스에 여러 보호자(가족) 가능.
create table case_customer_links (
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz default now(),
  linked_via text,               -- 'share-token' / 'email-match' / 'phone-match' / 'manual'
  primary key (case_id, user_id)
);
```

### 기존 테이블 변경 없음
- `cases` / `case_share_links` 그대로
- `share-links` 패턴이 이미 portal 의 anon 진입점 역할 — 추가 마이그레이션 불필요
- `customer_profiles` 는 admin 의 케이스 customer_data jsonb 와 별개. 매칭만 자동.

### RLS 정책 추가
```sql
-- 보호자는 자기 customer_profiles + 자기에게 링크된 cases 만 select
create policy customer_self_read on customer_profiles
  for select using (auth.uid() = user_id);

create policy cases_customer_read on cases
  for select using (
    exists (
      select 1 from case_customer_links
      where case_id = cases.id and user_id = auth.uid()
    )
    or is_org_member(org_id) or is_super_admin()
  );
```

→ 기존 admin RLS 는 영향 없음. 추가 OR 절만 붙임.

---

## 6. 인증 모델

### 3가지 진입 모드 (병행)

| 모드 | 진입 | 권한 | 케이스 매칭 |
|---|---|---|---|
| **Anon-token** | `share/[token]` URL | 화이트리스트 필드만 입력, 진행상태 read-only | 토큰의 case_id 1건 |
| **Verified-email** | 가입 + 이메일 인증 | 자기 케이스 전부 read + 허용 필드 입력 | `email_normalized` / `phone` 일치하는 케이스 자동 + share-token 클릭 시 추가 링크 |
| **Magic-link** (옵션) | 이메일 입력 → 일회성 OTP | Verified 와 동등하나 비밀번호 없음 | 동일 |

### admin 과의 분리
- **같은 Supabase Auth 인스턴스 공유** (auth.users 한 곳)
- **portal 진입 시 `customer_profiles` 존재 여부로 분기**:
  - 있음 → portal 정상
  - 없음 + memberships 있음 → "스태프 계정은 admin 에서 사용해주세요" 안내
  - 없음 + memberships 없음 → portal 가입 트리거

### invite-only 가드와의 충돌 방지
admin proxy.ts 의 invite-only middleware ([memberships 0 차단](../apps/admin/proxy.ts))는 **portal 도메인에서는 작동하면 안 됨**. portal 은 별도 Next.js 앱이라 별도 middleware — 충돌 없음.

---

## 7. 디렉토리 / 모노레포 구조

```
petmove/
  apps/
    admin/                  ← 그대로
    portal/                 ← 신규
      app/
        (anon)/             ← 토큰 뷰, /apply, /share/[token]
          share/[token]/
          apply/
        (authed)/           ← 로그인 후
          cases/            ← 내 케이스 목록 + 상세
          profile/
          settings/
        login/
        terms/
        privacy/
        manifest.ts
        layout.tsx
      components/
        case-status-card/   ← portal 전용 (진행감 강조)
        ...
      lib/
        actions/
          link-cases-to-customer.ts
          ...
      middleware.ts         ← admin 과 별개 가드
      package.json          ← @petmove/portal
  packages/
    db/                     ← 공유 (Supabase 클라이언트, types)
    domain/                 ← 공유 (procedure-checks, vaccine-lookup, country-code)
    auth/                   ← 공유 (Supabase Auth wrapper) — customer 모드 추가
    ui/                     ← 공유 (Editorial 톤 토큰, PageShell, ListRow 등)
```

### 코드 공유 vs 분리 원칙
- **공유**: DB types, domain 룰, country-code, 인증 헬퍼, 디자인 토큰, 공용 primitives
- **분리**: 페이지·라우트, server actions, middleware, brand-specific 컴포넌트 (case-status-card 등)
- **금지**: admin 의 server action 을 portal 에서 직접 import — RLS 컨텍스트가 다름

---

## 8. UI/UX 톤

### 재사용
- **Editorial 디자인 시스템** (`docs/design-system.md`) 그대로 — Parchment/Terracotta/Near-black, Source Serif 4, 카드박스 없는 hairline 톤
- 공용 컴포넌트 (`components/ui/section-header`, `pill-button`, `page-shell`, `list-row`) 는 packages/ui 로 승격해 양쪽에서 import

### 차별화 (portal 특유)
- **상태 중심** — 케이스 카드의 헤드라인은 "다음 단계" ("3/15 광견병 항체 채혈" 같은 actionable 텍스트). admin 은 데이터 밀도, portal 은 진행감.
- **타임라인 뷰** — 케이스 상세 메인이 좌측 타임라인 (완료/진행중/예정), 우측 디테일
- **공포·불안 완화 톤** — "지금 무엇을 해야 하나" 가 항상 1개 이내로 보이게. "할 일 N개" 누적 표시 X.
- **모바일 1순위** — admin 은 데스크톱 우선이지만 portal 은 모바일 디자인을 먼저, 데스크톱은 max-w-2xl 정도로 좁게.

---

## 9. 단계별 마일스톤

### Phase 11.0 — Portal MVP (진행 중)
1. ✅ **스캐폴딩** — `apps/portal` Next.js 16 + 공유 패키지 wire (f5bba0f)
2. ✅ **packages/ui 승격** — PageShell, ListRow, PillButton, DateTextField, Calendar, ConfirmProvider 등 (0bf559f, 77c2c39)
3. ✅ **인증** — `customer_profiles` 마이그 + `@petmove/auth` 분리 + /login + /auth/callback + ensureCustomerProfile (562c3ba, 8bc35be, d66c111)
4. ✅ **케이스 매칭** — `case_customer_links` + RLS (SECURITY DEFINER) + autoLinkCasesByEmail + autoLinkCasesByPhone + backfill 스크립트 (8d9018b, 98b222c, b856b3f, c790e31)
5. ✅ **anon 토큰 뷰 이전** — `/share/[token]` portal + admin redirect (c8d5d4e, 1c71d22)
6. ✅ **신청서 이전** — `/apply` portal + admin redirect (bc85993)
7. ⏳ **내 케이스 목록 + 상세** — 데이터 레이어 완료 (listMyCases, getMyCase: accce10), UI 는 디자인 freeze 대기
8. ✅ **약관·개인정보처리방침** — `/terms`, `/privacy` 마크다운 렌더 (4ed38c4) + 1차 초안 작성됨
9. ✅ **PWA + 모바일 폴리싱** — manifest + sw.js + offline + Capacitor native shell (2c84904, 029d788)
10. ⏳ **베타 배포** — `docs/portal-deploy-checklist.md` 완비. Vercel + KIPRIS + Apple Dev + Play 등록은 사용자 액션

**추가 자율 작업 완료** (Phase 11.1 일부 + 인프라):
- ✅ Capacitor App Store/Play 배포 베이스 — Bundle ID `com.petmove.portal`, Android scaffold (029d788, 2a07988)
- ✅ Capacitor push notifications plugin + helper (95bec53)
- ✅ profile server actions — getMyProfile/updateMyProfile (95bec53)
- ✅ CI 자동화 — `.github/workflows/ci.yml` (lint + RLS + tsc) (5541526)
- ✅ RLS recursion lint — `pnpm lint:rls` 사이클 검출 (7bc172e)

**Cutover 기준**: 로잔 보호자 5명 + 본인 테스트로 신청-진행-완료 1사이클 확인.

**남은 작업**: 11.0.7 UI (디자인 freeze 후) + 11.0.10 배포 (Apple Dev/Play 가입 후).

### Phase 11.1 — 알림 + 서류 다운로드 (1주)
- 푸시 발송 트리거 (admin PWA 2단계와 합류)
- "광견병 채혈 D-7" 등 자동 알림 룰 (procedure-checks 활용)
- PDF 발급 시 보호자에게 다운로드 링크 (만료·1회 제한)

### Phase 11.2 — 메시지 (1주)
- 보호자 ↔ 기관 메시지 (admin 의 messages 인프라 재사용)

### Phase 11.3 — 다국어 (1주)
- next-intl 도입, ko/en/ja 우선 (apply 가 이미 ko/en 다국어 패턴 있음)

### Phase 11.4+ — 미래 후보
- 가족 계정 (한 케이스 여러 보호자)
- 사진 업로드 (반려동물 사진, 자가 찍은 검역서류)
- 케이스 재신청 (재출국 시 이전 케이스 정보 복사)

### 결제 — 별도 트랙 (시점 미정)
SaaS 운영자 결정에 따라 도입. portal MVP·11.x 마일스톤과 무관하게 진행. 도입 시점에 약관·개인정보처리방침에 결제·환불 조항 추가 + 결제 PG 선정 (Stripe / 토스 등) + plans 테이블 + 사용량 미터링이 동반됨.

---

## 10. 사용자 결정 항목

### 결정됨 (2026-05-10)
- ✅ **도메인 전략** — `petmove.co.kr`=portal, `app.petmove.co.kr`=admin 방향. **최종 적용은 MVP 배포 직전** (Vercel 도메인 연결 + OAuth redirect URL 등록 시점). 그 전까지 코드는 환경변수 추상화.
- ✅ **첫 출시 범위** — 신청 + 추적 둘 다 11.0 에.
- ✅ **베타 채널** — 로잔 보호자만, **수개월**. 안정성 확인 후 전체 공개.
- ✅ **약관·개인정보처리방침** — (A) 옵션 1차 초안 작성 완료: [`docs/legal/terms.md`](legal/terms.md), [`docs/legal/privacy.md`](legal/privacy.md). 외부 법무 검토 1회 권장.
- ⚠️ **결제 (2026-05-11 갱신)** — 펫무브는 **처음부터 유료 앱**. 본 트랙. 디자인·구현 시작 전 다음 결정 필요:
  - [ ] **모델** — 구독(월·연) / 케이스당(출국 1건 = N원) / 둘 다
  - [ ] **결제 수단** — 웹 PG(토스·Stripe) / 앱스토어 IAP / 둘 다 *(IAP 수수료 ~30% vs PG ~3%. Apple/Google 정책상 디지털 콘텐츠 IAP 강제. 케이스당 결제는 "물리 서비스" 로 분류 가능 — 가이드라인 확인 필요)*
  - [ ] **무료 범위** — 가입+신청서 작성까지 무료 / 케이스 생성 후 결제 / 무료체험 N일 / freemium
  - [ ] **paywall 화면 위치** — 현재 [`docs/portal-preview/`](portal-preview/) 시안에 paywall 화면 없음. 결제 모델 정해지면 디자인 한 화면 추가
  - [ ] **환불·청약철회 조항** → [terms.md](legal/terms.md) 보강
  - [ ] **가족 공유** — 1결제로 N 보호자 접근 허용 여부 (case_customer_links 다대다 이미 지원)
- ✅ **푸시 우선순위** — admin PWA 2단계 + portal 11.1 합치기. 같은 트리거 규칙·발송 헬퍼 공유.

### 작성 도중에 답해도 되는 것
- [ ] portal 의 페르소나 C (다묘다견·여러 출국) 우선순위 — MVP 에서 N건 표시 정도만 vs 가족 계정까지
- [ ] 사진 업로드 도입 시점
- [ ] portal-only 디자인 토큰 (예: 더 부드러운 톤) 추가할지

### 약관·개인정보처리방침 후속 (사용자 액션)
- [ ] 1차 초안의 placeholder (`[운영주체 법인명]`, `[사업자등록번호]`, `[주소]`, `[대표자명]`, `[개인정보 보호책임자명]`, `[고객문의 이메일]` 등) 채우기
- [ ] 외부 법무 검토 (변호사 또는 법무 외주)
- [ ] 결제 도입 시 환불·청약철회·미성년자 결제 조항 추가
- [ ] 마케팅 수신·위치정보·제3자 제공 등 (B) 옵션 별도 동의서 도입 (11.1+ 검토)

---

## 11. 다음 한 걸음

이 계획서가 합의되면 첫 작업은:

1. **packages/ui 승격** — 가장 작고 안전한 선행 작업. admin 영향 0이도록 import 경로만 바꾸고 검증.
2. **customer_profiles 마이그레이션 작성** — Seoul 프로젝트에 적용 전 staging 우선
3. **apps/portal 스캐폴딩** — admin 복사 후 가지치기

각 단계는 독립 PR / 독립 배포 가능하도록 끊는다. saas-migration.md 의 Phase 단위 원칙과 동일.

---

## 12. 리스크와 대비

| 리스크 | 영향 | 대비 |
|---|---|---|
| customer_profiles 와 profiles 분리 시 auth.uid() 분기 누락 | RLS 사고 | 모든 RLS 정책에 customer 모드 명시 + staging 검증 |
| share-token 이전 중 기존 링크 깨짐 | 보호자 락아웃 | admin `/share/[token]` 을 portal 로 301 redirect 한 달 유지 |
| 보호자가 잘못된 케이스 매칭 (이메일 오타) | PII 노출 | 자동 매칭은 phone+email 둘 다 일치할 때만, 한쪽만이면 사용자 확인 |
| portal 도메인 SEO 가 admin 보다 강해지는 의도 — 실패 시 마케팅 손해 | 비즈 영향 | sitemap.xml + 구조화 데이터부터 확실히, marketing copy 별도 트랙 |
| Vercel 함수 region 누락 (admin 처럼) | 응답 속도 | `vercel.json` 의 `regions: ["icn1"]` 초기 세팅에 포함 |

---

## 13. 기록 갱신 방법

- 진행상황은 이 문서의 "Phase 11.x 마일스톤" 체크박스
- 결정사항은 "사용자 결정 필요 항목" 에서 결정 즉시 옮겨 본문 반영
- 다른 문서와의 관계: saas-migration.md Phase 11 섹션은 본 문서 링크만 유지
