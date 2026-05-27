# 다중 목적지 + 일본 출국 항공편 — 후속 작업

2026-05-27 작업 완료 + 후속 정리. 다른 컴퓨터·세션에서 이어 작업할 때 참고.

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

## 적용 필요 마이그레이션 (다른 컴퓨터에서 prod 반영 시)

```bash
pnpm db:push
```

세 개 마이그레이션:
- `20260527000001_backfill_by_dest_scoped_fields.sql` — 다중 목적지 케이스의 top-level 값을 by_dest 로 복제
- `20260527000002_backfill_by_dest_address_overseas.sql` — address_overseas 만 추가 백필
- `20260527000003_seed_japan_departure_sync_rules.sql` — legacy 룰 비활성 + 신규 양방향 룰 시드

## 후속 작업 (TODO)

### 우선순위 1 — 일본 항공권 흐름 완결

- **AI 추출 확장** ([apps/admin/lib/actions/extract-extra.ts](../apps/admin/lib/actions/extract-extra.ts))
  - 현재 `JapanResult.inbound.date` (= entry_date) 추출 중
  - 일본 미사용 키라 일본 항공권 OCR 결과가 손실됨
  - schema 에 `departure_flight_date` / `departure_flight_time` 추출 추가, 일본 매핑 변경
  - 보호자가 매직링크로 항공권 사진 올리면 두 키에 자동 채움

- **출발시간 입력 UI** ([apps/admin/components/cases/japan-extra-field.tsx](../apps/admin/components/cases/japan-extra-field.tsx))
  - 현재 `FLIGHT_FIELDS` 가 [date·항공편명·출발공항·도착공항·운송방법] 5개
  - `departure_flight_time` 추가 시 FLIGHT_FIELDS 확장 + FlightEntry 타입에 time 필드 추가
  - 또는 EXTRA_FIELD_DEFS 자동 노출 메커니즘으로 처리 가능한지 확인 (이미 group 안에 있으니 동작할 수도)

### 우선순위 2 — 다른 destination 정리

- **시차 큰 노선의 `entry_date → departure_date` legacy sync** ([apps/portal/lib/actions/share-links.ts](../apps/portal/lib/actions/share-links.ts) 350-360 부근)
  - 현재 portal `submitShareLink` 에 hardcode: `if (dataUpdate.entry_date) colUpdate.departure_date = ...`
  - 스위스·태국·미국·하와이는 시차로 출국일과 도착일이 다른 날일 수 있음
  - 잘못된 sync 위험 — 각 destination 별로 출국·도착 같은 날 가정 안전한지 검토 + 다른 날인 destination 은 sync 분기 제거
  - 또는 destination 별 사용자 룰 등록 + share-link 도 룰 trigger (아래 항목과 연계)

- **portal share-link 의 auto-fill 룰 통합** ([apps/portal/lib/actions/share-links.ts](../apps/portal/lib/actions/share-links.ts))
  - 현재 portal 은 admin 의 `applyAutoFillRules` 직접 호출 못 함 (`apps/admin/lib/...` import 금지)
  - 옵션 A: `applyAutoFillRules` 를 `packages/auto-fill/` 또는 `packages/domain/` 공유 패키지로 이전
  - 옵션 B: portal 자체 구현 (코드 중복)
  - A 권장 — 양쪽 흐름이 같은 룰 시스템 거치게

### 우선순위 3 — 다중 목적지 후속

- **top-level scoped 값 정리 마이그레이션**
  - 현재 by_dest 가 채워졌어도 top-level 데이터는 보존 (fallback). 시간 지나면 stale.
  - by_dest 가 모든 destination 에 채워진 케이스의 top-level 값 삭제 안전성 검증 후 마이그
  - 검증·PDF·auto-fill·share-link 모두 by_dest 우선 + null sentinel 인식 확인 필수

- **fetchSiblings (Annex/UK/NZ/VBC pack PDF)**
  - 현재 `cases.departure_date` 컬럼 비교로 sibling 매칭
  - 다중 목적지 케이스 + by_dest 의 출국일 분리 시 sibling 누락 가능
  - 활성 목적지 인지하도록 보강

### 우선순위 4 — destination 별 entry_date 의미 검토

- **다른 destination 에서 entry_date 의 의미 명확화**
  - 스위스·태국·미국·하와이: 도착일. 시차 있으면 출국일과 다른 날
  - 라벨이 "도착일" 인데 매직링크에서 "출국일" 입력하라는 폼인지 확인 필요
  - case-detail 그룹 라벨 vs share-link 수신자 폼 톤 일관성 점검

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
