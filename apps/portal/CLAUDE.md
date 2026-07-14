# 펫무브 (PETMOVE) — B2C 유료 모바일 앱

이 폴더는 **펫무브** 앱. 반려동물 보호자(고객)용 B2C **유료** 모바일 앱.
**별도의 앱**인 펫무브워크(`apps/admin`) 와는 DB·도메인 규칙만 공유, 코드는 분리.

## 정체성

| | |
|---|---|
| 사용자 | 반려동물 출국시키는 보호자(고객) — 1인 |
| 비즈 모델 | 유료 (모델·결제수단·페이월 위치는 [docs/portal-plan.md](../../docs/portal-plan.md) §결제) |
| 배포 | 웹 `petmove.co.kr` + iOS/Android (Capacitor remote URL — WebView 가 웹을 래핑) |
| Bundle ID | `com.petmove.portal` |
| 디자인 | [`docs/portal-preview/`](../../docs/portal-preview/) 단일 출처 — Stone palette + Fraunces serif (Calm 톤) |
| 인증 | 3모드: anon-token (share 링크) / verified-email / magic-link |
| 우선 | 모바일 1순위, 데스크톱은 max-w-2xl 좁게 |

## 코드 룰

1. **펫무브워크 코드 import 금지** — `apps/admin/**` 에서 직접 import 하지 않는다. 공유는 `packages/` 로만.
2. **공유 패키지** — `@petmove/db`, `@petmove/domain`, `@petmove/auth`, `@petmove/country-code` 가 정상 import 대상.
3. **`@petmove/ui` 는 톤이 다름** — admin 의 Editorial(Parchment/Terracotta) 톤으로 만들어진 거라 펫무브의 Stone/Calm 톤과 안 맞음. 신규 컴포넌트는 portal 자체 [`components/`](components/) 에 만들고, packages/ui 는 톤이 충분히 맞는 것(ConfirmProvider 같은 기능성)만 선별 사용.
4. **디자인 토큰 단일 출처** — `docs/portal-preview/tokens.css` + 화면별 인라인 Stone 팔레트. portal 의 `app/globals.css` 에 portal-only CSS 변수로 등록. admin 의 `--pmw-*` 와는 별개.
5. **디자인 원본 = 코드** (2026-07-11 전환). 색·간격·타이포·컴포넌트의 진실은 **코드**다: 색 = `app/globals.css` 의 `--pm-*` 토큰(라이트/다크) + `lib/palette.ts` 의 `C`, 스케일 = `lib/tokens.ts`. 새 디자인 시스템 = **흰 카드 + 옅은 회색 캔버스 + 하늘 파랑(#0BAEFF) 강조 + 잉크 그레이 스케일**(구 Stone/Parchment 웜톤 폐기). 화면 코드는 색을 하드코딩하지 말고 토큰/`C` 를 참조한다.
   - `docs/portal-preview/` 는 **구 시안 아카이브**(더 이상 truth 아님, 참조만).
   - 브랜드 자산(로고·아이콘) = `docs/brand/` (PetMove-icon-3A 하늘 구름).
6. **RLS 컨텍스트** — portal 의 server actions 는 `customer_profiles` + `case_customer_links` 기반 RLS 위에서 동작. admin 의 org/memberships server action 을 그대로 호출하지 않는다.
7. **모바일 검증은 즉시 커밋·푸시** — 모바일 변경은 사용자가 실기기에서 검증. preview 우회 시도 X.

## 작업 시작 전 읽기

- [docs/portal-plan.md](../../docs/portal-plan.md) — Phase 11 계획, 단일 출처
- [docs/portal-preview/README.md](../../docs/portal-preview/README.md) — 디자인 시안 (Calm 톤, 4탭 구조)
- [docs/portal-deploy-checklist.md](../../docs/portal-deploy-checklist.md) — 배포 매뉴얼

## 현재 진행 (요약)

Phase 11.0 9/10 완료. 남은 작업:
- **11.0.7 내 케이스 목록·상세 UI** — 데이터 레이어 완료, 디자인 freeze 후 4탭 셸 + 화면 구성
- **11.0.10 베타 배포** — Vercel 도메인·OAuth redirect·Apple Dev·Play Console (사용자 액션)

## 배포 (2026-06-05~ 현행)

**portal 은 Vercel webhook 이 아니라 GitHub Actions `.github/workflows/deploy-portal.yml` 로만 배포한다.** (webhook 이 6일새 3회 끊겨 졸업시킴 — Vercel Settings→Git 연결은 Disconnect 상태.)

- **자동 배포**: `apps/portal/**`·`packages/**`·workspace 설정 파일을 변경해 master push → Actions 가 `vercel deploy --prod`(서버 빌드)로 자동 배포(1~2분). 평소 작업은 이걸로 끝.
- **빈 ping 커밋·문서만 커밋은 자동배포 안 됨** (paths 필터). 코드 변경 없이 재배포만 필요하면 GitHub → Actions → **Deploy Portal → Run workflow**(master).
- **확인 위치 = GitHub Actions** (Vercel 대시보드 아님). "webhook 끊김" 진단은 더 이상 불필요.
- Vercel 무료(Hobby) **일일 배포 한도 100/day, rolling 24h**. 초과 시 deploy 단계 ~30초 즉사(`api-deployments-free-per-day`). 회복까지 대기 또는 Pro 업글.
- Secrets: `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` (GitHub repo secrets). 상세: 메모리 `project_portal_deploy_github_actions`.

(과거 webhook 끊김 진단·복구 기록은 메모리 `project_petmovework_vercel_deploy` 참고 — admin 은 아직 webhook 사용 중일 수 있음.)
