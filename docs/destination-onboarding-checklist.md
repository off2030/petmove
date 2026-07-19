# 새 목적지 추가 체크리스트

펫무브 여정에 새 목적지(나라)를 일본 수준으로 추가할 때의 작업 목록.
**일본 케이스를 화면 단위로 전수 점검한 결과** — 카드 목록에 안 드러나는 "동작" 기능까지 빠짐없이
옮기기 위한 단일 출처. (이 문서가 없던 시절, 태국·필리핀·EU 작업에서 입력불가·만료카드·종 분기·
목적지 유지 같은 동작이 사후에 하나씩 발견됐다.)

> 착수 전 의식(ritual): 이 문서를 위에서 아래로 훑으며 "이 나라엔 이 동작이 필요한가?"를 항목마다
> 판단한다. 필요 없으면 "해당 없음"으로 명시적으로 넘기고, 필요한데 빠지면 그게 바로 회귀다.

---

## 0. 규정 조사 (먼저)
- [ ] petmove.co.kr `/docs/<country>-pet-travel-guide/` 정독
- [ ] 그 나라 검역당국 공식 + 대사관/외교부 PDF 1~2개 교차 확인
- [ ] **충돌 시 공식 우선** + 차이 나는 지점은 사용자에게 보고 (예: 태국 광견병 84 vs 91일, 핏불 금지 여부)
- [ ] 대상: **개·고양이만**. 종별로 백신 종류·연령이 다르면 분리 표시 대상으로 메모

## 1. 카드 구성 (catalog.ts + destination-overrides.ts)
- [ ] **광견병 접종 모델**: 1회 접종(+유효기간 유지 부스터)인가, 2회(일본식)인가?
      → 1회면 `SINGLE_DOSE_RABIES_DESTINATIONS`(applicability.ts)에 키 추가
      (이 한 줄이 2차 카드 제외·추가 백신 카드 노출·완료 판정을 모두 좌우한다)
- [ ] **광견병 1차** override: 제목('광견병 백신'), 생후 최소 연령(`earliest.daysAfter` — 84/91),
      validationIds(`<cc>.rabies-prime-*`, `<cc>.microchip-before-rabies`)
- [ ] **항체 검사**: 입국 필수인가, 한국 귀국용(왕복 only)인가? → `roundOnlyDestinations`
- [ ] **종합백신**: 종별 분리 필요? → `descriptionBySpecies: { dog, cat }` (+ description 폴백 필수)
- [ ] **항공권**: 입국 가능 시기 제약(채혈+N일/접종+N일) → `earliest` 또는 입력차단 + validationIds
- [ ] **구충**: 외부/내부/촌충(에키노코쿠스) 중 무엇? 시점·종 한정? (EU 5국=촌충·강아지만)
- [ ] **수입 허가**: 필요하면 `import-permit` destinations 에 추가 + 신청→허가증 2단계
      (deriveImportPermitStatus). 마감·링크·문구 override
- [ ] **사전 통지/신고**: 필요하면 신규 카드(아일랜드 ie-advance-notice 패턴) + `quarantine:` confirm
- [ ] **도착 입국 검사(departure override)**: '[나라] 수입 동물검역/입국 검사' 제목·문구,
      `done: 'quarantine:<cc>_import_quarantine_date'`, 검역일 input
- [ ] **왕복 귀국 절차**: 현지 검역증명서/수출검역 카드(`<cc>-export-quarantine`) + 한국 수입검역 validationIds

## 2. 입력불가 (저장 차단 — date-rules.ts + step-detail-view.tsx getSaveBlockError)
> **원칙(일본 모델)**: 이후 단계 입력 시 이전 단계와 모순되면 *차단*. 이전 단계를 나중에 고쳐
> 깨진 경우만 이후 카드에 *주의*. 회복 경로가 없는 위반만 hard 차단(날짜만 바꾸면 되는 건 차단 X).
- [ ] 광견병 1차 < 생후 최소 연령 (validateRabiesPrimeAge — minDays)
- [ ] 광견병 접종일 < 칩 시술일 (1회 접종국은 1차 입력 시, 일본은 2차 입력 시)
- [ ] 항체 채혈일 < 직전 유효 접종 + N일 (EU 30일 — validateEuTiterAfterVaccine)
- [ ] 입국일 < (채혈/접종 + 대기일) — 회복 불가 위반만 (일본 180일·태국 21일·EU 3개월·필리핀 120일령)
- [ ] 수입허가/사전통지 신청일 < 마감 (태국 7영업일·EU 24h·스위스 21일·백신+14일 등)
- [ ] 종합백신·구충 날짜 < 출생일 (논리 불가능 — 저장 거부)
- [ ] 입력 차단마다 **짝이 되는 주의 룰**(`<cc>.*-valid`)을 procedure-check 에 — 이전 단계 수정 경로 커버

## 3. 만료 대비 — 추가 백신·추가 검사 카드 (advisory)
- [ ] 출국/입국 전 광견병 유효기간이 끝나는 케이스 → **추가 백신 카드가 떠서 안내**하는가?
      (`rabies-vaccine-extra` applicability 에 키 포함 — SINGLE_DOSE_RABIES_DESTINATIONS 면 자동)
