# 펫무브워크 브랜드 스킨 설계 계획

작성 2026-07-28. 펫무브워크(admin)를 새 브랜드 디자인(흰 캔버스 + 하늘 파랑 #0BAEFF + 잉크 그레이)으로
리브랜딩하기 위한 계획. **flat 스킨을 기반으로 변형**해 만든다.

---

## 1. 배경·목표

- 현재 admin 스킨 2종: `editorial`(default, Parchment/Terracotta 웜톤) / `flat`(Linear/Notion 류 모노크롬).
- 새 브랜드 기준(2026-07-11 확정)은 **portal 코드가 진실**:
  - 색 = `apps/portal/app/globals.css` 의 `--pm-*` (light + `.dark`)
  - 핵심: 캔버스 `#F4F6F8` / surface 순백 / 잉크 3단 `#212124·#5C5C60·#97979C` /
    액센트 `#0BAEFF`(다크 `#3FC0FF`) / positive `#14B8A6` teal / danger `#E5484D` / 폰트 Pretendard 단일
- 목표: admin 에 이 팔레트를 입힌 새 스킨을 추가하고, 검수 후 default 로 승격한다.

## 2. 접근 방식 — 새 스킨 `brand` 추가 (flat in-place 수정 아님)

flat 을 직접 고치지 않고 **flat 블록을 복제한 세 번째 스킨 `brand`(라벨 "브랜드")** 를 만든다.

이유:

1. **비교·롤백이 공짜** — 스킨 피커에서 flat ↔ brand 즉시 전환하며 튜닝 가능. 망치면 flat 이 그대로 남아 있음.
2. **구조 리스크 0** — 스킨은 순수 CSS 토큰 블록(`[data-skin="X"]`)이라 컴포넌트 코드 분기가 없다.
   (grep 확인: `data-skin` 을 읽는 컴포넌트 코드 없음. avatar 주석 1건뿐.)
3. globals.css 317~373행에 **"스킨 추가 체크리스트" 9개 축**이 이미 정리돼 있어 그대로 따라가면 됨.
4. flat 의 구조 결정(타이포 스케일·italic 제거·mono 평탄화)은 그대로 물려받고 **색만 브랜드로 교체**하면 된다.

flat 에서 상속하는 것 / 바꾸는 것:

| 축 | flat 에서 상속 | brand 에서 교체 |
|---|---|---|
| 폰트 | Pretendard 단일 평탄화 (`--font-sans-flat`), `.italic` 무효화, `.font-mono` tabular-nums | (변경 없음 — 브랜드도 Pretendard) |
| 타이포 스케일 | 8-tier tight 스케일 (base 14px, tracking −0.011em) | (변경 없음) |
| radius | 0.5rem | (변경 없음) |
| 중립 색 | zinc 계열 | **잉크 그레이 계열** (#212124/#5C5C60/#97979C, hairline #E4E6EA) |
| primary/accent | 검정 solid | **하늘 #0BAEFF** (다크 #3FC0FF) |
| 상태색 | 채도 0 (전부 검정) | **teal positive · amber warn · #E5484D danger** |
| chip 6-tone | zinc + 미세 hue | **portal cool 파스텔** 값 |

## 3. 토큰 매핑 (핵심 레시피)

**portal globals.css 217~350행의 "@petmove/ui 호환 레이어"가 이미 정답지다** — 새 팔레트를
`--pmw-*`·shadcn 토큰 이름으로 매핑해 둔 유일한 곳. brand 스킨 light 블록은 이 값을 복사하되,
타이포 스케일만 flat 것(tight)으로 유지한다.

### 3.1 Light — `[data-skin="brand"]`

| 토큰 | 값 | 비고 |
|---|---|---|
| `--background` | `0 0% 100%` (시작값) | §7 결정사항 A — 회색 캔버스 `210 22% 96%` 는 검수 때 A/B |
| `--foreground` / text-primary | `240 4% 14%` (#212124 ink) | |
| `--card` `--popover` | 순백 | |
| `--primary` `--ring` | `200 100% 52%` (#0BAEFF) | primary-foreground 흰색 |
| `--secondary` `--muted` `--accent` | `216 15% 94%` 중립 회색 | hover tint |
| `--muted-foreground` | `240 2% 37%` (#5C5C60 ink-2) | |
| `--border` `--input` | `220 12% 91%` (#E4E6EA) | |
| `--destructive` | `358 75% 59%` (#E5484D) | |
| `--pmw-accent` | `200 100% 52%` | `--pmw-accent-strong` = `202 88% 40%` (#0C7AC0) — **텍스트 액센트는 이걸로** (§8 대비 리스크) |
| `--pmw-tag-bg/fg` | soft sky `#E4F4FF` / deep sky ink | |
| `--pmw-positive` | `172 80% 40%` (#14B8A6 teal) | |
| `--pmw-cal-today` | 브랜드 하늘 | sunday `358 75% 59%` / saturday `206 48% 52%` (#4B8CBF info) |
| `--pmw-avatar-bg/fg` | soft sky / deep sky ink | |
| `--pmw-warning*` `--pmw-info` | portal 값 (honey amber / info blue) | |
| chip 6-tone | portal 8-tone 중 red·amber·olive·blue·plum·neutral 6개 채택 | admin 은 6-tone 체계 |
| raw `--pmw-*` (near-black~paper) | portal 미러 값 그대로 (#212124, #5C5C60, #97979C, #0BAEFF, #E4F4FF, #14B8A6, #E5484D, #E4E6EA, #F4F6F8→일단 #FFFFFF, #FFFFFF) | parchment 는 §7-A 와 연동 |

### 3.2 Dark — `[data-skin="brand"].dark`

portal `.dark` 블록에서 파생:

- bg `#17171A` / surface·popover `#202024` / 잉크 `#E6E6EA·#A8A8AE·#78787E`
- primary·ring·accent `#3FC0FF`, tag-bg `#0F3348`
- positive `#2DD4BF`, danger `#F2555A`, warn `#FACC15`(텍스트용은 낮춰서)
- border `rgba(230,230,234,.12)` ≈ HSL `240 3% 18%` 근사
- chip dark 6-tone: flat dark 구조(저채도 bg + 고명도 fg)에 hue 만 portal 파스텔 계열로

## 4. 변경 파일 (스킨 등록 배선)

| 파일 | 변경 |
|---|---|
| `apps/admin/app/globals.css` | `[data-skin="brand"]` + `.dark` 블록 (체크리스트 9축 전부), `.font-mono`·`.italic` 룰에 brand 셀렉터 추가, `[data-bubble="own"]` brand 룰 |
| `apps/admin/lib/use-skin.ts` | `SKIN_LIST`·`SKIN_LABELS` 에 `brand`("브랜드") 추가 |
| `apps/admin/components/theme-provider.tsx` | `VALID_SKINS` 동기화 |
| `apps/admin/public/skin-boot.js` | `V = ['flat','brand']` 동기화 (FOUC 방지 경로) |
| `apps/admin/components/layout/skin-picker.tsx` | `SKIN_PREVIEW` 스와치 `{ bg:'#FFFFFF', accent:'#0BAEFF' }` |

컴포넌트 수정 불필요 — 전부 토큰 참조라 자동 반영.

## 5. 단계별 계획

### Phase 1 — 스킨 골격 (light) ✅ 2026-07-28
flat 블록 복제 → §3.1 매핑으로 색 교체 → §4 배선 5개 파일. 이 시점부터 스킨 피커에서 선택 가능.

구현 노트 (계획과 달라진 점):
- `--pmw-amber` 는 portal 미러(하늘)가 아니라 **honey amber** — admin 에선 경고색(백신 임박·알림 dot)으로 실사용됨.
- `--pmw-deep` 은 #0BAEFF 가 아니라 **#0C7AC0** — 텍스트 강조용이라 흰 바탕 대비 확보 (§8).
- chip 은 6-tone 이 아니라 **8-tone 전부** 정의 — flat 이 moss·mauve 를 빼먹어 editorial 웜톤이 새던 기존 문제를 brand 에선 차단.
- **flat 폰트 순환 버그 발견·수정**: `:root` 의 `--font-sans-flat: var(--font-sans)` 와 스킨 블록의
  `--font-sans: var(--font-sans-flat)` 이 같은 요소에서 순환 → 셋 다 invalid → flat 이 Pretendard 가 아닌
  Noto Sans KR 폴백으로 렌더되고 있었음. `--font-sans-flat` 을 리터럴로 바꿔 해결 (flat 도 함께 고쳐짐).

### Phase 2 — dark 블록 + 디테일 ✅ 2026-07-28
§3.2 dark 블록. 채팅 버블(소프트 스카이 틴트, portal 동일)·봇 아바타([data-skin] 공통 룰이 primary 자동 사용)·
달력·chip 8-tone·warning 배너까지 토큰 정의 완료. 실화면 미세조정은 Phase 3 검수에서.

### Phase 2.5 — 상단바 로고 스킨 연동 ✅ 2026-07-28
brand 스킨일 때 상단바 아이콘을 버건디 P → **'떠오르는 P' 확정 마크**(portal LogoMark 와 동일 아트웍,
`components/layout/brand-logo-mark.tsx` 복사본)로 전환. `data-skin` CSS 토글(`.brand-skin-only` /
`.brand-skin-hidden`)이라 hydration 깜빡임 없음. editorial·flat 은 기존 마크 유지.
파비콘·PWA 아이콘(`app/icon.tsx` 등)은 스킨별 분기가 불가능한 전역 자산 — Phase 4 default 승격 때 함께 교체.

### Phase 3 — 전 화면 시각 검수
preview 로 주요 화면 순회: 할일(todos)·검사 테이블·케이스 목록/상세·메시지·설정(약품/문서/자동화)·
알림·super-admin·로그인. light/dark 각각. 이때 §7 결정사항 A(캔버스 회색) A/B 시험.

### Phase 4 — default 승격 + 외부 페이지
- `use-skin.ts`·`skin-boot.js`·`theme-provider.tsx` 의 기본값을 `editorial` → `brand` 로.
  (editorial 은 attribute-less `:root` 기반이라 CSS 리팩터 없이 "저장값 없으면 `data-skin="brand"` 부여"만으로 전환 가능.
  editorial 을 명시 선택한 사용자는 지금처럼 attribute 제거로 동작 — 기존 룰 그대로.)
- `FORCE_DEFAULT_PATHS`(/apply·/share)의 강제 스킨을 editorial → brand 로 전환 (§7-C 결정 후).
  skin-boot.js 의 `force` 분기도 함께.

### Phase 5 — 정리·문서
- `docs/design-system.md` 개정: Editorial 단일 출처 서술 → 스킨 체계 + brand 기준으로 재작성.
- `apps/admin/CLAUDE.md` "디자인" 행 갱신.
- 구 스킨 처리 결정(§7-D) 반영. 커밋·배포(Actions).

## 6. 검증 체크리스트

- [ ] light/dark × brand 로 Phase 3 화면 전부 통과 (FOUC 없음 — 새로고침 시 깜빡임 확인)
- [ ] /apply·/share 는 Phase 4 전까지 editorial 유지 (외부 고객 화면 영향 0)
- [ ] 달력: 오늘·선택일·일/토 색, DateTextField 푸터
- [ ] 채팅: own/other 버블, 봇 아바타
- [ ] 상태 표기: StatusDot 6-tone, 페이지 상단 집계 pill, 검사 chip
- [ ] 스킨 전환 3종 순회 시 잔상 없음 (localStorage 저장·복원)
- [ ] `pnpm lint`·빌드 통과

## 7. 결정 필요 사항 (검수 시점에 확정)

- **A. 캔버스 색** — 순백(현 flat 구조 유지, 권장 시작점) vs 브랜드 정의 그대로 회색 캔버스 `#F4F6F8` + 흰 popover.
  admin 은 카드리스 구조라 회색 캔버스가 "전체 회색 화면"으로 보일 위험 → Phase 3 에서 실화면 A/B 후 결정.
- **B. default 승격 시점** — Phase 3 검수 통과 직후 즉시 vs 며칠 병행 사용 후. (스킨은 localStorage 라 사용자별 롤백 자유.)
- **C. 외부 페이지(/apply·/share) 전환** — 고객 노출 화면이므로 brand 전환이 리브랜딩 취지에 맞음.
  단 /share 수신자 라벨 톤 작업 진행 중이라 그 세션과 충돌 없게 타이밍 조율.
- **D. 구 스킨 정리** — editorial·flat 을 유지(피커에 남김) vs 제거. 제거 시 editorial 은 :root 기반이라
  대규모 CSS 정리가 필요하므로 **당분간 유지 권장**, 제거는 별도 세션.
- **E. 스킨 id/라벨** — `brand`("브랜드") 가칭. 대안: `sky`("스카이").

## 8. 리스크

- **#0BAEFF 위 흰 텍스트 대비 ≈ 2.5:1 (AA 미달)** — solid 버튼(큰 요소)은 portal 과 동일하게 허용하되,
  **흰 바탕 위 액센트 텍스트는 `--pmw-accent-strong`(#0C7AC0)** 을 쓴다. 링크·chip text 류 주의.
- **다크 amber `#FACC15`** 는 배경색으로만 — 텍스트는 명도 조정 필요.
- editorial 시대 인라인 스타일 잔재(`style={{ color: 'var(--pmw-rust)' }}` 류)는 토큰 참조라 자동 추종되지만,
  Phase 3 에서 뜻밖의 색 조합(예: sage=teal 이 어색한 자리) 발견 시 개별 보정.
- `docs/design-system.md` 가 Editorial 전제로 쓰여 있어 Phase 5 전까지는 신규 작업 시 혼선 가능 — 문서 갱신을 미루지 말 것.
