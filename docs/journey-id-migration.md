# 여정 ID 전환 — 구현 1단계 상세 설계

> ❌ **미채택 (2026-06-08).** 같은 목적지 **동시** 2개를 금지하고, 지난 여정은 풀 데이터가 아니라 **요약만**(`past_journeys`) 남기기로 결정 → 여정 ID 전환(수 주·프로덕션 마이그레이션)은 **불필요**해졌다. 현재 채택 방향은 [journey-lifecycle-design.md](journey-lifecycle-design.md). 이 문서는 **향후 같은 목적지 동시 진행이 정말 필요해질 때**의 출발점으로 보존한다.
>
> ---
>
> [journey-lifecycle-design.md](journey-lifecycle-design.md) §2.2·§9 "여정 인스턴스 모델"의 구현 설계. 작성 2026-06-08.
>
> **목적**: 여정을 "목적지 이름"이 아니라 "여정 고유 ID"로 식별하도록 전환 → **같은 목적지를 N번**(예: 일본 6월 + 일본 10월, 재출국) 지원.
>
> ⚠️ 프로덕션 실데이터 마이그레이션을 포함하는 가장 큰/위험한 단계. 코드·설계·로컬 검증을 모두 마치고 **사용자 최종 승인 후에만** 프로덕션 적용.

---

## 0. 왜 (근거)

- 같은 나라로 **다시 출국하는 경우가 흔함**(사용자 확인 2026-06-08 — "일본 왔다 갔다 하는 사람도 있으니").
- 현재는 `by_dest`·`trip_type`의 키가 **목적지 이름**이라, 같은 목적지가 2개면 키가 충돌해 구분 불가.
- "지난 여정 보관"에서 **완료된 일본 + 새 일본**이 충돌 → 여정 ID 필요.
- 조사 규모: 펫무브워크 44개 파일 + 펫무브·공용 ~80곳, 프로덕션 데이터 마이그레이션. (조사 출처: 2026-06-08 세션)

---

## 1. 스키마 — 방식 A (케이스 jsonb 구조 연장)

**방식 A 채택.** 별도 `journeys` 테이블(방식 B)은 RLS·Realtime·쿼리 전면 재작성이라 위험이 훨씬 크다. jsonb 연장이 변경·위험 최소 + 단계적 적용 가능.

```
cases.destination                         유지 — 표시용 토큰 목록 "일본, 베트남" (UI/검색)
cases.data.journeys = [                    신설 — 여정 메타 배열
  { id, destination, tripType, status, departureDate?, completedDate? },
  ...
]
cases.data.by_dest[<여정ID>][필드]          키: 목적지명 → 여정ID
cases.data.trip_type                       → journeys[].tripType 으로 흡수 (구현 시 확정)
```

- **여정 메타** 타입은 [packages/domain/src/journey-steps/lifecycle.ts](../packages/domain/src/journey-steps/lifecycle.ts)의 `JourneyInstance`를 그대로 사용(이미 작성됨).
- **여정 ID**: UUID (`crypto.randomUUID()`). 의미있는 slug 는 충돌·재명명 위험으로 배제.
- `destination` 컬럼은 **그대로 유지** — 표시·검색·hasJourney 판정이 계속 토큰 기반. 바뀌는 건 `by_dest`/`trip_type`의 **키뿐**.

---

## 2. 마이그레이션 (기존 → 신규)

케이스마다:
1. `destination` 토큰을 순서대로 순회.
2. 각 토큰에 **여정 생성** — UUID 부여, `journeys[]`에 `{id, destination: 토큰, tripType: 기존 trip_type[토큰], status: 'active'}` 추가.
3. `by_dest[토큰]` → `by_dest[여정ID]`로 이동.
4. `trip_type[토큰]` → 해당 journey 의 `tripType`로 이동.

**안전 게이트:**
- **단일 목적지 케이스**(대부분)는 `by_dest`를 안 쓰므로 → 여정 1개 메타만 생성, **데이터 이동 0**. 회귀 위험 최소.
- **legacy fallback**: 마이그 전·누락 케이스 읽기 시 `by_dest[여정ID]`가 없으면 `by_dest[목적지명]`으로 다시 찾기 → 마이그 전/후 양립.
- **case_history 호환**: 기존 `field_key: 'by_dest:목적지명:key'` 형식을 읽기 시 인식 유지(undo/표시 깨짐 방지).

---

## 3. 코드 전환 순서 (각 단계 독립 커밋·배포)

1. **스키마 헬퍼 + 마이그레이션** (domain)
   - `getJourneys(caseRow): JourneyInstance[]`, `findJourneyId(caseRow, destinationToken, ...)`.
   - `readByDestValue`/`writeByDestValue`가 **여정ID 우선 + 목적지명 fallback**.
   - 마이그레이션 SQL (로컬 검증).
2. **domain reader 인자 전환** — `destination` → `journeyId`(의미상 동일, fallback 유지):
   - `getDepartureDate`/`getVetVisitDate`/`flattenCaseForDestination`/`readEffectiveExtraValue`
   - `procedure-checks` 30개국 reader (`readDepartureDate`/`readVetVisitDate` 호출처)
   - `applicability.ts`의 `buildCaseJourneyContext`(여정ID 컨텍스트), `getStepsForCase`
3. **펫무브워크(admin)**
   - `destination-field` 칩: 추가=여정 생성(UUID), 삭제=여정 제거. 표시는 목적지명 lookup.
   - `cases-context` `activeDestination` → `activeJourneyId`.
   - `case-detail`/`todos`/PDF(`flattenCaseForDestination`)/share-link/verification 인자 전환.
4. **펫무브(portal)**
   - `active-destination`/`scenario`(buildJourney)/`case-header`/`?dest=` → 여정 단위.
   - `updateFlightFields`/`updateVetVisitDate`/`addCaseDestination`/`removeCaseDestination`/`setCaseDestinationTripType` 여정ID 화.
5. **lifecycle.ts 연결(wire)** — `caseRow → JourneyInstance[]` 매핑, `selectHomeJourneys`/`markSecondaryByDestination`/`journeyMark`/`resolveRelevance`를 실제 UI에 연결.
6. **검증** — 단일목적지 무변경 / 같은 목적지 2개 / case_history / 30개국 / PDF / share-link.
7. **프로덕션** — **사용자 최종 승인 후** `pnpm db:push` (Seoul). 로컬→(staging)→prod.

---

## 4. 위험·검증 포인트

- **단일 목적지 = 무변경 게이트**가 핵심 안전망. 마이그레이션·코드 모두 "다중 목적지일 때만" 새 경로, 단일은 기존 그대로.
- **legacy fallback**으로 점진 전환(빅뱅 아님).
- `procedure-checks` 30개국 reader가 다수 → 인자 전환 후 검증 필수.
- `?dest=` → `?journey=` URL 전환 시 **기존 공유 링크 호환**(토큰 폴백).
- 일본 override(entry_date fallback) + 다중 목적지 flatten 의 상호작용 집중 검증.

---

## 5. 미해결 (구현 시 확정)

- `trip_type` 최종 위치 — `journeys[].tripType`(권장) vs `trip_type[여정ID]` 유지.
- URL `?dest=일본` → `?journey=<id>` 전환 방식(표시는 토큰, 내부는 ID) 또는 둘 다.
- co_progress(형제 동기화)는 목적지 무관이라 영향 없음 — 재확인만.
