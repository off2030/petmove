# 고스트 → 새 본문 템플릿 변환 규칙 (초안)

작성 2026-07-06. `article-sample.html`(본문 공통 템플릿)에 69개 글을 옮기기 위한 변환 사전.
전제: 글마다 손으로 붙여넣지 않는다. **변환 규칙 한 벌**을 만들어 일괄 적용하고, 풍부한 글(일본 등)만 나중에 개별 폴리싱.

관련: `HANDOFF.md`(전체 개편 맥락), `article-sample.html`(목표 템플릿), 살려야 할 URL 69개 목록은 HANDOFF 하단.

---

## 0. 입력·출력

- **입력**: Ghost Admin → Settings → Export (사이트 전체 JSON). 각 post의 렌더된 `html` 필드 = `kg-*` 카드 클래스가 붙은 HTML.
  - 이미지는 `storage.ghost.io/...` 원격 호스팅 → **고스트 해지 전 반드시 전부 내려받아 재호스팅**(`/public` 또는 이미지 CDN). 안 하면 해지 순간 전 이미지가 깨진다. ⚠️최우선 주의.
- **출력**: `.prose` 내부 마크업(템플릿 클래스) — MDX 또는 정적 HTML. 헤더/푸터/CTA는 템플릿 셸이 공통 제공하므로 본문만 생성.

---

## 1. 글 유형 분기 (가장 먼저)

| 유형 | 판별 | 처리 |
|---|---|---|
| **산문 글 (67개)** | 본문이 글/표/리스트 | 아래 카드 매핑으로 `.prose` 생성 |
| **인터랙티브 도구 (2개)** | `japan-pet-entry-scheduler`, `japan-pet-entry-self-check` — 날짜입력·JS 계산·`kg-html-card` 스크립트 | 템플릿에 **안 넣음.** 같은 헤더/푸터 셸 + 별도 인터랙티브 컴포넌트로 재구현. URL만 보존 |

`kg-html-card`(원시 HTML/스크립트)가 들어간 다른 글이 있으면 전부 **수동 검토 플래그** — 자동 변환 대상 아님.

---

## 2. 카드 매핑 사전 (Ghost `kg-*` → 템플릿 클래스)

| Ghost 카드 | 템플릿 출력 |
|---|---|
| `<p>` 문단 | `<p>` 그대로 |
| `<h2>` / `<h3>` | 그대로 (h2=주제, h3=세부). **h1은 본문에 두지 않음** → 제목은 `.art-head h1`로 승격 |
| `<ul>` / `<ol>` / `<li>` | 그대로 |
| `<blockquote>` | 그대로 (`.prose blockquote` 앰버 좌측선 스타일) |
| **표** (`kg-table` 또는 순수 `<table>`) | `<table>` 유지. **열 4개 이상이면 `<div class="table-wrap">`로 감싼다** (모바일 가로 스크롤) |
| 이미지 카드 `figure.kg-image-card > img (+figcaption)` | `<figure><img><figcaption>` (템플릿 `.prose figure` 스타일). **글의 대표/첫 이미지 = feature_image → `.art-cover`로 맨 위에** |
| 갤러리 `kg-gallery-card` | `<figure>` 여러 개로 분해 (이 사이트엔 거의 없음) |
| 북마크 `figure.kg-bookmark-card` | `<a class="bookmark"><div class="bk-text"><div class="bk-title">제목</div><div class="bk-host">호스트</div></div><img class="bk-thumb">…</a>` |
| 임베드(유튜브) `figure.kg-embed-card > iframe` | `<div class="embed"><iframe … loading="lazy" allowfullscreen></iframe></div>` |
| 콜아웃 `div.kg-callout-card` (`kg-callout-emoji` + `kg-callout-text`) | 짧으면 `<div class="callout-note"><span class="ce">💡</span>본문</div>` / 제목·버튼 있으면 `.callout`(ch/cp/cbtn) |
| 토글 `div.kg-toggle-card` (heading + content) | `<details class="more"><summary><span>더 자세한 설명</span><i class="ti ti-chevron-down"></i></summary><div class="more-body">…</div></details>` |
| 파일 다운로드 `div.kg-file-card` | `<a class="dl" href="…" download><i class="ti ti-file-download"></i>파일명</a>` |
| 버튼 `div.kg-button-card > a.kg-btn` | **연락 버튼(네이버예약·카톡·전화·이메일)이면 삭제**(§3) / 그 외 실제 링크면 인라인 링크 또는 `.callout .cbtn` |
| 구분선 `<hr>` | 유지(섹션 간격) 또는 제거 |
| 오디오·비디오·상품·NFT 카드 | 이 사이트 미사용. 나오면 수동 플래그 |

