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
5. **디자인 변경 순서** — 디자인을 다듬을 때는 `docs/portal-preview/` JSX 를 **먼저** 고치고, 그 다음 코드(`apps/portal/`)에 반영한다. 코드와 portal-preview 가 어긋나면 **portal-preview 가 truth**. 코드에서 즉흥적으로 톤·간격·색·타이포를 바꾸지 않는다. (디자인 freeze 단계 한정. 운영 단계 진입 시점에 코드가 truth 로 전환 — `docs/portal-plan.md` 에 시점 명시 예정.)
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

## 알려진 이슈

- **Vercel webhook 끊김** — 2026-06-04 portal 재발(2026-06-03 첫 사례 이튿날). 진단: Vercel Build & Deployment 설정은 정상(Root `apps/portal`, Include outside Enabled, Ignored Build Step Automatic) 인데 apps/portal/ 변경조차 트리거 안 되면 webhook 끊김. 효과 본 복구 시퀀스 (2026-06-04 실측): (1) Vercel Settings → Git → Disconnect → 같은 repo Reconnect (환경변수·도메인·빌드 설정 모두 보존, 그러나 이것만으로는 안 풀림). (2) Deploy Hook 생성·curl 호출 — PENDING 응답만 받고 빌드 미생성. (3) **GitHub Settings → Installed GitHub Apps → Vercel → Configure 진입 (sudo mode 이메일 인증 필요, 사용자 액션). 권한·repo 정상 확인 후 페이지 방문만으로도 webhook subscription refresh 됨**. (4) 빈 commit push 로 검증 — 트리거 정상화. 핵심: (3)이 가장 가능성 높은 진짜 풀림 트리거. (1)·(2)만으로는 안 풀린 사례.
