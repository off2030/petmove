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

### 4.A 읽기 가드 — 컬럼/top-level 잔존 누수 (문서 초안이 놓친 부분)
초안 §4는 "읽기 이미 안전"이라 했으나, **departure_date 컬럼을 유지(필터·정렬·auto-fill)**하기로 한 탓에
컬럼이 누수 벡터가 된다 — 빈/엔트리없는 목적지가 컬럼 fallback 으로 다른 목적지 출국일을 물려받음.
그래서 읽기 측에 가드:
- **다중 목적지 + 특정 목적지 지정** → by_dest 만 신뢰. 컬럼/top-level fallback **안 함**. ⚠️ **엔트리 유무
  무관** — 처음엔 "엔트리 있을 때만"(hasByDestEntry)으로 했다가, 검증 spot-check 에서 by_dest 엔트리가
  아예 없는 다중 목적지(예: admin destination-field 로만 추가된 `중국`)가 컬럼을 그대로 물려받는 누수를
  발견해 **multi 단독 가드**로 정정함(hasByDestEntry 제거).
- **단일** → 기존 fallback 유지(누수 상대 없음 + 마이그 전 호환).
- 적용: `flattenCaseForDestination`(다중 strict — 엔트리 없어도 빈값 처리)·`getDepartureDate`·`getVetVisitDate`·
  `readCaseField`·todos `importReportReturnDate`·auto-fill `readScalarDate`(트리거 누수 차단).
- `readEffectiveExtraValue` 는 시그니처에 목적지 카운트가 없어 미적용 — 마이그가 top-level 을 비워 안전
  (legacy country_extra 경로의 다중 edge 만 잔존, 좁고 기존부터 있던 것).

### 4.B 공용 부수효과 패리티 — 단일이 by_dest 경로로 와도 종전과 동일하게
단일 케이스가 by_dest 분기로 오면 종전 top-level 분기가 하던 **공용(단일값) 부수효과**가 빠진다.
원칙: **단일은 종전과 동일(데이터 위치만 by_dest), 다중은 종전 유지**(`isSingleDest` 가드).
- admin `updateCaseField`: 출국일 컬럼 sync + 내원가능일(출국-9) + 서류/신고 상태 리셋.
- portal `updateFlightFields`: flight_info_recorded_at + 출국일 컬럼 + `applyAutoFillRules(…, destination)`.
- portal `updateVetVisitDate`: vet_visit_confirmed 클리어.

### 안전 (수정 불필요)
- PDF(`generate-pdf.ts` flatten 자동)·auto-fill·admin/portal 표시.
- `addCaseDestination` 전환 처리: 읽기 가드(4.A)가 컬럼 누수를 막으므로 추가 컬럼-clear 불필요.

---

## 5. 구현 단계 (순서 중요)

1. **저장 통일** — 위 저장 경로들에서 `isMulti` 게이트 제거(단일도 by_dest). 회귀 없음(읽기 fallback).
2. **마이그레이션** — 단일 케이스 top-level 32키 → by_dest. **prod write 권한 필요. dry-run → 확인 → apply.**
3. **procedure-checks** — destination 항상 전달.
4. **검증** — 다중 검역 누수 차단 확인 + PDF·auto-fill·표시 회귀 없음.

> ⚠️ **1과 2는 같이 배포**해야 한다. 저장만 먼저 가면 기존 top-level 잔존이 남아 단일→다중 전환 누수가 그대로다. (마이그가 top-level 을 비워야 fallback 이 안전)

---

## 6. 진행 체크리스트 (매 단계 갱신 — 새 세션은 여기를 본다)

> **B 확정 (2026-06-09, 사용자).** 조사 중 B의 실제 범위가 문서 §4 초안보다 큼이 드러남:
> 게이트가 1곳이 아니라 **3곳**(화면·서버·auto-fill 엔진) + **공용 부수효과 패리티** +
> **읽기 가드**(컬럼/top-level 잔존 누수 차단) + 전체 마이그. 아래 §4.A/§4.B 참고.

