# 펫무브 여정(Journey) 도메인 설계

> portal `/cases/[id]/journey` 의 데이터 모델 단일 출처. 작성 2026-05-12.
>
> portal-plan.md §6 "타임라인 뷰" 의 구체화. 코드 위치: `packages/domain/src/journey-steps/`.

---

## 1. 문제

기존 [`apps/portal/lib/journey/scenario.ts`](../apps/portal/lib/journey/scenario.ts) 는 8단계를 **하드코딩**한다. 실제 절차는:

- **목적지마다 다름** — 일본은 항체검사+180일 대기, 영국·아일랜드 등 6국은 출국 직전 촌충약, 호주는 검역 10일+그룹 분류, 동남아 일부는 항체검사 한국 귀국 시만 필요…
- **종마다 다름** — 호주의 일부 검사는 강아지만, EU 의 일부 룰은 고양이 면제
- **편도/왕복마다 다름** — 한국 귀국용 광견병 항체검사가 왕복일 때만 의미 있는 국가 (USA, 태국, 필리핀 등 — `rabiesTiterForReturnOnly` 플래그로 이미 표시)

또 portal-plan §8 의 UX 톤("상태 중심, 진행감") 과 사용자가 새로 요청한 3가지:

1. 절차 목록이 케이스 컨텍스트(목적지·종·trip)에 따라 달라져야 함
2. **각 절차를 열어 설명 + 진행 정보 입력 + 첨부 저장**
3. **검증 규칙으로 문제 시 경고** — 기존 `procedure-checks/` 인프라(8 country, 60+ rule) 를 portal UI 에 연결

---

## 2. 핵심 컨셉

### "Step (절차)" 단위로 모든 것을 모델링

```
Step
 ├─ 식별자·메타 (id, title, description, category)
 ├─ 적용 조건 (destinations × species × tripType)
 ├─ 시점 (order, deadline anchor)
 ├─ 완료 판정 (doneSignal — caseRow 의 어떤 키가 채워지면 done)
 ├─ 입력 스키마 (어떤 필드를 어디(case.data 의 어느 키)에 저장하는지)
 ├─ 첨부 정책 (allowed yes/no + 안내)
 └─ 검증 룰 ID (procedure-checks 의 id 들 — 결과는 step 카드에 배지)
```

### 적용 조건 매트릭스

| 차원 | 값 | 출처 |
|---|---|---|
| destination | `'all'` 또는 destination-config 의 키 배열 (`['eu', 'uk', 'australia', ...]`) | `case.destination` → `getDestinationOverride` |
| species | `'all'` / `'dog'` / `'cat'` | `case.data.species` |
| tripType | `'all'` / `'round'` / `'one_way'` | `case.data.trip_type[<dest token>]` (목적지별 — 이미 `getTripType` 헬퍼 있음) |

세 조건을 **AND** 로 결합. 한 조건이라도 `'all'` 이면 패스.

### 완료 판정 (doneSignal)

도메인 로직을 step 정의 안에 인라인하지 않고 **시그널 이름**으로만 표시:

- `'microchip-set'` — `caseRow.microchip` 비어있지 않음
- `'has-rabies-entry'` — `data.rabies_dates` 에 1건 이상
- `'has-titer-entry'` — `data.rabies_titer_records` 에 1건 이상
- `'has-vet-visit'` — `data.vet_visit_date` 채워짐
- `'departure-past'` — `departure_date` 가 오늘보다 과거
- `'manual-flag:<key>'` — `data.journey_flags.<key>` 가 true (사용자가 "완료했어요" 체크)
- ... 시그널 resolver 는 `journey-steps/done-resolver.ts` 한 곳에서만.

이렇게 분리해두면 admin 쪽 진행 상황 마일스톤이 cases.data 에 새 키로 들어와도 시그널만 추가하면 됨.

---

## 3. 카탈로그 구조

