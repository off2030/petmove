# 펫무브 Portal 배포 체크리스트

`apps/portal` 을 prod 배포할 때 한 번에 보고 진행. portal-plan.md Phase 11.0.10
의 실행 매뉴얼. 베타 출시 직전 1회 통과 + 도메인 분리·OAuth 갱신 시 재참조.

순서: **Vercel 프로젝트 → 환경변수 → Supabase 설정 → 도메인 → smoke test**.

---

## 1. Vercel 프로젝트 생성

1. https://vercel.com/new → "Import from Git" → `off2030/petmove`
2. **Root Directory**: `apps/portal`
3. **Framework Preset**: Next.js (자동 감지)
4. **Build Command**: 자동 (`pnpm --filter @petmove/portal build` 또는 default)
5. **Install Command**: `pnpm install`
6. **Output Directory**: `.next` (default)
7. **Node Version**: 20 이상
8. Project Name: `petmove-portal` 권장 (`portal` 단독은 충돌 가능)

Region 은 코드의 `apps/portal/vercel.json` 이 `icn1` 으로 강제 — 추가 설정 불필요.

---

## 2. 환경변수 (Vercel Project Settings → Environment Variables)

### 필수 (Production + Preview + Development)
| 변수 | 값 | 노출 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ugywxiyivfzflqkcnqvu.supabase.co` | client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | admin/.env.local 동일 | client |
| `SUPABASE_SERVICE_ROLE_KEY` | admin/.env.local 동일 | **server-only** ⚠️ |

`SUPABASE_SERVICE_ROLE_KEY` 는 절대 client/preview 환경에 노출되지 않도록 Vercel
환경변수 추가 시 "Sensitive" 토글 활성. portal 의 `/share/[token]`, `/apply` 가
service role 로 RLS 우회.

### 선택
| 변수 | 의미 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push 구독 (11.1+ 활성화 시) |

admin 의 OpenAI/Resend/Naver 등은 portal 에 **불필요** — portal 은 OpenAI 추출
사용 안 함, Naver OAuth 도 admin 만.

---

## 3. Supabase 설정 (Dashboard)

### Authentication → URL Configuration

**Site URL**: portal 의 production 도메인 (예: `https://petmove.com` 또는 임시
`https://petmove-portal.vercel.app`).

**Redirect URLs** allowlist 에 추가 (모두):
- `https://<portal-domain>/auth/callback`
- `https://<portal-domain>/**` (와일드카드, magic link 대응)
- Vercel preview 환경도 같이 쓰려면: `https://*-off2030.vercel.app/auth/callback`
- 로컬 dev: `http://localhost:3002/auth/callback`

⚠️ admin 의 Site URL 과 충돌 안 함 — 같은 Supabase 프로젝트 공유하지만 redirect
URLs 은 list 형태라 둘 다 등록 가능. admin (`app.petmove.com`) 과 portal
(`petmove.com`) 모두 등록 유지.

### Authentication → Providers

- **Google OAuth**: 이미 admin 용으로 활성. **Authorized Redirect URIs**
  (Google Cloud Console) 에 portal 의 `/auth/callback` 도 추가:
  - `https://<portal-domain>/auth/callback`
  - 단, Google OAuth callback 은 결국 Supabase 의 `https://ugywxiyivfzflqkcnqvu.supabase.co/auth/v1/callback`
    한 곳을 거치므로, portal 측 추가 등록은 사실상 위 Redirect URLs 만 충분.
- **Email** (magic link): 자동 활성. 추가 작업 불필요.

### Database (RLS)

- 마이그레이션은 `pnpm db:push` 가 처리. portal 배포 전 모든 마이그 적용
  상태인지 확인: `npx supabase migration list` 에서 양쪽 컬럼 다 채워져 있어야.
- `pnpm lint:rls` clean 인지 사전 확인 (CI 가 자동으로 잡지만 수동도 권장).

---

## 4. 도메인

베타 단계 — `petmove-portal.vercel.app` 임시 도메인으로 시작.

정식 출시 시 (portal-plan.md 결정안: `petmove.com` = portal):

1. Vercel Project → Settings → Domains → `petmove.com` 추가
2. DNS A/CNAME 레코드를 Vercel 가이드대로 등록
3. admin 의 `.env`/Vercel env 의 `NEXT_PUBLIC_PORTAL_BASE_URL` 을
   `https://petmove.com` 으로 갱신
4. Supabase URL Configuration 의 Site URL + Redirect URLs 도 `petmove.com` 으로
   갱신

⚠️ 도메인 분리 후 admin 의 `/share/[token]` `/apply` 가 `petmove.com/...` 으로
redirect. admin Vercel env 의 `NEXT_PUBLIC_PORTAL_BASE_URL` 누락 시 same-origin
fallback (`app.petmove.com/share/...` → 404) 되니 도메인 전환과 env 갱신은 같은
배포에서.

---

## 5. 첫 배포 후 smoke test

배포 URL 에서 직접 확인:

- [ ] `/` — 200, "준비 중" placeholder
- [ ] `/login` — 200, Google 버튼 + 이메일 magic link 폼
- [ ] `/terms`, `/privacy` — 200, Editorial prose 렌더
- [ ] `/share/<invalid-uuid>` — "유효하지 않은 링크입니다" (service role 정상)
- [ ] `/apply` — 신청서 폼 렌더
- [ ] `/manifest.webmanifest` — JSON 응답
- [ ] `/sw.js` — JS 응답, `portal-static-portal-v1` 캐시 키 확인

### 실제 OAuth 라운드트립 (수동)
1. `/login` 에서 Google 클릭 → Google 동의 → `/auth/callback` 으로 복귀 → `/` redirect
2. Supabase Dashboard → Authentication → Users 에 새 user 생성 확인
3. SQL Editor 에서 `select * from customer_profiles where user_id = '<uid>'` —
   row 자동 생성됐는지 확인

### 실제 share-token 라운드트립
1. admin 에서 케이스 → "공유 링크 생성"
2. 생성된 URL 을 portal 도메인으로 (admin 의 redirect 가 자동 처리) 또는 직접
   `petmove.com/share/<token>` 으로 열기
3. 폼 입력 → 제출 → admin 의 케이스 상세에서 입력값 반영 확인

---

## 6. 모니터링 (선택)

- Sentry: portal 도 admin 처럼 Sentry 연결할 거면 `next.config.mjs` 에
  `withSentryConfig` 추가. 새 Sentry project 또는 admin 의 `javascript-nextjs`
  공유. `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` 환경변수 추가.
- Vercel Analytics: 한 줄 추가로 활성화 (portal MVP 에서는 보류)

---

## 7. 사후 작업

- portal-plan.md 의 Phase 11.0 체크박스 갱신 — 11.0.10 ✅
- 베타 사용자 (로잔 보호자 5명) 에게 안내 — 약관 placeholder 채워졌는지 확인
  후 발송
- 1주 후: error rate / 가입 전환율 / share-token 사용률 모니터링
