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
6. **로고 = `apps/portal/public/icon.svg`** (앰버 라운드 스퀘어 + 흰 마크) + 워드마크 = 텍스트 "펫무브"(시스템 폰트). ~~Alonzo~~ **폐기(2026-07-04, 어디서도 안 씀)**. `petmove-full.svg`/`petmove-wordmark.svg`는 "PETMOVE/WORK" = B2B용이라 **쓰지 말 것.**

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
| 서체 | — | Pretendard(본문, 최종 next/font). 워드마크=텍스트 "펫무브". Alonzo 폐기 |
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

추천: 좋은 사진 있으면 **2**, 없으면 **3**. (서체는 Pretendard 본문; 워드마크는 텍스트 "펫무브".)

## 진행 상황 (2026-07-04 갱신 — 랜딩 재구성 완료)

**랜딩 전 섹션 확정.** 프로토타입 `prototype-mobile.html` = 히어로~푸터 완성. 생성기 `scripts/make_www_prototype.py`(사진·앱스샷 base64 인라인), 반응형 760/960/1100. 검증: `edge --headless --window-size=470,N --screenshot` → PIL crop(scratchpad). ⚠️Edge 헤드리스 최소창폭 ~500이라 430 캡처 시 우측 잘림=착시(실기기 정상) → **window-size 폭 470+ 권장.** 매 변경 후 커밋(로컬 파일이라 아직 배포 X). **사용자 확인법: 크롬 로컬 열기(=노트북에서 실행됨, 세션이 노트북에서 돎) 또는 스크린샷/파일 전달. ⚠️앱 inline HTML 미리보기는 파일명으로 캐시 → 최신 보이게 하려면 새 파일명(hash 붙여)으로 SendUserFile.** PNG 스크린샷은 캐시 안 됨(가장 확실).

**섹션 순서(위→아래) — 확정:**
헤더 → 히어로 → 신뢰스트립 → **펫무브 앱 소개** → **펫무브 서비스 소개** → **앱 지원 국가** → **고객 후기** → 감성밴드 → 다크 CTA → 푸터.
(구 "두 가지 방법 + 3단계"는 폐기. 앱/서비스 독립 섹션 분리, 후기 섹션 신규.)

**섹션별 확정 카피·구성:**
- **히어로**(변경 없음): eyebrow "반려동물 해외여행 · 검역 준비" / H1 "우리 아이 해외여행, 펫무브가 챙길게요" / sub "앱으로 쉽게 준비하고, 복잡한 절차는 전문가에게 맡기세요"(`.mbr` 모바일 줄바꿈) / 버튼 "무료 앱으로 시작하기" + "전문가에게 맡기기". 워드마크 "펫무브".
- **신뢰스트립**(변경 없음): 5,300+ 누적 출국 / 50+ 지원 국가 / 20년+ 경험(`#yrs` JS 자동증가). 5,300은 DB 외삽 추정.
- **펫무브 앱 소개**: kicker "펫무브 앱 소개" / h2 "복잡한 준비, 앱으로 관리해요". **한 줄 1카드 리스트**(`.acard`, 바 없는 아이콘+제목/설명 2줄) 5개 + 점선 "이 외에도 다양한 기능이 있어요" 카드 + 풀폭 "무료 앱 받기". 카드: 단계별 가이드(언제 무엇을 해야 할지)·실수 예방(입력이 규정에 안 맞으면 알림)·일정 알림(예정일·만료일·마감일)·서류 체크리스트(한눈에 관리)·보관함(백신 라벨·수첩·각종 서류 사본). 문구는 앱스토어 스샷 헤드라인과 정렬.
- **펫무브 서비스 소개**: kicker "펫무브 서비스 소개" / h2 "전문가에게 안심하고 맡기세요". **앰버 강조 카드 2개**(`.score`, 핵심): ❤️+(ti-heart-plus) "로잔동물의료센터 — 믿을 수 있는 동물병원·수의사가 준비해드려요" / 📱(ti-device-mobile) "펫무브 앱 연동 — 앱으로 진행 상황·정보를 쉽게 확인" + 아웃라인 "상담 신청". **두 핵심 = 수의사 직접 + 앱 연동.** ⚠️CTA 미완(아래 남은 할 일).
- **앱 지원 국가**: kicker "앱 지원 국가" / h2 "27개국, 앞으로 더 추가돼요". 지원 칩 6(일본·태국·필리핀·프랑스·독일·+더보기, 초록 점) + 회색 안내문 "📅 2026년 추가 예정"(설명문 크기·회색 — 제목 오인 방지) + 점선 칩 11(하와이·싱가포르·중국·대만·미국·캐나다·영국·인도네시아·말레이시아·호주·뉴질랜드).
- **고객 후기**(신규): kicker "고객 후기" / h2 "이미 함께한 가족들". 앱 이니셜아바타 방식 카드 3(익명화·동의불필요, 출처 `apps/portal/components/services/services-view.tsx`의 JAPAN/THAILAND/PHILIPPINE_REVIEWS 총 9개 중 선택): 모짜·렐라(일본)·보리(태국)·루나(필리핀).
- **감성 밴드**: h2 "가족이니까, 언제나 함께" / p "펫무브가 챙길게요"(히어로 H1과 메아리). 사진=사람+강아지 협곡 뒷모습.
- **최종 CTA**: h2 "무료 앱으로 시작하세요"(한 줄만) + App Store/Google Play 버튼. 부제 삭제(밴드가 감성 마무리라 반복 회피).
- **푸터**(확정): 펫무브·PETMOVE / 로잔동물의료센터·124-18-42859 / 서울 관악구 관악로29길 3 · 02-872-7588 / 이용약관·개인정보처리방침·고객지원.