```
packages/domain/src/journey-steps/
  types.ts          — StepDefinition, StepInputField, StepDoneSignal
  catalog.ts        — 모든 step 정의 (대국가 공통 + 국가별)
  applicability.ts  — getStepsForCase(caseRow) 필터링
  done-resolver.ts  — doneSignal → boolean
  check-mapping.ts  — stepId ↔ procedure-checks.id 연결
  index.ts          — re-export
```

### 카탈로그 시드 (MVP — 13 steps)

| id | category | 적용 | 비고 |
|---|---|---|---|
| `intake` | preparation | all | 케이스 접수 (자동 done) |
| `microchip` | preparation | all | ISO 11784/11785 |
| `rabies-vaccine` | vaccination | all | 1·2차 |
| `rabies-titer` | lab | EU/UK/AU/NZ/JP/MY/CN/TW/CH + round-trip 일부 | 가장 복잡한 단계 |
| `flight-purchase` | logistics | JP | 항체검사 후 — 입국 가능 시기 확정 시 항공권 구매 (manual flag) |
| `tapeworm-deworm` | preparation | UK·IE·MT·NO·FI (EU Reg 2018/772) | 출국 24-120h |
| `general-vaccine` | vaccination | AU/NZ/TH/MY/SG/RU/IN/UAE/HK/GU/PH/RU | DHPP/FVRCP |
| `civ-vaccine` | vaccination | AU/NZ/IN | 강아지만 (dog) |
| `infectious-disease-test` | lab | AU/NZ | Leishmania/Brucella/Leptospira |
| `external-parasite` | preparation | AU/NZ/UK/IE/MT/NO/FI + 다수 | |
| `internal-parasite` | preparation | EU 6국·기타 | 촌충약과 별개 |
| `import-permit` | permit | AU/NZ/TW/MY | 사전 신청 |
| `vet-visit` | document | all | 출국 N일 이내 |
| `certificate-issue` | document | all | 검역증 발급 |
| `flight-booking` | logistics | all | manual flag |
| `departure` | travel | all | departure_date 도래 |

→ 케이스 destination=일본·trip=round·species=dog 면 적용되는 step 은 약 8개. AU 는 12~13개.

---

## 4. UI 변경

### 라우트

```
/cases/[id]/journey                    ← 기존: TimelineCalm 목록
/cases/[id]/journey/[stepId]           ← 신규: step 상세 + 입력 + 첨부 + 경고
```

### 목록 (TimelineCalm)

- step 리스트 row 를 `<Link href={`/cases/${id}/journey/${stepId}`}>` 로 감싼다.
- 각 row 우측 끝에 **경고 배지** — `runChecksForCase` 결과를 `check-mapping` 으로 stepId 별 그룹화 → 실패한 rule 1건 이상이면 배지.

### 상세 (`[stepId]/page.tsx`)

```
┌─ 헤더: pet name → "광견병 항체검사" (step.title)
├─ 설명 (step.description, markdown)
├─ ⚠ 경고 영역 — 이 step 에 매핑된 검증 결과 중 ok=false 만
├─ 입력 영역 — step.inputFields 순회하며 렌더
│     - 단일 date / text / number / select
│     - date_array (광견병 등 — repeatable)
├─ 첨부 영역 (Phase 2) — Supabase Storage `case-attachments/<caseId>/<stepId>/`
├─ "이 절차를 완료했어요" 토글 (manual-flag step 만)
└─ 저장 버튼 — server action 으로 cases.data 의 해당 키 업데이트
```

상세 페이지는 admin 의 case detail 입력 UI 와 **동일한 필드 의미** 를 쓰되, 모바일 톤(Stone 팔레트 + Fraunces) 으로 다시 그린다. admin 의 컴포넌트를 직접 import 하지 않음 ([apps/portal/CLAUDE.md](../apps/portal/CLAUDE.md) §1).

---

## 5. 검증 규칙 연결

