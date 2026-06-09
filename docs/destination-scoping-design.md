# 목적지별 절차 데이터 통일 (Destination Scoping) — 설계

> **이 문서가 단일 출처(single source of truth)다.** 새 세션은 이 문서로 진입한다.
> 진행 상황은 **§6 체크리스트**에 있다 — 매 단계 끝낼 때마다 체크리스트를 갱신할 것.
> (메모리 `project_journey_lifecycle_impl` 는 이 문서를 가리키는 포인터일 뿐.)

작성: 2026-06-09. 모태: [journey-lifecycle-design.md](journey-lifecycle-design.md) "② 새 목적지 등록 시 리셋" 검증 중 발견한 누수 버그.

---

## 1. 배경 — 버그와 근본 원인

**증상**: 다중 목적지(예: 일본 + 호주)에서 한 나라 검역을 완료하면 **다른 나라까지 완료로** 떠버린다. 그래서 새 목적지를 추가해도 리셋이 안 되고, 빈 목적지에 "잘 마치셨나요?" 완료 prompt 가 오발동한다.

**근본 원인**: 데이터 저장이 **"단일 목적지 = top-level / 다중 목적지 = `data.by_dest[목적지]`"** 라는 **이중 구조**다.
- 단일(일본)일 땐 일본 검역을 `data.kr_import_quarantine_confirmed` 처럼 맨 위(top-level)에 저장.
- 호주를 추가해 다중이 되면 — 일본 값이 **맨 위에 그대로 남고**, 호주는 자기 칸(`by_dest[호주]`)이 비어서 → **맨 위(일본) 값을 fallback 으로 읽는다** = 누수.
- 게다가 검역 키들은 애초에 `DESTINATION_SCOPED_FIELD_KEYS`(목적지별 저장 목록)에서 **빠져 있었다**(공용 취급).

설계 의도는 "모든 절차는 목적지별"인데 구현이 이중 구조 + 검역 누락으로 어긋났다.

---

## 2. 결정 — B안 (단일도 무조건 by_dest 통일)

| 안 | 내용 | 평가 |
|---|---|---|
| **A** | 이중 구조 유지 + 단일→다중 **전환 시 top-level→by_dest 이동** | ❌ 전환 진입점(추가·제거·admin·재입력)마다 이동을 지켜야 함 → 하나라도 빠지면 또 누수 = 땜질 연장 |
| **B** | **단일이든 다중이든 무조건 `by_dest`** (top-level 안 씀) | ✅ 채택 — 맨 위(누수 원천) 자체가 사라짐. 전환 이동 불필요. 예외 없음 |

**B 채택 이유**: 이중 구조가 누수의 원천. B는 그 구조를 제거해 근본을 잡는다. (A는 비용은 작지만 구조적 위험이 남는다.)

---

## 3. 데이터 모델 — 공용 vs 목적지별

| 공용 (동물 몸 상태 — 목적지 무관, top-level 유지) | 목적지별 (`by_dest` — 출입국/여정 종속) |
|---|---|
| 마이크로칩 | 출국일·항공권(출국/귀국) |
| 백신 전부 (광견병·종합·독감·구충 등) | 검역 (한국 수출·도착국 수입·귀국) |
| 항체검사 (titer) | 증명서·허가·도착지 주소 |
| 전염병검사 | 임상검사 내원일 (`vet_visit_date` — 출국 N일 전이라 출국마다) |

- 공용 = `DESTINATION_SCOPED_FIELD_KEYS` 에 **없는** 키. 그대로 둔다.
- 목적지별 = `DESTINATION_SCOPED_FIELD_KEYS` (현재 32개: 일정2·출국항공7·귀국5·증명3·시간1·주소1·검역11+예약). 전부 `by_dest`.

✅ **임상검사 내원일(`vet_visit_date`) = 목적지별 확정 (2026-06-09, 사용자)** — 출국 직전(출국 N일 전)에 받는 거라 출국마다 다름. 새 목적지면 리셋. (항체·전염병 '검사'와 달리 출입국 종속.)

---

## 4. 영향 범위 (Explore 조사 결과)

### 저장 — 게이트(`isMulti`) 제거 대상
- `apps/admin/lib/actions/cases.ts:107-109` `updateCaseField`: `useByDest = !!destination && isDestinationScopedKey(key) && isMultiDest` → **`&& isMultiDest` 제거**.
- `apps/portal/lib/actions/cases.ts`: `updateFlightFields`(~746)·`updateVetVisitDate`(~1019)·`applyQuarantine`(~1098) 의 `isMulti` 분기 → 단일도 by_dest.
- `apps/portal/lib/actions/share-links.ts:~414` `useByDest` 의 `isMulti` 제거.