- [ ] situational 안내문이 그 나라 이름으로 나오는가 (하드코딩 '일본' 금지 — destinationToken 사용)
- [ ] 항공권 카드의 만료 주의는 추가 백신 카드로 이관(ADVISORY_DEFERRED_CHECKS) — 중복 노출 방지

## 4. 주의 (procedure-checks/<cc>.ts)
- [ ] severity 통일: 의료·일정 룰은 `warning`(일본과 동일). info 는 정말 부가 안내만
- [ ] 검역일 재검증 룰(`<cc>.*-quarantine-date-valid`) — buildDateRuleContext 재사용
- [ ] 문구 규칙: 추측 단정 금지, 조치 불가능한 step 엔 미노출, 실행 가능한 목표 날짜 제시
- [ ] **override 의 validationIds 도 check-mapping 이 인덱스함** — 룰 id 오타 시 lint:journey 가 잡음

## 5. 필수 서류 (required-docs.ts)
- [ ] SPECS(토큰 키) 또는 SPECS_BY_KEY(EU 처럼 토큰이 나라마다 다른 경우)에 스펙 추가
- [ ] 왕복 전용 서류(귀국용 항체 결과지 등)는 `roundTripOnly: true`

## 6. 스코핑 (destination-scoped-fields.ts) — 누수 차단 (필수)
- [ ] 검역·허가·통지 신규 case.data 키 전부 `DESTINATION_SCOPED_FIELD_KEYS` 에 등록
      (`<cc>_import/export_quarantine_date/_confirmed`, 신청일·skip 플래그 등)
- [ ] 동물 단위 사실(접종 이력 등)은 `GLOBAL_CASE_DATA_KEYS`
- [ ] `node scripts/lint-destination-scoping.mjs` 통과 확인

## 7. 펫무브앱 배선 (apps/portal)
- [ ] 신규 입력 폼 필요 시 컴포넌트 (기존 GeneralVaccineInputs/ImportPermitInputs/검역 폼 재사용 우선)
- [ ] server action (updateImportPermitFields 등) — by_dest 스코핑 라우팅
- [ ] getSaveBlockError 에 입력 차단 분기 (2번 항목)
- [ ] 가이드 leaf 페이지(연락처 등) 필요 시 `/guide/<cc>-*`

## 8. 검증 (착수 후 — 빠짐없이)
- [ ] `npx tsc --noEmit` : packages/domain · apps/portal · apps/admin 모두 0
- [ ] `node scripts/lint-destination-scoping.mjs` (누수) + `node scripts/lint-journey-catalog.mjs` (정합성)
- [ ] **trace 스크립트**: 그 나라 × (개/고양이) × (편도/왕복) 조합으로 `getStepsForCase` 결과를
      출력해 카드 목록·순서·done·validationIds 가 설계와 일치하는지 눈으로 확인
      (필리핀 import-permit 목적지 누락을 이걸로 잡았다)
- [ ] 만료 케이스(접종 유효기간 < 입국일)도 trace 해서 추가 백신 카드 노출·안내문 확인

---

## 재사용 가능한 공용 메커니즘 (이미 일반화됨 — 그대로 쓰면 됨)
- `SINGLE_DOSE_RABIES_DESTINATIONS` — 1회 접종국 단일 출처 (2차 제외·추가 백신·완료 판정)
- `euFamilyOverrides(label)` — 규정 동일한 나라들이 카드 한 벌 공유 (EU 패밀리)
- `descriptionBySpecies` — 종별 본문 분기 (getStepsForCase·상세 페이지가 단일 출처에서 처리)
- `deriveImportPermitStatus` / `has-import-permit` — 수입허가 2단계 (허가국 공용)
- `quarantine:<field>` done 시그널 — 나라별 검역 카드 배선 없이 동작 (scenario 일반화)
- 상세 페이지는 `getStepsForCase` 결과를 그대로 사용 — 일정 목록과 항상 같은 카드

## 다중 목적지 주의 (별개 축)
- 활성 목적지(`?dest=`)는 케이스별 sessionStorage(last-case.ts)로 기억 — 탭 전환·스와이프·복귀에서 유지
- step 복귀·docs 링크 등 **돌아가는 모든 경로**에 `?dest` 부착 (한 군데만 빠져도 첫 목적지로 리셋)

## 검증하지 않기로 한 것 (재발 방지 — 다시 "빠졌다"고 올리지 말 것)

전수 점검 때마다 "규정에 있는데 룰이 없다"로 걸리는 항목들. **의도적으로 두는 것**이다.
(2026-07-19 대만 전수 점검에서 확인·결정)

- **항체 수치 0.5 IU/mL 미만** — 카드 설명문에 합격 기준은 안내하되, 값 검증은 하지 않는다.
  `ua.titer-value-min-0.5iu` 가 우크라이나에만 있는 건 이 결정 이전에 만든 것 — 다른 나라로
  일반화하지 않는다.
- **마이크로칩 ISO 11784/11785 15자리 형식** — APHIA 등 다수 국가가 ISO 를 요구하지만
  비ISO 칩은 '보조 칩 추가 식재 **권고**' 수준이라 차단·경고 대상이 아니다.

## 관련 메모리
- `project_destination_journey_cards` — 완료 국가·작업 이력
- `project_procedure_checks_progress` — 룰 현황
- `project_destination_scoping_optin_whitelist` — 누수 근본 원인
