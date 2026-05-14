# 펫무브 보호자 앱 디자인 프리뷰

`apps/portal` (B2C 보호자 셀프서비스 앱) 의 **디자인 freeze 프리뷰**. Claude Design 핸드오프 번들에서 옮겨온 self-contained HTML/CSS/JSX 프로토타입.

## 보는 법

`index.html` 을 브라우저로 직접 열거나, 정적 서버에 띄우기:

```bash
cd docs/portal-preview && python -m http.server 5500
# → http://localhost:5500
```

CDN(React 18, Babel standalone, Pretendard, Fraunces) 만 가져오며 빌드 단계 없음.

## 무엇

iOS 디바이스 프레임 안에 **일정 / 서류 / 정보 / 프로필** 4개 화면. Stone 팔레트 + Fraunces serif 의 "Calm" 디자인 시스템.

| 화면 | 핵심 |
|---|---|
| 일정 | 다음 할 일 카드 → 큰 원형 진행률 (Now Playing 패턴) → 전체 8단계 리스트 |
| 서류 | 필수 서류 체크리스트 → 증명서 자동 작성 → 보관 중인 서류 (서류 1건당 카드) |
| 정보 | 보호자 / 동물 / 여행 / 항공권 — 라벨·값 row 구조 |
| 프로필 | 보호자+동물 hero → 동물병원 → 에이전시 → 계정 |

상단: 다이내믹 아일랜드 양옆에 `PETMOVE` 워드마크(좌) / 팔레트·다크모드(우). 하단: 4탭 네비.

## 디자인 토큰

`tokens.css` — 라벤더→피치 페이지 그라데이션, ink/surface 스케일, 라운드, 그림자, 애니메이션 keyframes. Calm 화면들은 추가로 자체 Stone 팔레트를 인라인으로 들고 있음:

```
bg #F2EDE6 · surface #FBF7F1 · ink #2A2620
ink2 #6B6457 · ink3 #9A9286 · line rgba(42,38,32,.10)
accent #B89968 (탄) · soft #E8DCC4 · sage #8FA68C
```

폰트:
- **Fraunces** — 화면 H1, 제목, 숫자
- **Pretendard Variable** — 한글 본문
- **Inter** — 라틴 숫자 (mono-numeric)

## 어디로 가는가

이 프리뷰는 `docs/portal-plan.md` Phase 11.0.7 (내 케이스 목록 + 상세) 의 **시각적 단일 출처**.

본 구현 시점 변환:
- 이 JSX → Next.js 13+ 서버/클라이언트 컴포넌트 (`apps/portal/app/(authed)/cases/[id]/page.tsx`)
- 인라인 토큰 → `packages/ui` 의 portal 변형 (Stone 팔레트는 portal-only)
- `data.jsx` 의 `SCENARIO` → Supabase `cases` + `case_share_links` + `customer_profiles` 조인 결과
- iOS 디바이스 프레임 → 제거 (실제 모바일에선 viewport 가 곧 디바이스)
- `Tweaks` 패널 / `NavLegend` / `ContextSidebar` → 이미 제거됨 (프로토타입 부속)

## 출처

원본: claude.ai/design 핸드오프 번들 (2026-05-10).
- 시작: chat1 — 펫무브 회원 앱 4개 화면 + 명상 앱 톤 (Calm) 추가
- 진행: chat2 — Calm 으로 통일, 4탭 네비, 정보/프로필 분리, 디자인 폴리싱

번들의 `untitled/chats/` 가 이 디자인의 의도(intent)를 가장 충실히 담고 있음 — 변경 시 그쪽 먼저 참고.
