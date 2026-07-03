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

## 진행 상황 (2026-07-03 갱신)

**전체 구조·문구·사진 대부분 확정.** 프로토타입 `prototype-mobile.html` = 거의 완성. 생성기 `scripts/make_www_prototype.py`(사진 base64 인라인), 반응형 브레이크포인트 760/960/1100. 검증법: `edge --headless --screenshot`(로컬 파일) → PIL crop. **⚠️Edge 헤드리스는 최소창폭 ~500·스크롤바 30px라 390 캡처 시 우측 잘림/CW=470 = 착시(실기기 정상).** 자동 검증 재적용 시 `--virtual-time-budget`로 JS 실행 대기.

**섹션 순서(위→아래):** 헤더 → 히어로 → 신뢰스트립 → **두 가지 방법**(카드 2) → **3단계** → 목적지 그리드 → 감성밴드 → 다크 CTA → 푸터. (두 가지 방법을 3단계 앞으로 옮김.)

**확정 카피:**
- 히어로: eyebrow "반려동물 해외여행 · 검역 준비" / H1 "우리 아이 해외여행, 펫무브가 챙길게요" / sub "앱으로 쉽게 준비하고, 복잡한 절차는 전문가에게 맡기세요"(모바일 콤마 줄바꿈=`.mbr`) / 버튼 "무료 앱으로 시작하기" + "전문가에게 맡기기"(말풍선 아이콘).
- 헤더 워드마크 = 앱과 통일 "펫무브"(아이콘+굵은 한글).
- 신뢰스트립: **5,300+ 누적 출국 / 50+ 지원 국가 / 20년+ 경험**. 년은 `#yrs` + JS `new Date()-2006` 자동증가. (5,300은 DB 외삽 추정 — `scripts/estimate-animals.mjs`로 실측: cases 1,976, 2022-04~ 월평균~40, 20년 외삽 4,000~7,500 → 5,300 보수적.)
- 두 가지 방법 섹션: kicker "두 가지 준비 방법" / H2 "앱으로 간편하게, 복잡할 땐 전문가에게"(sub 없음, 2단). **앱 카드**(태그 펫무브 앱 / 제목 "앱으로 직접 준비해요" / 소제목 "주요 기능": 단계별 가이드·서류 체크리스트·기한 알림 실수 방지 / 버튼 "무료 앱 받기"). **전문가 카드**(태그 로잔동물의료센터 / 제목 "전문가에게 맡겨요" / 소제목 "주요 서비스": 마이크로칩 접종 검사·신고 허가증 신청 대행·출국 전 임상검사 서류 준비 / 버튼 "상담 신청"). ".pt" = 주요X 소제목 클래스("주요"가 "더 있음" 암시, "등" 대신).
- 푸터: 펫무브·PETMOVE / 로잔동물의료센터·사업자등록번호 124-18-42859 / **서울시 관악구 관악로29길 3 · 02-872-7588** / 이용약관·개인정보처리방침·고객지원. (가이드/블로그/서비스 내비 삭제.)

**사진(확정):**
- 히어로 = `hero-cardog-2x.png`(Gemini AI → upscale.media 2배 5056px). 폰=세로(강아지 우측 focus_x 0.66)/PC=중앙 카드 별도 크롭(hero_card). ✦워터마크는 크롭 제외. **⚠️AI 이미지라 최종 사용 여부는 사용자 재판단 여지(실사 대안 준비됨: shutterstock_450886696 골든도로, jaycee-xie 시바).**
- 밴드 = `patrick-hendry-...unsplash.jpg`(Unsplash 안전) 3000px, PC 세로 72%.
- **⚠️히어로 스크림은 position:absolute inset:0**(flex-end/flex:1로는 38px 틈 남던 버그) — 건드리지 말 것.
- 소스=`G:\내 드라이브\PETMOVE\기타\이미지`(IMG_DIR). Desktop 사본은 한글경로 인코딩 이슈로 Python이 못 읽음 → G: 사용.

## 남은 할 일

1. **다듬을 후보 섹션**: 3단계(유지/삭제 사용자 검토 중 — 흐름 설명 가치 vs 앱카드와 겹침) · 목적지 그리드(카드 연결=가이드로 링크하면 SEO 다리, 아니면 장식→간소화/삭제) · 감성밴드 · 최종 CTA 카피.
2. **실제 워드마크 Alonzo 적용**(현재 시스템폰트 굵게 임시).
3. **`(www)` route group 로 Next.js 이식 + 배포** — base64 대신 next/image 최적화(기기별 해상도 자동), URL 슬러그 그대로. **이게 "실제 www.petmove.co.kr로 접속" 되게 하는 최종 단계.**
4. **콘텐츠 이관**(나중): Ghost Export → MDX + 이미지. 이관 전 69개 URL 스냅샷 필수.

## ⚠️ 게시 전 체크
- **5,300+** 실제 근거 최종 확인(외삽 추정이라 보수적이지만).
- **히어로 AI 이미지** 최종 결정(쓸지/실사로).
- **푸터**: 대표자명 + (유료 결제 붙이면) 통신판매업 신고번호 추가 — 지금 무료 단계선 급하지 않음.
- **유료 스톡** 폴더의 `shutterstock_*`/`iStock-*`는 최종본에 쓰면 정식 구매 필요(현재 히어로=AI·밴드=Unsplash라 해당 없음).

## 살려야 할 URL (sitemap 2026-07-01 · 69개)

`/sitemap.xml`에서 재추출 가능. 슬러그 유지 시 리다이렉트 불필요.

**docs (40)** — 국가 34: singapore, ukraine, uk, newzealand, thailand, usa, philippines, australia, japan, hawaii, china, guam, taiwan, russia, malaysia, morocco, mexico, mongolia, vietnam, brazil, switzerland, uae, argentina, ireland, uzbekistan, eu, israel, india, indonesia, kazakhstan, cambodia, canada, turkey, hongkong (각 `-pet-travel-guide`). 절차 6: pet-export-inspection, pet-quarantine-station, pet-quarantine-reservation, dog-flight-preparation, airline-pet-cabin-policy, airline-pet-cabin-fees.

**blog (29)** — eu-pet-rabies-test, australia-cat-travel-guide, dog-travel-to-japan, japan-pet-import-process, japan-pet-entry-self-check, japan-pet-entry-scheduler, dog-travel-to-usa-august-2024-update, japan-entry-for-dog-heart-surgery, pet-quarantine-guide, bring-dog-to-korea, rabies-free-countries, dog-international-travel, dog-travel-to-thailand, dog-travel-to-philippines, dog-travel-to-hawaii, repeated-dog-travel-korea-japan, dog-travel-to-china, dog-flight-medication, dog-travel-to-france, dog-travel-to-usa-2024-rule, dog-travel-to-usa, cat-travel-to-usa, travel-to-uk-with-pet-via-france, japan-pet-import-inspection, japan-pet-quarantine-office, pet-microchip-safety, japan-pet-export-inspection, singapore-pet-import-rule-change, rabies-titer-test-japan-korea.

테마 잔재(`/roadmap /showcase /changelog /partners`)·태그·저자는 버려도 SEO 손실 없음.
