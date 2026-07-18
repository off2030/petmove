# 목적지 아키텍처 설계 — 프로파일 + 아키타입

새 여행지를 추가할 때 **"당연히 있어야 할 것"이 자동으로 갖춰지고, 그 나라 고유한 것만
정리하면 되도록** 만들기 위한 설계. (2026-07-18 착수 — 중국 추가 작업에서 드러난 문제 기반)

> 이 문서는 **Phase 0(정렬용 설계)**. 실제 리팩터는 아래 단계별 계획에 따라 진행한다.
> 기존 [destination-onboarding-checklist.md](destination-onboarding-checklist.md) 는 **수작업 체크리스트**
> 였고, 이 문서는 그 체크리스트가 **필요 없어지게** 만드는 것이 목표다.

---

## 1. 문제 — 왜 새 목적지 추가가 힘든가

중국을 추가하며 겪은 실제 증상:

| 증상 | 사례 |
|---|---|
| **당연히 있어야 할 게 없음** | 항공권 카드 누락(applicability 미등록), 서류 탭이 별지25 하나만, 항체 만료 알림 없음, 추가 백신 카드 없음 |
| **기존에 잘 된 문구와 어긋남** | 항체검사 문구를 새로 써서 일본·EU와 다른 표현, severity 가 info/warning 뒤섞임 |
| **같은 걸 여러 번 등록** | 한글 토큰용 목록과 영문 key 용 목록에 각각 |

### 근본 원인 = **87개의 opt-in 등록 지점**

전수 조사 결과, 목적지 하나를 제대로 추가하려면 **87곳**에 등록이 필요하다.
전부 **opt-in(명단에 없으면 조용히 미적용)** 이라 빠뜨려도 에러가 안 난다.

| 카테고리 | 지점 수 | 대표 |
|---|---|---|
| A. 목적지 정규화·마스터 | 3 | `destinations.json`, `DESTINATION_OVERRIDES` |
| B. 카드 applicability 배열 | 12 | `flight-purchase`, `rabies-titer`, `import-permit` … |
| B'. 국가 전용 단독 카드 | 12 | `cn-export-quarantine`, `ie-advance-notice` … |
| B''. 카드 문구 override | 1 | `STEP_DESTINATION_OVERRIDES` |
| C. 도메인 국가별 상수 맵 | 9 | `SINGLE_DOSE_RABIES_DESTINATIONS`, `TITER_ENTRY_VALIDITY_MONTHS`, `TITER_LAB_CODES_BY_DEST`, `VET_VISIT_WINDOW_OVERRIDES` … |
| D. date-rules 국가 validator | 17 | `validateJpEntryDate`, `validateEuTiterAfterVaccine` … |
| E. procedure-checks + registry | 2 | `cn.ts` + `registry.ts` 등록 |
| F. 필수 서류 | 2 | `SPECS`(한글), `SPECS_BY_KEY`(영문) |
| G. 필드 스코핑 화이트리스트 | 1 | `DESTINATION_SCOPED_FIELD_KEYS` |
| H. 공유 파일 요청 | 1 | `share-file-requests` |
| I. 포털(portal) | 12 | 앱 화이트리스트, 히어로 사진, 맡기기 상세, 리마인더, 마일스톤 푸시, 입력불가 분기 … |
| J. 펫무브워크(admin) + domain defaults | 10 | 배지 색, 추가정보 섹션, AI 추출 스키마, 검사기관 기본룰 … |
| K. www 랜딩 | 5 | `COUNTRIES`, `APP_DEST_*` |
| **합계** | **87** | |

### 특히 함정 3가지

1. **키 형태 혼용** — 어떤 목록은 **한글 토큰**(`'중국'`), 어떤 목록은 **영문 key**(`'china'`).
   같은 나라를 두 형태로 각각 등록해야 하는 곳이 많다.
   (한글: `required-docs.SPECS`, `share-file-requests`, `services-view` DETAIL, `app-destinations`,
   `inspection-config-defaults`, `import-report-defaults`, www `APP_DEST_*`)