기존 `packages/domain/src/procedure-checks/` 는 `id`(예: `jp.rabies-titer-vs-booster`)·`country`·`severity`·`run` 을 가진 60+ 룰의 카탈로그. 이미 충분하다.

연결 방식:

```ts
// packages/domain/src/journey-steps/check-mapping.ts
export const STEP_CHECK_MAP: Record<string, string[]> = {
  'rabies-vaccine': [
    'jp.rabies-prime-after-91days-old',
    'jp.rabies-prime-booster-interval',
    // 'eu.rabies-...', 'au.rabies-...'  // 나라마다 다른 룰이라도 stepId 가 같음
  ],
  'rabies-titer': [
    'jp.rabies-titer-vs-booster',
    'jp.departure-180days-after-titer',
    'jp.departure-within-2years-of-titer',
    'au.titer-...',
  ],
  // ...
}
```

→ portal 에서 `runChecksForCase(destination, ctx)` 호출 후, 결과를 stepId 별 group_by 해서 `Map<stepId, CheckResult[]>` 로 변환.
→ TimelineCalm 의 step 카드와 상세 페이지가 같은 데이터를 소비.

매핑 누락 시 → "lint" 가 가능: ALL_PROCEDURE_CHECKS 의 모든 id 가 STEP_CHECK_MAP 어딘가에 한 번은 등장해야 한다는 테스트 1개 추가 (Phase 2).

---

## 6. 첨부 파일 (Phase 2)

데이터:

```sql
create table case_step_attachments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  step_id text not null,
  storage_path text not null,        -- supabase storage 객체 경로
  original_filename text,
  mime_type text,
  size_bytes int,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now()
);

create index on case_step_attachments (case_id, step_id);
```

Storage bucket: `case-attachments` (private). RLS = `case_customer_links` 기반. admin 의 org 멤버도 읽기/쓰기 가능.

MVP 에서는 **스키마만 깔지 않는다** — UI/액션 도입 시 같이 작성. 본 설계 문서에 자리만 잡아둠.

---

## 7. 마이그레이션 전략

- **기존 8단계 하드코딩 제거** — `scenario.ts` 의 stages 빌더가 `getStepsForCase` + `resolveDone` 로 교체. data shape 자체(`JourneyStage`)는 유지해 TimelineCalm 무수정 사용.
- 카탈로그가 빈 적용조건 → 디폴트 8단계와 정확히 같은 결과를 내도록 시드를 짠다 (regression-safe).
- 매 step 카탈로그 추가는 별도 커밋 — destination별 룰 추가가 portal 빌드를 깨트리지 않게.

---

## 8. 안 하는 것 (MVP)

- ❌ 한 케이스에 여러 목적지 (다중 destination 토큰) — 첫 토큰만. 추후 case-switcher 처럼 destination-switcher 추가 가능.
- ❌ 보호자가 step 순서/내용 커스터마이즈
- ❌ admin 의 자동 워크플로(시그널 트리거 알림 등)와 양방향 동기화 — admin 이 cases.data 를 write 하면 portal 은 read 만.
- ❌ i18n — ko 만. step description 의 ko 텍스트는 한국 보호자 기준.

---

## 9. 다음 한 걸음

이 문서 합의 후:

1. ✅ `packages/domain/src/journey-steps/` 골격 — types + 시드 catalog + applicability + done-resolver + check-mapping (이 PR)
2. ⏳ `apps/portal/lib/journey/scenario.ts` 를 catalog 기반으로 리팩토링 (이 PR)
3. ⏳ `apps/portal/app/(authed)/cases/[id]/journey/[stepId]/page.tsx` 스켈레톤 (이 PR — 입력 폼은 placeholder)
4. ⏳ TimelineCalm 의 step row 를 `<Link>` 로 (이 PR)
5. 검증 결과 배지 (다음 PR)
6. 입력 폼 실제 동작 (다음 PR — date/date_array/text 위주)
7. 첨부 파일 (별도 PR — 마이그레이션 + Storage + UI)
