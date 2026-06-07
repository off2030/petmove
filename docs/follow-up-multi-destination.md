# 다중 목적지 + 일본 출국 항공편 — 후속 작업

2026-05-27 작업 완료 + 후속 정리. 다른 컴퓨터·세션에서 이어 작업할 때 참고.

> 여정의 **완료·지난 여정·다중 여정(같은 목적지 2개)·관련성·표식** 생애주기 설계는 [journey-lifecycle-design.md](journey-lifecycle-design.md) 참조. (이 문서의 `by_dest` 가 그 토대.)

## 마무리된 작업 (master)

| 커밋 | 내용 |
|---|---|
| [04b6825] | by_dest 도입 — 도메인 헬퍼·EditableField·case-detail UI read/write |
| [0c16267] | null sentinel — X 비우기 fallback 부활 차단 |
| [5f22f16] | by_dest 인지 보강 — procedure-checks·PDF·auto-fill·share-link·백필 마이그 |
| [c5558ee] | 알림 발동 게이트 (system-notifications) |
| [6d5e3fc] | 필리핀 `entry_airport` 라벨 "도착공항 / 목적지" |
| [4f644e8] | 사전신고 허가증 row — 일본 활성일 때만 + 추가정보 row 통합 |
| [058fc07] | 허가증 라벨·문구 간소화 |
| [3f690c2] | 허가증 row 행 높이 정렬 |
| [2e697c3] | 허가증 row 드래그앤드롭·붙여넣기 |
| [941e86a] | drop 후 ring 안 꺼지던 문제 (onTakeoverDrag 콜백) |
| [7aa9682] | `address_overseas` 도 destination별 분리 + 백필 마이그 |
| [f1f3e11] | 메모 입력 [저장]·[📎] 버튼 높이·정렬 |
| [3185985] | 일본 entry_date 제거 — 일본 procedure-check 의 entry_date 참조 readDepartureDate 로 |
| [d73c2a8] | 일본 `departure_flight_date` / `departure_flight_time` 신설 |
| [e554a88] | 일본 출발일↔출국일 sync hardcode → org_auto_fill_rules 시드. done-resolver 보강 |
| [6a00722] | 일본 항공권 OCR 에 출발시간 추출 + 매핑 수정 (`inbound.{date,time}` → `departure_flight_{date,time}`) |

## 적용 필요 마이그레이션 (다른 컴퓨터에서 prod 반영 시)

```bash
pnpm db:push
```

세 개 마이그레이션:
- `20260527000001_backfill_by_dest_scoped_fields.sql` — 다중 목적지 케이스의 top-level 값을 by_dest 로 복제
- `20260527000002_backfill_by_dest_address_overseas.sql` — address_overseas 만 추가 백필
- `20260527000003_seed_japan_departure_sync_rules.sql` — legacy 룰 비활성 + 신규 양방향 룰 시드

## 후속 작업 (TODO)

### ~~우선순위 1 — 일본 항공권 흐름 완결~~ (완료 — 6a00722)

- ~~**AI 추출 확장**~~ — `FlightEntry` 에 `time` 추가, Japan prompt 가 inbound flight 의 24h 출발시간 추출. `mapExtractResultToUnified` 가 `inbound.{date,time}` → `departure_flight_{date,time}` 로 매핑 (entry_date 제거).
- ~~**출발시간 입력 UI**~~ — `JapanExtraField` 는 dead code 였고 (case-detail 에서 안 부름), 실제 렌더는 `SimpleExtraSection` 이 `EXTRA_FIELD_DEFS` + destination-config 의 `extraFields` 자동 노출로 처리. `departure_flight_time` 은 이미 `'출국 항공편'` group 에 등록돼 있어 자동 표시됨.
- LEGACY_EXTRA_PATHS: `entry_date` 에서 `japan_extra.inbound.date` 제거, `departure_flight_date/time` fallback 으로 옮김 (옛 케이스도 새 키로 읽힘).

### ~~우선순위 2 — 다른 destination 정리~~ (완료)

- ~~**시차 큰 노선의 `entry_date → departure_date` legacy sync**~~ — [4672ac9]. portal `submitShareLink` 의 hardcode `entry_date → departure_date` 단방향 sync 제거. 시차 큰 destination 의 잘못된 sync 위험 차단. 일본의 `departure_flight_date ↔ departure_date` 양방향 sync 는 유지 (auto-fill rule + hardcode 부족분).
- ~~**portal share-link 의 auto-fill 룰 통합**~~ — [1b49f99]. `applyAutoFillRules` 를 `apps/admin/lib/auto-fill-engine.ts` → `packages/domain/src/auto-fill-engine.ts` 로 이전. portal `submitShareLink` 가 case update 직후 룰 trigger. admin/portal 단일 룰 시스템.