2. **EU 이중 구조** — `eu` 묶음(24개국, keywords 로만 존재) vs 개별 카드국(영국·아일랜드·몰타·
   노르웨이·핀란드·스위스·키프로스, 1:1 키). 새 유럽국은 어느 쪽인지 먼저 결정해야 한다.
3. **파일만 만들고 인덱스 등록 누락** — `procedure-checks/registry.ts` 가 대표적.

---

## 2. 목표 아키텍처 — 목적지 프로파일 + 아키타입

### 핵심 아이디어

목적지 하나 = **선언형 프로파일 하나**. 그 프로파일에서 위 87개 지점 중 **파생 가능한 것을 전부 파생**한다.
프로파일은 **아키타입(가족)** 을 고르고 **델타만** 적는다.

> **어디에 둘 것인가**: 새 파일이 아니라 **기존 `DESTINATION_OVERRIDES`(destination-config.ts)
> 를 확장**한다. 이미 `keywords`(한글 토큰)·`vaccines`·`extraFields` 를 들고 있는 뿌리라,
> 별도 레지스트리를 만들면 진실 출처가 둘로 갈라진다.

```
목적지 프로파일 (DESTINATION_OVERRIDES 1곳)
   ├─ archetype: 'jp-2dose'        ← 기본값 한 벌 상속
   └─ 델타: { titer.entryValidityMonths: 12, rabies.oneYearVaccineOnly: true, ... }
        │
        ├──▶ 카드 applicability (파생)
        ├──▶ 도메인 상수 맵 (파생)
        ├──▶ 스코핑 키 (파생)
        ├──▶ 앱 화이트리스트·www 목록 (파생)
        ├──▶ 카드 문구·서류·맡기기 (아키타입 템플릿 + 나라명 치환 + 델타)
        └──▶ procedure-checks·전용 카드 (수작업 — 그 나라 고유 규정)
```

### 아키타입(초안 4종)

| 아키타입 | 대표 | 특징 |
|---|---|---|
| `eu-family` | EU 24국, 영국·아일랜드·몰타·노르웨이·핀란드·스위스·키프로스 | 광견병 1회 + 항체(무기한) + 채혈 후 3개월 + 촌충(일부) |
| `jp-2dose` | 일본, **중국** | 광견병 2회 + 항체 필수 + 도착 수입검역 + 왕복 수출검역 |
| `sea-permit` | 태국, 필리핀 | 광견병 1회 + 수입허가 2단계 + 종합백신 + 항체는 귀국용 |
| `generic` | 그 외(admin 전용 국가) | 최소 구성 — 별지25 + 기본 카드 |

새 목적지는 **아키타입 선택 → 델타 몇 줄**이면 기본 구성이 완성된다.

### 프로파일 스키마 (초안)

```ts
interface DestinationProfile {
  key: string                    // 'china'  (영문 key — 단일 정규 키)
  ko: string                     // '중국'   (한글 토큰 — 여기서만 선언, 나머지는 파생)
  aliases?: string[]
  archetype: 'eu-family' | 'jp-2dose' | 'sea-permit' | 'generic'
  region: 'asia' | 'europe' | ... // www 분류까지 파생

  rabies: {
    doses: 1 | 2
    minAgeDays: 84 | 91
    oneYearVaccineOnly?: boolean        // 2·3년 백신 입력 차단
    doseIntervalDays?: number | 'soft'  // 'soft' = 권고만(중국)
  }
  titer: {
    need: 'entry' | 'return-only' | 'none'
    entryValidityMonths: number | null  // null = 무기한(EU)
    labSet: 'gacc' | 'eu' | 'jp' | 'intl'
    minDaysAfterVaccine?: number        // EU 30
    entryWaitAfterTiter?: { days?: number; months?: number } // JP 180일 / EU 3개월
  }
  importPermit?: { applyDeadlineDays: number; docName: string }
  advanceNotice?: { hardDeadlineDays: number; label: string }
  importQuarantine: { title: string; quarantineDays?: number }
  exportQuarantine?: { model: 'own-process' | 'health-cert'; docName: string }
  vetVisitWindowDays?: number           // 기본 10
  extraProcedures?: ('general-vaccine' | 'echinococcus' | 'civ' | 'external-parasite')[]
  services?: { extraIncluded: string[]; offlineCostBumpManwon?: number }
  appSupported: boolean                 // 포털 노출 여부
}
```

