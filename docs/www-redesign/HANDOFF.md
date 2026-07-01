# www.petmove.co.kr 개편 — 핸드오프

작성 2026-07-01. 세션 간 인계용. 새 세션은 이 문서 + `mockups.html` 먼저 읽을 것.

## 목표

펫무브 **앱 출시**를 앞두고 소비자 사이트 `www.petmove.co.kr` 개편. 현재는 **Ghost 블로그**(Spiritix 테마). Ghost Pro 비용이 비싸 **자체 제작으로 전환**하려는 상황이고, "웹업체 없이 내가 만들 수 있나"를 테스트 중.

## 확정된 결정

1. **접근 = 전체 자체 제작 (Next.js), Ghost 해지.**
   - 이유: 살려야 할 URL은 `/docs/*`·`/blog/*`뿐인데, 도메인은 우리 것이라 **새 사이트에서 같은 경로를 서빙하면 URL 100% 보존**됨. Ghost 유지 이유가 사라짐.
2. **URL 보존 방식** — 슬러그 그대로 유지 → **리다이렉트 불필요**. `next.config`에 `trailingSlash: true` (기존 URL이 `/`로 끝남).
3. **콘텐츠 저장 = MDX in-repo.** 글은 "혼자 가끔" 쓰므로 웹 편집기 불필요. 무료·빠름(SSG)·앱 컴포넌트 삽입 쉬움. (자주/비개발자가 쓰게 되면 Supabase+에디터로 재검토.)
4. **랜딩 구조 = 한 장 연속 스크롤.** 컨셉을 택1하는 게 아니라 섹션으로 이어 붙임:
   `히어로(A) → 신뢰 스트립(B) → 3스텝 → 목적지 그리드(C) → 감성 밴드(D) → 다크 CTA`
   - **히어로 리드 = A(앱 다운로드)** — 단, 사이트 1순위 목표가 "앱 다운로드"라는 가정. 만약 1순위가 "직영 서비스 상담 유치"면 히어로를 B(신뢰/실적)로 교체. **← 미확정, 사용자 확인 필요.**
   - C(목적지 그리드)는 히어로로는 약해 제외했지만, **섹션으로는 핵심**(69개 SEO 가이드 ↔ 앱/직영 전환의 다리)이라 반드시 포함.
5. **브랜드 = 앱(portal) 팔레트 그대로.** 웜 스톤 + 앰버. admin(펫무브워크)의 Editorial/Terracotta `--pmw-*`와 혼동 금지.
6. **로고 = `apps/portal/public/icon.svg`** (앰버 라운드 스퀘어 + 흰 마크) + `PETMOVE` 워드마크(Alonzo ExtraLight = 얇은 자간). `petmove-full.svg`/`petmove-wordmark.svg`는 "PETMOVE/WORK" = B2B용이라 **쓰지 말 것.**

## 브랜드 토큰 (출처: `apps/portal/app/globals.css` 의 `--pm-*`)

| 역할 | 토큰 | 값 |
|---|---|---|
| 페이지 배경 | `--pm-bg` | `#F5EFE8` |
| 카드/표면 | `--pm-surface` | `#FBF7F1` |
| 본문 잉크 | `--pm-ink` | `#2A2620` |
| 보조 텍스트 | `--pm-ink-2` | `#6B6457` |
| 뮤트 텍스트 | `--pm-ink-3` | `#9A9286` |
| 브랜드 액센트 | `--pm-accent` | `#D99A58` (앰버) |
| 성공/완료 | `--pm-sage` | `#8FA68C` |
| 경고 | `--pm-warn` | `#C26A4A` |
| 서체 | — | Alonzo(워드마크) / Pretendard(본문) |
| 둥글기 | `--pm-r-*` | 10·16·22·28px |

> `docs/portal-preview/tokens.css`에 옛 라벤더→피치 시안도 있으나 **폐기**. 실제 앱 truth는 위 웜 스톤.

## 대비(접근성) 교정 — 반드시 반영