**쓰기 — 게이트 제거 + 단일 패리티 (배포 완료 대상):**
- [x] 검역 키 `DESTINATION_SCOPED_FIELD_KEYS` 등록 (커밋 `ba70ab0`)
- [x] portal 검역 저장 4함수 by_dest + step-detail activeDest (커밋 `ba70ab0`)
- [x] **vet_visit_date = 목적지별 확정** (2026-06-09) — d31d771 vet_visit 유지 예외 제거
- [x] auto-fill 엔진 게이트 제거 (`effectiveActiveDest = activeDest ?? null`)
- [x] admin `updateCaseField` 게이트 제거 + **단일 패리티**(출국일 컬럼 sync·내원가능일·서류/신고 상태 리셋)
- [x] admin 화면 게이트 제거 — `editable-field`·`case-detail` (resolveActiveDestination)
- [x] portal `updateVetVisitDate`(+vet_visit_confirmed 클리어)·`updateFlightFields`(+flight_info·컬럼·auto-fill 패리티)·`applyQuarantine`
- [x] 예약 by_dest — `updateJpExportQuarantineFields`(+destination 인자) + step-detail activeDest 전달
- [x] `share-links.ts` 게이트 제거 (scope 미지정 시 단일 유일 토큰으로 resolve)

**읽기 — 다중 목적지 누수 가드 (컬럼·top-level 잔존):**
- [x] `flattenCaseForDestination` 다중 분기 strict(destObj 만 신뢰)
- [x] `getDepartureDate`·`getVetVisitDate`·`readCaseField`·todos `importReportReturnDate` 다중 가드
- [x] procedure-checks destination 전달 — 확인 완료(admin `viewDestination`=활성/유일 토큰, portal=flatten). 변경 불필요.

**마이그 / 검증 / 정리:**
- [x] 마이그레이션 스크립트 — `scripts/migrate-by-dest-unify.mjs` (dry-run 기본, `--apply`, pre-image 백업)
- [x] **마이그 적용 완료** (2026-06-09) — 1949 중 159건(단일 146/다중 13) top-level→by_dest, 실패 0,
  pre-image 백업 `scripts/backup-bydest-*.json`(gitignore). 멱등 재실행 0건 확인.
- [x] 검증 spot-check — `scripts/verify-bydest-spotcheck.mjs`. 단일 정상(top-level 비움·by_dest·컬럼 유지).
  **다중 entry-less 누수 발견→가드 정정**(§4.A). 잔존: 일부 다중 케이스 by_dest 중복 데이터(마이그 전부터, 코드 무관).
- [ ] 배포 후 실사용 검증 (다중 케이스 표시·PDF·auto-fill 회귀 — 코드 2차 배포 후)
- [x] 임시패치 정리 — **검토 완료(2026-06-09): 제거 X**. `cf46c2e`·`d31d771` = addCaseDestination
  demoted-block 한 곳. 검토 결과 임시 아님·영구 필수: ① 출국일 컬럼 null + ② arrival_confirmed 정리는
  **demote→단일 결과** 케이스에 필수(단일은 읽기 가드 미적용 → 컬럼 fallback 살아있음), ③ top-level scoped
  clear 는 정상 no-op이나 scope 없는 다중 share-link 엣지 방어. "임시/by_dest 분리 전"이라던 오해성 주석만 정정.

---

## 7. 주의사항

- **prod 마이그는 거의 모든 케이스(단일이 대부분)** 를 건드린다 — 가장 신중. 반드시 dry-run 먼저, 백업/검증 후 apply.
- `cf46c2e`·`d31d771`(= addCaseDestination demoted-block)은 검토 결과 **임시 아닌 영구 필수 로직**으로
  확정(2026-06-09) — §6 마지막 항목 참고. 제거하지 말 것(특히 컬럼 null·arrival_confirmed). 주석만 정정함.
- 검역 1차(`ba70ab0`)는 B의 일부를 이미 했다(검역 키 등록 + portal 검역 저장 by_dest). 체크리스트가 그 위에서 이어진다.

## 8. 관련 문서

- [journey-lifecycle-design.md](journey-lifecycle-design.md) — 여정 생애주기(완료→지난 여정). 이 버그의 모태. B 완료 후 남은 작업: 의료기록 관련성 · prompt B형.
- 메모리 `project_journey_lifecycle_impl` — 포인터.
