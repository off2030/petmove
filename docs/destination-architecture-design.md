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

```
목적지 프로파일 (1곳)
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

### Phase 1 — 목적지 레지스트리 (파생의 뿌리)
- `packages/domain/src/destinations/registry.ts` 신설 — 프로파일 배열 단일 출처.
- 기존 하드코딩 목록들을 **레지스트리에서 파생하도록 교체**(값은 동일하게 유지 = 무동작 리팩터).
  우선순위: `SINGLE_DOSE_RABIES_DESTINATIONS`, `RABIES_ONE_YEAR_VALIDITY_DESTINATIONS`,
  `TITER_ENTRY_VALIDITY_MONTHS`, 카드 applicability 배열, `APP_DESTINATIONS_KO`, 스코핑 키.
- **검증**: 리팩터 전/후 `getStepsForCase`·`resolveRequiredDocs` 결과가 전 목적지에서 동일해야 함
  (스냅샷 테스트 추가).

### Phase 2 — 아키타입 문구 템플릿
- `euFamilyOverrides` 를 일반화해 `archetypeOverrides(archetype, profile)` 로.
- `jp-2dose`(일본·중국), `sea-permit`(태국·필리핀) 템플릿 작성 — 기존 문구를 그대로 승격.
- 나라명은 `label` 치환, 수치는 프로파일에서 주입.
- **검증**: `pnpm lint:copy` 골든 스냅샷이 "변경 없음"이어야 함(기존 문구 보존 확인).

### Phase 3 — 맡기기(services) 아키타입화
- `OFFLINE_DETAIL`/`ONLINE_DETAIL` 을 아키타입 기반으로 — `included` 는 프로파일의
  `extraProcedures`·`importPermit`·`advanceNotice` 에서 파생, 비용은 `offlineCostBumpManwon`.
- 새 목적지는 서비스 상세를 **따로 안 써도** 기본이 나오게.

### Phase 4 — 신규 목적지 스캐폴드
- `pnpm new:destination <key>` — 프로파일 스텁 + procedure-checks 파일 + registry 등록까지 생성.
- 남은 수작업(규정 조사·전용 카드·사진)은 체크리스트로 안내.

---

## 4. 즉시 고칠 것 (조사 중 발견된 실제 버그)

1. **procedure-checks 5개 파일이 registry 미등록** — `ar.ts, kh.ts, mn.ts, uz.ts, vn.ts`
   파일은 있는데 `ALL_PROCEDURE_CHECKS` 에 import 안 돼 있어 **룰이 하나도 안 돈다**(죽은 코드).
2. **www `APP_DEST_SOON` 에 '중국'이 남아 있음** — 포털에선 이미 지원 중인데 랜딩은
   "준비 중"으로 표시. 불일치.

---

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
