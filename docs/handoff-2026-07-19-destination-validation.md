# 인계 — 목적지 검증 정비 (2026-07-19)

## 지금 바로 할 일 (미완)

**대만 수입허가 신청일에 입력 차단이 없다.** 출국일 이후로 신청일을 넣어도 저장된다.

```
apps/portal/components/journey/step-detail-view.tsx  (약 1088행, `if (isImportPermit)`)
  thailand    → validateImportPermitNotAfterDeparture + 백신 14일 간격  ✓
  philippines → 위 + 60일 유효 + 백신 간격                              ✓
  switzerland → validateChImportPermitDate                             ✓
  taiwan      → 없음                                                   ★
```

실측(출국 2026-12-01):

| 신청일 | 지금 | 있어야 할 것 |
|---|---|---|
| 2026-12-20 (출국 이후) | 주의 1건(120일 룰)만 | **저장 거부** — 논리적 불가능 |
| 2026-11-25 (20일 마감도 지남) | 주의 1건 | 주의는 맞음(회복 불가라 차단은 과함) |

**할 일**: `destinationKey === 'taiwan'` 분기를 추가하고 `validateImportPermitNotAfterDeparture(filed, dep)` 호출.
태국·필리핀과 같은 함수·같은 이유(논리적 불가능)라 새 판단 불필요.

**주의**: 대만은 `import-permit` order 가 **43**(항공권 45 **앞**)이다. 태국·필리핀은 100(항공권 뒤).
대만은 신청에 항공권이 필요 없고 마감이 도착 120일 전으로 훨씬 이르기 때문 —
`destination-overrides.ts` taiwan 블록 주석에 근거 있음.

확인 후: `pnpm lint:behavior:write` 로 스냅샷 갱신 + 커밋·푸시.

---

## 이 세션에서 만든 가드 (앞으로 이걸 먼저 돌릴 것)

```bash
pnpm lint:behavior            # ★ 신설 — 입력불가·주의·안내·알림의 실제 반응
pnpm lint:validation-wiring   # 배선 3단계(남의 나라 룰/검증0개/고아 룰)
pnpm lint:dest                # 구조(카드·서류 구성)
pnpm lint:copy                # 목적지별 문구
pnpm lint:checks              # 고객 노출 경고 문구
node scripts/lint-destination-scoping.mjs
```

### lint:behavior — 왜 만들었나

사용자 지적: *"설명문은 눈으로 확인되는데 **입력불가·주의·안내·알림은 안 보인다**.
제대로 되어있는지 알려면 일일이 물어보거나 데이터를 넣어봐야 한다."*

정해둔 시나리오 7개를 **실제로 태워서** 나오는 걸 기록한다(`scripts/behavior.snapshot.txt`).
룰 id 뿐 아니라 **메시지 본문**도 기록 — 고객이 읽는 건 id 가 아니라 문장이라서.

시나리오 추가: `scripts/lint-behavior.ts` 의 `SCENARIOS` 에 케이스 + **왜 이 케이스인지**.

### lint:validation-wiring 3단계

1. 지목한 룰이 존재하고 **그 나라에 적용되는가**
2. 날짜칸이 있는데 **검증이 0개**인가
3. 그 나라 룰인데 **어느 카드도 지목 안 하는가** (경고가 상단으로 새는 문제)

예외는 **이유와 함께** 등록해야 통과 — `UNVALIDATED_OK`, `ORPHAN_RULE_OK`,
`ADVISORY_SUFFIXES`, `PORTAL_DEFERRED`, `CROSS_CARD_ORDER_RULES`.

---

## 이 세션에서 고친 것 (요약)

**베트남 신규 추가** — 9단계 점검 완료. 카드 10장·서류 4종·룰 12개·사진 10장.
규정 정정 2건: Form 19 는 수입허가가 아니라 **도착 공항 현장 등록**(사전 신고 카드 제거),
최소 일령은 일수가 아니라 **달력 3개월**(11·12·1·2월생 오차단 해소).

**알림 누락 메움** — 중국(수입·수출 0건이었음)·대만 수출·베트남 수입.
`SCOPED_DATE_FIELDS` 를 `done: 'quarantine:<필드>'` **파생**으로 교체 → 새 카드는 자동 등록.

**대만 수입허가 2단계 마감** — 120일(격리 면제) → 20일(진짜 마감). 배지도 자동 전환
(`StepDeadline.fallbackDaysBefore`). 신청 완료 시 알림 중단 기준을 `not_started` 로
통일(대만·태국·필리핀).

**광견병 카드 파생화** — `buildRabiesCard()` 로 대만·베트남·중국 전환. 출력 무변경 확인.
**남은 것: 일본·EU 패밀리·태국·필리핀은 아직 손 문구.**

**메시지 구체화** — 2회 접종국(일본·중국)의 항체 순서 경고를
*"광견병 항체 검사는 2차 접종 후에 받아야 해요"* 로. 세 층 어투 통일.

---

## 반복해서 부딪힌 구조 문제 (다음 세션이 알아야 할 것)

**프로파일 16개 필드 중 7개만 소비처가 있다.** `advanceNotice`·`importQuarantine.quarantineDays`·
`applyDeadlineDays` 등 9개는 선언해도 아무 동작을 안 한다. 그래서 새 목적지마다 카드·룰·
알림·서류를 손으로 쓰게 되고, 매번 뭔가 빠진다.

`destination-config.ts` 주석: *"전부 optional — 아직 소비자 없음. Phase 1-c 에서 하드코딩
목록을 하나씩 파생으로 교체하며 채운다."* — **선언 칸은 팠는데 소비 엔진이 안 만들어졌다.**

이 세션에서 3개를 파생으로 옮겼다(`TITER_RETURN_ONLY_DESTINATIONS`, 알림 명단, 광견병 카드).
같은 방식으로 계속 옮기는 게 근본 해결. 옮길 때마다 **출력 JSON 비교로 무동작 증명** 후 커밋.

---

## 사용자 확인 필요 (미결)

1. **베트남 귀국 lane** — 대만·EU 는 '귀국 서류 준비'류 카드가 있는데 베트남만 없다.
   한국 수출검역증으로 갈음되는지 조사 필요(Circular 25 는 입국만 다룸).
2. **밀꾸 테스트 데이터** — 검수용으로 `destination` 에 `베트남` 을 추가해둔 상태
   (`일본, 필리핀, 베트남`). 확인 끝나면 되돌릴지 물어볼 것.
3. **광견병 카드 파생 나머지** — 일본·EU 8곳·태국·필리핀.

---

## 작업 규칙 (메모리에 있지만 재확인)

- **본체 `/c/dev/petmove` 에서 master 직접** 편집·커밋·푸시. worktree 안 씀.
- **편집 직후 커밋·푸시까지 한 번에.** 묶음 검증 X.
- 새 목적지는 `feedback_new_destination_check_order` 워크플로 4단계 —
  **끝났다는 보고 = 브라우저에 그 나라 준비 페이지를 띄운 상태**.
- 커밋 메시지에 백틱 쓰지 말 것(셸이 실행해 내용이 잘림 — 이 세션에서 한 번 겪음).