### 지점별 처리 분류

| 처리 | 지점 수(대략) | 내용 |
|---|---|---|
| **자동 파생** | ~45 | applicability 배열, 상수 맵, 스코핑 키, 앱·www 화이트리스트, 배지 색, 검사기관 등 |
| **아키타입 템플릿 + 델타** | ~20 | 카드 문구, 필수 서류, 맡기기 상세, 리마인더 |
| **수작업(그 나라 고유)** | ~22 | procedure-checks 룰, 국가 전용 validator, 전용 카드(사전통지 등), 히어로 사진, 규정 조사 |

→ **약 3분의 2가 자동화/템플릿화 가능.** 남는 수작업은 "그 나라 특수한 것"뿐이라, 사용자가 원한 그림과 일치.

---

## 3. 단계별 계획

### Phase 1 — 프로파일 확장 (파생의 뿌리)

> **재검토 반영(2026-07-18)**: 레지스트리를 *신설*하지 않는다. `DESTINATION_OVERRIDES` 가
> 이미 뿌리(keywords·vaccines·extraFields·rabiesTiterForReturnOnly)라, 새 파일을 만들면
> 진실 출처가 둘로 갈라진다. **기존 타입을 확장**한다.

> **진행 상태**: 1-a ✅(개인노트북) · 1-b ✅ · 1-c ✅ (2026-07-18, 직장PC). 다음 = Phase 2.

**1-a. 무동작 증명 장치 먼저** (리팩터보다 선행)
- `scripts/lint-destinations.ts` + `scripts/destinations.snapshot.txt` 신설 —
  기존 `lint:copy` 골든 스냅샷 패턴을 그대로 차용(이 repo 에 테스트 프레임워크가 없으므로
  vitest 도입 대신 검증된 기존 관용구를 쓴다).
- 스냅샷 내용: **전 목적지 × (개/고양이) × (편도/왕복)** 의
  ① 카드 목록(id·order·title·done) ② 필수 서류 목록 ③ 적용되는 check id 목록
  ④ 주요 상수(single-dose 여부·항체 유효기간·내원 윈도우).
- 리팩터 전에 골든 생성 → 이후 **스냅샷이 "변경 없음"이어야 통과**. 이게 무동작의 증명.

**1-b. `DestinationOverride` 타입 확장**
- `archetype`, `rabies`, `titer`, `importPermit`, `advanceNotice`, `importQuarantine`,
  `exportQuarantine`, `vetVisitWindowDays`, `appSupported` 등 프로파일 필드 추가(전부 optional).
- 기존 필드는 그대로 — 하위 호환.

**1-c. 하드코딩 목록을 파생으로 교체** (한 번에 하나씩, 매번 스냅샷 통과 확인) — **완료 2026-07-18**
- ✅ 파생 전환: `SINGLE_DOSE_RABIES_DESTINATIONS`(rabies.doses=1) ·
  `RABIES_ONE_YEAR_VALIDITY_DESTINATIONS`(oneYearVaccineOnly) · `TWO_DOSE_RABIES_DESTINATIONS`(신설, doses=2) ·
  `TITER_ENTRY_VALIDITY_MONTHS`(titer.entryValidityMonths) · `VET_VISIT_WINDOW_OVERRIDES`(vetVisitWindowDays) ·
  `EU_ENTRY_FAMILY`+eu.ts `EU_REGIME`(archetype 'eu-family', 중복 명단 제거) ·
  `TAPEWORM_DESTINATIONS`(개 전용 내부구충 vaccines 선언) · 카드 applicability 6곳
  (rabies-extra · flight-purchase · civ · infectious · echinococcus · import-permit · kr-return-docs) ·
  `APP_DESTINATIONS_KO`(appSupported — portal 파생, membership·선두순서 보존 검증).