측정 결과 두 조합이 WCAG AA 미달:
- `--pm-ink-3` `#9A9286` / bg = **2.7:1** ❌ → 본문에 쓰지 말고 `ink-2`로. 앱 토큰도 `#847B6C` 정도로 살짝 진하게 조정 권장.
- 앰버 `#D99A58` + **흰 글씨** = **2.4:1** ❌ → **앰버 버튼은 짙은 잉크(`#2A2620`) 글씨.** (6:1, 더 프리미엄해 보이기도.) 굳이 흰 글씨면 앰버를 `#C07E38`로 진하게(큰 라벨 한정).
- 세 시안 모두 이 교정 반영 완료.

## 시안 3종 (mockups.html)

같은 골격·같은 로고·같은 팔레트, **히어로 표현만 다름**:
- **시안 1 · Calm 정통** — serif + 폰 목업 1개. 앱과 가장 닮음. 출시 임팩트는 약함.
- **시안 2 · Warm Bold** — 사진 풀블리드 + 큰 타이포 + 강한 CTA. 전환·브랜드 최강. **좋은 반려동물 사진 필요.**
- **시안 3 · Product 쇼케이스** — 앱 화면 3개 나열 + 기능 카드. 사진 없어도 완성. "이런 앱이구나" 즉시 전달.

추천: 좋은 사진 있으면 **2**, 없으면 **3**. (Georgia는 임시 대체 서체 — 실제로는 Alonzo+Pretendard.)

## 다음 할 일

1. **사용자 확인**: 사이트 1순위 목표 = 앱 다운로드 / 직영 상담 / 둘 다? → 히어로 A vs B 확정.
2. **시안 택1** (또는 "2 히어로 + 3 스크린샷 섹션" 혼합).
3. 택한 방향으로 **실물 HTML 프로토타입** 1장 (실제 폰트·반응형·hover·스크롤 모션) → 브라우저 확인.
4. 확정 후 **`(www)` route group** 로 실제 Next.js 이식 + 배포.
5. **콘텐츠 이관**(별도, 나중): Ghost Export JSON → MDX 변환 스크립트 + 이미지(`storage.ghost.io`) 다운로드. 이관 전 **69개 URL 스냅샷** 필수(슬러그 유실 방지).

## 살려야 할 URL (sitemap 2026-07-01 · 69개)

`/sitemap.xml`에서 재추출 가능. 슬러그 유지 시 리다이렉트 불필요.

**docs (40)** — 국가 34: singapore, ukraine, uk, newzealand, thailand, usa, philippines, australia, japan, hawaii, china, guam, taiwan, russia, malaysia, morocco, mexico, mongolia, vietnam, brazil, switzerland, uae, argentina, ireland, uzbekistan, eu, israel, india, indonesia, kazakhstan, cambodia, canada, turkey, hongkong (각 `-pet-travel-guide`). 절차 6: pet-export-inspection, pet-quarantine-station, pet-quarantine-reservation, dog-flight-preparation, airline-pet-cabin-policy, airline-pet-cabin-fees.

**blog (29)** — eu-pet-rabies-test, australia-cat-travel-guide, dog-travel-to-japan, japan-pet-import-process, japan-pet-entry-self-check, japan-pet-entry-scheduler, dog-travel-to-usa-august-2024-update, japan-entry-for-dog-heart-surgery, pet-quarantine-guide, bring-dog-to-korea, rabies-free-countries, dog-international-travel, dog-travel-to-thailand, dog-travel-to-philippines, dog-travel-to-hawaii, repeated-dog-travel-korea-japan, dog-travel-to-china, dog-flight-medication, dog-travel-to-france, dog-travel-to-usa-2024-rule, dog-travel-to-usa, cat-travel-to-usa, travel-to-uk-with-pet-via-france, japan-pet-import-inspection, japan-pet-quarantine-office, pet-microchip-safety, japan-pet-export-inspection, singapore-pet-import-rule-change, rabies-titer-test-japan-korea.

테마 잔재(`/roadmap /showcase /changelog /partners`)·태그·저자는 버려도 SEO 손실 없음.