### 읽기 — 이미 안전 (수정 거의 없음)
- `flattenCaseForDestination` / `readByDestValue` / `getDepartureDate` / `getVetVisitDate` 가 **by_dest 우선 + top-level/컬럼 fallback**. 마이그 전에도 fallback 으로 동작.
- portal 일정 탭(`scenario.ts:208 activeDestinationView`)·step-detail 은 flatten 거쳐 자동 by_dest.

### 마이그레이션 — 단일 케이스 전체
- 기존 **단일 목적지 케이스**(대부분)의 top-level 32키 → `data.by_dest[유일목적지]` 로 이전.
- `cases.departure_date` **컬럼**은 유지 + by_dest 우선 읽기(폐기 X — 호환·필터·auto-fill).
- 기존 다중 케이스의 top-level 잔존은 null sentinel 로 정리.

### procedure-checks — destination 전달 (P1)
- `packages/domain/src/procedure-checks/*.ts` 는 flatten 안 거치고 caseRow 직접 → 호출부에서 activeDest 를 항상 전달하도록 확인.

### 안전 (수정 불필요)
- PDF(`generate-pdf.ts` flatten 자동)·auto-fill·admin/portal 표시.

---

## 5. 구현 단계 (순서 중요)

1. **저장 통일** — 위 저장 경로들에서 `isMulti` 게이트 제거(단일도 by_dest). 회귀 없음(읽기 fallback).
2. **마이그레이션** — 단일 케이스 top-level 32키 → by_dest. **prod write 권한 필요. dry-run → 확인 → apply.**
3. **procedure-checks** — destination 항상 전달.
4. **검증** — 다중 검역 누수 차단 확인 + PDF·auto-fill·표시 회귀 없음.

> ⚠️ **1과 2는 같이 배포**해야 한다. 저장만 먼저 가면 기존 top-level 잔존이 남아 단일→다중 전환 누수가 그대로다. (마이그가 top-level 을 비워야 fallback 이 안전)

---

## 6. 진행 체크리스트 (매 단계 갱신 — 새 세션은 여기를 본다)

- [x] 검역 키 `DESTINATION_SCOPED_FIELD_KEYS` 등록 (커밋 `ba70ab0`)
- [x] portal 검역 저장 4함수 by_dest (`updateKr/JpXxxQuarantineDate` + `applyQuarantine`) (커밋 `ba70ab0`)
- [x] step-detail 검역 저장 호출 activeDest + 저장 후 flatten read (커밋 `ba70ab0`)
- [x] **vet_visit_date = 목적지별 확정** (2026-06-09, 출국마다 새로) — d31d771 의 vet_visit 유지 예외 제거(완료 내림 시 함께 비움)
- [ ] 저장 게이트 제거 — admin `updateCaseField` (isMultiDest 제거)
- [ ] 저장 게이트 제거 — portal `updateFlightFields` / `updateVetVisitDate` / `applyQuarantine`
- [ ] 예약 by_dest — `updateJpExportQuarantineFields`(application_date/date/time) + 호출 step-detail:784
- [ ] 저장 게이트 제거 — `share-links.ts`
- [ ] 마이그레이션 스크립트 (단일 케이스 top-level → by_dest, dry-run)
- [ ] procedure-checks destination 전달 확인/수정
- [ ] 검증 (다중 검역 누수 차단 + PDF·auto-fill·표시 회귀)
- [ ] 임시패치 정리 — `cf46c2e`(완료 시 검역 비움)·`d31d771`(완료 시 scoped 비움)는 B 완료 후 불필요 → 단순화

---

## 7. 주의사항

- **prod 마이그는 거의 모든 케이스(단일이 대부분)** 를 건드린다 — 가장 신중. 반드시 dry-run 먼저, 백업/검증 후 apply.
- 임시패치 `cf46c2e`·`d31d771` 은 B 전까지 누수를 막는 방어막. B 마이그 완료 후 제거/단순화 가능.
- 검역 1차(`ba70ab0`)는 B의 일부를 이미 했다(검역 키 등록 + portal 검역 저장 by_dest). 체크리스트가 그 위에서 이어진다.

## 8. 관련 문서

- [journey-lifecycle-design.md](journey-lifecycle-design.md) — 여정 생애주기(완료→지난 여정). 이 버그의 모태. B 완료 후 남은 작업: 의료기록 관련성 · prompt B형.
- 메모리 `project_journey_lifecycle_impl` — 포인터.