- ⚠️ **파생 불가로 남긴 것(사유 명시)**:
  - `rabies-titer` 카드 destinations/roundOnly — 말레이시아(귀국용 국가인데 main 목록),
    우즈베키스탄(입국 필수인데 미노출) 등 현행 명단이 신호와 불일치. 정리 전 파생 금지.
  - `general-vaccine` 카드 — usa·taiwan 은 admin vaccines 에 없이 카드만 있음(의도적 불일치).
  - 외부·내부구충 카드 — admin vaccines 와 불일치(싱가포르 등).
  - `FLIGHT_DATE_*` 배지 — 노선 특성(출발=도착 동일일) 개별 판단 명단.
  - **스코핑 키**(`DESTINATION_SCOPED_FIELD_KEYS`) — 국가별 키(`cn_import_quarantine_date` 등)가
    카드 정의(STEP_DESTINATION_OVERRIDES 의 dated-confirm 키)에서 나오므로, 프로파일이 아니라
    **카드 템플릿(Phase 2)에서 파생**해야 맞다. Phase 2 로 이월.
- 참고: `TITER_LAB_CODES_BY_DEST` 는 **이미** `EU_ENTRY_FAMILY` 로 파생 + `eu` 덮어쓰기를
  하고 있다 — 이 패턴(가족 파생 + 델타 override)이 목표 형태의 선례다.

### Phase 2 — 아키타입 문구 템플릿 — **완료 2026-07-18**
- ✅ `seaPermitOverrides`(태국·필리핀) — 구조(1회 백신 카드·항체 order 55·수입허가 2단계·도착
  검역 카드 모양)는 템플릿이 강제, 규정 문구·검증 id 는 주입. 기존 문구 그대로 승격.
- ✅ `importQuarantineCard` factory — '[국가] 수입 검역' 카드 공통 구조(sea-permit + 중국 공유).
- ✅ **아키타입 fallback** — `resolveStepForDestination` 이 명시 오버라이드 없는 eu-family
  목적지에 `euFamilyOverrides` 한 벌을 자동 적용. 새 유럽국은 프로파일 `archetype` 선언만으로
  표준 카드를 받는다. (jp-2dose 는 base catalog 자체가 일본 골격이라 별도 템플릿 없음 —
  규정 고유 문구는 수작업 원칙.)
- ✅ **스코핑 키(1-c 이월)** — 파생하면 catalog ↔ destination-scoped-fields 순환 의존이 생겨
  파생 대신 **lint:dest 가드**로 해결: `quarantine:<key>` 완료 신호의 `_date`/`_confirmed` 쌍이
  미등록이면 에러(조용한 opt-in → 시끄러운 실패).
- **검증**: lint:copy·lint:dest 무변경 + 구/신 `resolveStepForDestination` 결과를 전 목적지 ×
  전 step deep-equal 대조(문구 골든이 안 덮는 links·첨부 라벨·inputs 포함) — 완전 동일.

### Phase 3 — 맡기기(services) 아키타입화 — **완료 2026-07-18**
- ✅ 사전 통지국 명단(`OFFLINE/ONLINE_DETAIL` 4개국 복사 루프) → `ADVANCE_NOTICE_DESTINATIONS`
  (프로파일 `advanceNotice` 선언) 파생.
- ✅ `offlineDetail`/`onlineDetail` factory — 진행 단계·FAQ 골격·intro 골격은 factory 가
  강제하고 나라 사실(강조절·절차 항목·비용·기간·후기)만 주입. **included 는 프로파일 파생**:
  종합백신(vaccines 'general')·내부구충(전 종 internal_parasite)·항체검사(귀국용 국가는
  왕복만 — rabiesTiterForReturnOnly × trip) — 여정 카드와 어긋날 수 없다. EU 패밀리는
  절차 항목이 임상검사 뒤, 일본·동남아는 앞(아키타입별 순서 규칙).
- ✅ 폴백은 기존 `resolveDetail`(`목적지:트립 → 목적지 → eu → default`) 유지.
- **검증**: 구(HEAD)·신 `OFFLINE/ONLINE_DETAIL` 전 키 JSON deep-equal — 완전 동일(무동작).
  비용·기간 값 자체는 여전히 나라별 운영 입력(자동 산출 규칙은 만들지 않음 — 가격 정책은
  운영 결정 영역).