**카피 원칙(이번 세션 확립):** kicker=명사구, h2=문장. 나열 구분자=콤마 대신 가운뎃점(·). "다운로드"는 헤더에만(본문 CTA는 따뜻한 "받기/시작하기"). 가짜 후기·통계 금지(정직 노선), 후기는 익명화 or 동의.
**디자인 메모:** 앱 카드=담백(surface+아이콘), 서비스 핵심 카드=앰버(#FBF1E3). 섹션 배경 stone/surface 교차. 아이콘=Tabler outline. 앱 스샷 헬퍼(`b64_phone`, Play 스토어 스샷 `Desktop\스크린샷\play`에서 반듯한 폰만 PHONE_BOX 크롭+코너 배경합성)는 정의돼 있으나 현재 랜딩엔 미사용(p_hero만 남음).

## 현재 사이트 구조 (www.petmove.co.kr, Ghost — 확인 2026-07-04)
내비: 홈 · 서비스(/service/) · 가이드(/guide/) · 블로그(/blog/) · 문의(/contact/) + 인스타그램 + 카카오톡 상담. 개별 가이드·블로그 글 URL 보존(69개).

**사진(확정):**
- 히어로 = `hero-cardog-2x.png`(Gemini AI → upscale.media 2배 5056px). 폰=세로(강아지 우측 focus_x 0.66)/PC=중앙 카드 별도 크롭(hero_card). ✦워터마크는 크롭 제외. **⚠️AI 이미지라 최종 사용 여부는 사용자 재판단 여지(실사 대안 준비됨: shutterstock_450886696 골든도로, jaycee-xie 시바).**
- 밴드 = `patrick-hendry-...unsplash.jpg`(Unsplash 안전) 3000px, PC 세로 72%.
- **⚠️히어로 스크림은 position:absolute inset:0**(flex-end/flex:1로는 38px 틈 남던 버그) — 건드리지 말 것.
- 소스=`G:\내 드라이브\PETMOVE\기타\이미지`(IMG_DIR). Desktop 사본은 한글경로 인코딩 이슈로 Python이 못 읽음 → G: 사용.

## 2026-07-04 세션 갱신 — 서비스 마감 + IA 확정 + 하위 페이지 착수

- **서비스 섹션 연락 완료**: "서비스 의뢰하기"(카카오) 큰 버튼 + 아래 작게 `N 네이버예약 · TEL 02-872-7588`(회색). **3번째 카드** '전체 대행 · 부분 의뢰' 추가. 앵커 스크롤(내비 서비스·히어로 버튼→`#service`).
- **지원국가 더보기/접기 토글**: 27개국(아시아3·유럽24) 지역그룹 펼침. `[hidden]!important` 버그픽스.
- **푸터 링크 완료**: 약관·처리방침·고객지원 → `app.petmove.co.kr/{terms,privacy,support}`(셋 다 이미 라이브·앱 공유) + **네이버 블로그** `blog.naver.com/petmove`(활성). 유튜브·인스타 제외(미업데이트).
- **IA 확정**: 내비 **서비스·가이드·문의**(블로그 폐기, 가이드로 통합). 서비스=향후 드롭다운(맡기기·운송견적·에이전시). 상세 메모리 `project_www_redesign`.
- **하위 페이지 프로토타입**: `scripts/make_www_subpages.py` → `guide.html`(허브: 최근업데이트·나라별34국·검색·주제별) + `contact.html`(채널만·종합창구). 상단 심플(제목+한 줄). 나라·글 링크는 라이브 고스트로 연결.
- **연락처 확정값**: 카카오 `pf.kakao.com/_zDDxhj/chat` · 네이버예약 `naver.me/GUwSYQ9h` · 전화 `02-872-7588` · 이메일 `petmove@naver.com` · 네이버블로그 `blog.naver.com/petmove`.

## 남은 할 일 (다음 세션 진입점)

**우선순위: ① 글 본문 템플릿(69개 공유) → ② Next.js `(www)` 이식·배포(next/font Pretendard·Ghost 이관·URL 보존) → ③ 앱 스토어 버튼 연결(앱 출시 후) → ④ 서비스 드롭다운(운송견적·에이전시, 향후).** (가이드 다듬기·모바일 메뉴·워드마크는 완료/폐기.)

(아래는 구 목록 — 상당수 완료됨, 참고용)


**1. 서비스 섹션 연락 블록 — 최우선·이번 세션 중단 지점.**
별도 `/service/` 페이지는 **안 만들기로 결정**(랜딩 서비스 섹션이 이미 소개 + CTA 있음 → 반복·이탈 회피, 서비스 본질=상담해서 맡기기라 연락 수단 직접 노출이 전환 유리). 할 일:
- 단일 "상담 신청" 버튼 → **네이버 예약 · 전화(02-872-7588) · 카카오 상담 3종 블록**으로 교체.
- 히어로 "전문가에게 맡기기" + 내비 "서비스" → 이 섹션으로 **앵커 스크롤**(`#service`).
- **⚠️필요 정보(사용자 대기 중): ① 네이버 예약 URL ② 카카오 상담 URL.** (전화는 02-872-7588 확인.) 보강 문구(상담 무료·응대 시간 등)도.
- 나중에 올케어/안심케어 차이·가격·절차·SEO가 필요해지면 그때 `/service/` 페이지 분리.

**2. 만들 페이지(현재 사이트에 있는 것들 — 새 랜딩 톤으로):**
- `/guide/` 가이드 목록(나라34+절차6 인덱스), `/blog/` 블로그 목록.
- **개별 가이드/블로그 글 본문 템플릿** — Ghost→Next.js MDX, URL 보존, 앱 컴포넌트 삽입.
- `/contact/` 문의(제휴·문의 + 카톡).
- 약관·처리방침 → `app.petmove.co.kr/terms`·`/privacy`로 **링크**(복제 X, 한 곳만 관리).
- 404, (선택)회사 소개/About(로잔·20년·5,300+ 신뢰용).
- 내비에 "**문의**" 추가(현재 랜딩 헤더=서비스/가이드/블로그만). 추천 순서: 서비스 연락블록 → 문의 → 글 본문 템플릿 → 가이드/블로그 목록.

**3. 랜딩 마감 잔여:**
- ~~Alonzo 워드마크~~ **폐기(2026-07-04)** — 펫무브·펫무브워크·www 어디서도 안 씀. 워드마크는 텍스트 "펫무브"로 확정.
- **`(www)` route group Next.js 이식 + 배포** — base64 대신 next/image, URL 슬러그 보존, 본문은 next/font 로 Pretendard 복귀. (실제 www 접속 최종 단계.)
- **Ghost 콘텐츠 이관** — Export → MDX + 이미지. 이관 전 69개 URL 스냅샷 필수.

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