---

## 3. 걷어낼 것 (strip)

글마다 반복되는 것들 — 템플릿이 공통으로 더 낫게 제공하므로 제거:

- **하단 연락처 버튼 뭉치** (네이버예약 바로가기 · 카카오톡 문의 · 전화하기 · 이메일) → 템플릿 하단 `.cta2`(무료 앱으로 시작하기 / 전문가에게 맡기기)로 대체. 연락 수단은 서비스 섹션 한 곳에서 단일 관리.
- **"지금 바로 예약하세요!" 류 CTA 박스** → 위와 동일하게 제거.
- **떠다니는 카카오 채팅 위젯** → 사이트 전역 요소라 본문 변환 대상 아님(셸에서 전역 처리 여부 별도 결정).
- **고스트 테마 잔재** — 저자 프로필, 태그 목록 푸터, 테마 기반 "관련 글"(우리가 직접 큐레이션할 `.related`로 대체), `/roadmap /showcase /changelog /partners`.

---

## 4. 덧붙일 것 (append / 공통 셸)

- 맨 위: `.crumb`(가이드 › 분류 › 나라) + `.art-head`(art-cat 배지 + h1 + art-meta 수정일·읽는시간).
- 맨 아래: `.cta2`(앱 + 서비스). 필요 시 `.svc-block`.
- 글 끝 도구 링크는 `.info-list`(유용한 자료)로. 예: 나라 가이드 → 해당 계산기/자가진단기.
- `.related`(직접 고른 관련 글 2~3개) — 선택.

---

## 5. 링크·경로 정규화

- 내부 링크 `https://www.petmove.co.kr/docs/…`, `/blog/…` → **상대경로** `/docs/…`, `/blog/…` (새 사이트에서 그대로 작동).
- `?ref=petmove.co.kr` 추적 파라미터 → 유지해도 무방(정리하려면 일괄 제거).
- 외부 링크(NACCS 등)는 `target="_blank" rel="noopener"` 유지.
- 슬러그 100% 보존 → 리다이렉트 불필요, `trailingSlash: true`.

---

## 6. 커버리지 체크리스트 (변환 후 자동 검증)

각 글 변환 결과에 대해:
- [ ] `kg-` 클래스가 하나도 남아있지 않다 (남으면 미매핑 카드 = 플래그)
- [ ] `<h1>`이 본문에 없다 (제목은 art-head로 승격됨)
- [ ] 열 4개 이상 표는 `.table-wrap`으로 감싸졌다
- [ ] 이미지 `src`가 전부 재호스팅 경로다 (`storage.ghost.io` 잔존 = 실패)
- [ ] 반복 연락 버튼 뭉치가 제거되고 표준 CTA로 대체됐다
- [ ] 내부 링크가 상대경로다

---

## 7. 남은 결정 / 다음 단계

1. **이미지 재호스팅 방식** 확정 (next/image + `/public` vs 별도 CDN) — 이식의 실제 병목.
2. **변환 실행 방법** — 69개면 규칙 기반 스크립트 1회 실행이 현실적(HTML 파서로 kg-카드 치환). 손 변환은 비추천.
3. **인터랙티브 2개** 재구현 계획(계산기·자가진단기) — 별도 티켓.
4. `(www)` Next.js route group 이식 + next/font Pretendard + 배포는 HANDOFF §"남은 할 일" 순서대로.