### Phase 4 — 신규 목적지 스캐폴드 — **완료 2026-07-18**
- ✅ `pnpm new:destination <key> <한글명> --cc <iso2> [--archetype …]`
  (scripts/new-destination.ts) — procedure-checks 스텁 생성 + registry 자동 등록(과거 5개국
  누락 함정 방지) + 프로파일 스텁·수작업 체크리스트 출력. 가짜 국가로 왕복 검증 완료.

---

## 4. 즉시 고칠 것 (조사 중 발견된 실제 버그) — **둘 다 수정 완료 2026-07-18**

1. ✅ **procedure-checks 5개 파일이 registry 미등록** — `ar.ts, kh.ts, mn.ts, uz.ts, vn.ts`
   `ALL_PROCEDURE_CHECKS` 에 등록 완료. 재발 방지: `pnpm new:destination` 이 registry 등록을
   자동화하고, lint:dest 스냅샷의 `[checks:N]` 줄이 등록 누락을 드러낸다.
2. ✅ **www `APP_DEST_SOON` 의 '중국'** — 제거 완료(현재 SOON 목록에 중국 없음).

---

## 4-b. 설계 재검토 기록 (2026-07-18, 버그 수정 후)

초안을 코드에 대조해 **3가지를 수정**했다.

| 초안 | 문제 | 수정 |
|---|---|---|
| `destinations/registry.ts` **신설** | `DESTINATION_OVERRIDES` 가 이미 뿌리(keywords·vaccines·extraFields) — 신설하면 진실 출처가 둘 | 기존 타입 **확장**으로 변경 |
| 무동작 증명 = **스냅샷 테스트** | 이 repo 에 vitest/jest **없음**. 근거 없는 계획이었음 | 기존 `lint:copy` **골든 스냅샷 패턴 차용**(`lint:destinations`) |
| 파생 가능성 미검증 | — | `TITER_LAB_CODES_BY_DEST` 가 **이미** `EU_ENTRY_FAMILY` 파생 + `eu` 덮어쓰기 → 목표 형태의 선례 확인 |

**검증된 설계 가정**
- 프로파일 필드는 **직교**한다 — `SINGLE_DOSE`(1회 접종)와 `ONE_YEAR_VALIDITY`(1년 백신만)는
  독립이다(태국·필리핀=둘 다, 중국=2회+1년, EU=1회만). 따라서 아키타입 하나로 뭉뚱그리지 말고
  **필드별로 선언**해야 한다. → 스키마가 이미 그렇게 돼 있음(유지).
- 파생에는 **override 층이 반드시 필요**하다(`eu: ['apqa_eu']` 처럼 가족 기본값을 덮어쓰는 사례
  존재). "아키타입 + 델타" 구조가 옳다.

## 5. 원칙 (리팩터 중 지킬 것)

- **무동작 리팩터 우선** — Phase 1·2 는 결과가 바뀌면 안 된다. 스냅샷·trace 로 증명하고 진행.
- **한글 토큰은 레지스트리에서만 선언** — 나머지는 `ko` 에서 파생. 키 형태 혼용 제거.
- **수작업으로 남는 것은 명시** — 규정 고유(procedure-checks·전용 카드)는 자동화하지 않는다.
  자동화하면 오히려 잘못된 규정이 조용히 퍼진다.
- **opt-in → opt-out 전환** — 새 목적지는 기본적으로 표준 구성을 **받고**, 빼고 싶은 것만 끈다.

---

## 관련 문서·메모리
- [destination-onboarding-checklist.md](destination-onboarding-checklist.md) — 현행 수작업 체크리스트(Phase 4 이후 대체)
- [destination-scoping-design.md](destination-scoping-design.md) — 필드 스코핑 설계
- 메모리 `project_destination_scoping_optin_whitelist` — opt-in 누수 근본 원인
- 메모리 `project_destination_journey_cards` — 목적지 카드 작업 이력