### ~~우선순위 3 — 다중 목적지 후속~~ (부분 완료)

- ~~**fetchSiblings (Annex/UK/NZ/VBC pack PDF)**~~ — [407ac06]. `fetchSiblings(caseId, activeDestination?)` 시그니처 확장. `getDepartureDate`/`getVetVisitDate` 헬퍼로 활성 목적지의 by_dest 우선 비교. `previewSiblings`·`generateAQS`·`multi-form-dialog`·`cases-app` 모두 destination 전달.

- **top-level scoped 값 정리 마이그레이션** (검증 후 진행)
  - 현재 by_dest 가 채워졌어도 top-level 데이터는 보존 (fallback). 시간 지나면 stale.
  - 안전성 조건: by_dest 가 모든 destination 에 채워진 케이스만 대상 + destination 미지정 read 경로 audit 필요 (`readEffectiveExtraValue(data, key)` 같은 호출자가 multi-dest 케이스를 어떻게 다루는지).
  - 검증·PDF·auto-fill·share-link 모두 by_dest 우선 + null sentinel 인식 확인 필수.

### ~~우선순위 4 — destination 별 entry_date 의미 검토~~ (완료)

- **portal `updateFlightFields` 도 auto-fill 룰 trigger** — [54b2125]. 일본 케이스에서 보호자가 journey 항공권 step 에 입력한 날짜가 `entry_date` + `departure_date` 컬럼에만 들어가고 `departure_flight_date` 는 빈 상태로 남던 문제 수정. update 후 `applyAutoFillRules(supabase, caseId, 'departure_date')` 호출 → 일본 sync 룰 fire.
- **라벨 일관성 결론**: portal `flight-inputs.tsx` 가 "출국 항공권 → 날짜" 라벨로 보호자에게 노출. 코드는 entry_date 키에 저장하지만 동시에 `departure_date` 컬럼에 sync 되므로 procedure-checks 가 `readDepartureDate` 로 정확히 읽음. 라벨 자체는 보호자 시점에 직관적이라(보호자는 "내가 출국하는 날") 변경하지 않고 sync 보강만 진행.
- 시차 큰 destination (스위스·태국·미국·하와이) 의 entry_date 의미 불일치는 향후 destination 별 다른 입력 UX 가 필요할 때 다시 검토 (현재는 `entry_date == 한국 출발일` 로 일관 사용).

## 메모리·문서 동기화

이 문서를 master 에 두고 있으니 다른 컴퓨터에서 `git pull` 후 바로 확인 가능.

추가 참고:
- [docs/saas-migration.md](saas-migration.md) — 전체 SaaS 전환 로드맵
- 메모리 `~/.claude/projects/C--dev-petmove/memory/project_destination_scoped_fields.md` — 분리 정책 단일 출처

## 운영 주의 (배포 직후 1주)

- 다중 목적지 케이스의 destination 칩 전환 시 각 필드 값이 정확히 분리되는지 확인
  - 특히: `departure_date`, `vet_visit_date`, `entry_*`, `return_*`, `permit_no`, `address_overseas`, `deworming_time`
- 일본 케이스에서 항공권 출발일·출국일 양방향 sync 동작 확인 (룰 적용 후)
- 사전신고 허가증 row 가 일본 활성에서만 노출되는지

[04b6825]: https://github.com/off2030/petmove/commit/04b6825
[0c16267]: https://github.com/off2030/petmove/commit/0c16267
[5f22f16]: https://github.com/off2030/petmove/commit/5f22f16
[c5558ee]: https://github.com/off2030/petmove/commit/c5558ee
[6d5e3fc]: https://github.com/off2030/petmove/commit/6d5e3fc
[4f644e8]: https://github.com/off2030/petmove/commit/4f644e8
[058fc07]: https://github.com/off2030/petmove/commit/058fc07
[3f690c2]: https://github.com/off2030/petmove/commit/3f690c2
[2e697c3]: https://github.com/off2030/petmove/commit/2e697c3
[941e86a]: https://github.com/off2030/petmove/commit/941e86a
[7aa9682]: https://github.com/off2030/petmove/commit/7aa9682
[f1f3e11]: https://github.com/off2030/petmove/commit/f1f3e11
[3185985]: https://github.com/off2030/petmove/commit/3185985
[d73c2a8]: https://github.com/off2030/petmove/commit/d73c2a8
[e554a88]: https://github.com/off2030/petmove/commit/e554a88
[6a00722]: https://github.com/off2030/petmove/commit/6a00722
[4672ac9]: https://github.com/off2030/petmove/commit/4672ac9
[1b49f99]: https://github.com/off2030/petmove/commit/1b49f99
[407ac06]: https://github.com/off2030/petmove/commit/407ac06
[54b2125]: https://github.com/off2030/petmove/commit/54b2125
