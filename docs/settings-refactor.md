# 설정 화면 리팩터링 계획 (work in progress)

> 마지막 업데이트: 2026-05-04 (phase 3a 완료 — SettingsField 도입 + profile/company 변환)
> 다음 시작점: 카테고리 헤더 UI 합의 / inspection·detail-view row 통일 / vaccine 통합 패턴

## 배경

`apps/admin/components/settings/` 의 설정 화면이 12개 메뉴를 평면 탭으로 들고
있고, 각 섹션이 자체 레이아웃·라벨·border 패턴을 가짐. 메뉴가 늘면서 공통
골격 부재가 두드러지는 단계.

최근 작업으로 정리된 것:
- 서류 탭의 cert 규칙 → 상세 탭으로 통합
- 담당자 기능 토글 → 전달 탭에서 상세 탭으로 이동
- 상세 탭 내부 카테고리 정리: 기본 → 공유 → 목적지 → 증명서
- 검사·신고·서류 탭에 컬럼 토글 설정 추가
- 스킨 순서 재배열

## 사용자가 제안한 방향 (검토 결과)

### 동의

- 12개 평면 탭 → 카테고리 + 메타데이터 모델 전환 (1순위)
- `SettingsShell` / `SettingsSection` / `SettingsRow` 등 설정 전용 골격 컴포넌트 추출
- `settings-app.tsx` 부터 손대는 순서 자연스러움 — 메뉴 모델이 잡혀야 나머지 섹션이 그 규격으로 옮겨감

### 짚어둘 점 (다음 컴퓨터에서 결정 필요)

1. **방금 한 작업과 충돌 가능성**: 사용자가 "상세에 한·영 병기 + 담당자 + 공유 + 목적지 + 증명서 통합" 을 직접 지시해서 실행함. 그런데 새 분류안에서 `케이스` 카테고리로 `상세 화면` / `목적지·추가정보` / `공유 링크`를 별도 메뉴로 두는 모양. 다시 쪼갤 거면 의도 명확화 필요 — 한 메뉴 안 카테고리(h3)로 그룹할지, 메뉴 자체를 분리할지.

2. **`SettingsRow` 변형 필요**: 토글 행 / 칩 리스트 행 / 입력 행 / 저장 footer 행이 같은 레이아웃 규격에 다 안 들어감. variants (`row-toggle`, `row-input`, `row-chips`) 설계 후 통일해야 의미 있음. variant 설계 없이 한 컴포넌트로 묶으면 props 폭주.

3. **카테고리 6개는 12개 메뉴에 비해 과함**: 2~3개씩 분배 — 헤더 노이즈 비율이 높음. 일단 3~4개로 시작해서 메뉴가 늘면 쪼개는 게 안전. 예: `계정·조직` / `케이스` / `업무` / `데이터·관리`.

4. **"약품 → 구충 디폴트"는 현재 메뉴에 없음**: 미래 분류는 미래에 정의하고, 지금은 존재하는 12개에 한정.

5. **점진적 이전이 PR 분할 기준이어야**: phase 0 메타데이터/공통 컴포넌트 → phase 1 가벼운 섹션(profile/company) 변환 → phase 2 무거운 섹션. 한 PR에 다 넣으면 리뷰 어렵고 회귀 리스크 큼.

## phase 0 — 완료 (2026-05-04)

가시 변화 최소, 골격만 추출. 모든 항목은 후속 마이그레이션의 발판.

1. ✅ **신규 파일** `apps/admin/components/settings/settings-layout.tsx`:
   - `SettingsShell` (max-width + pb-2xl 컨테이너)
   - `SettingsSection` (h2 + description + 슬롯)
   - `SettingsRow` (variants: `toggle` | `input` | `chips` | `static` — 일단 메타데이터, 레이아웃 동일)
   - `SettingsFooter` (저장 버튼 영역)
   - `SettingsSectionLabel` (mono 11px / 1.8px / uppercase — 영어 카테고리 라벨)
   - `SettingsSectionLabelSerif` (serif 13px — 한국어 그룹 헤더)
   - 사용처는 라벨 4개 + 마이그레이션 0 — Shell/Section/Row/Footer 는 phase 1 부터 적용.

2. ✅ **`settings-app.tsx` 의 TABS 메타데이터화**:
   ```ts
   type TabDef = {
     id: '…'
     label: string
     category: 'account' | 'case' | 'work' | 'data'
     visibility?: 'super_admin'
   }
   ```
   카테고리 매핑(합의):
   - `account`: profile / company / members
   - `case`: detail_view / transfers / **vaccines**
   - `work`: inspection / import_report / export_doc / automation
   - `data`: verification / data
   카테고리 헤더는 phase 1 까지는 노출 안 함 — 모델만 잡아둠.

3. ✅ **자체 정의 `SectionLabel` 단일화**:
   - company / profile (mono) → `SettingsSectionLabel`
   - documents / inspection (serif) → `SettingsSectionLabelSerif`
   - 각 파일의 자체 정의 함수 제거. cases 화면의 `ui/section-label.tsx`(12px / 1.3px) 와는 별개로 유지 — 두 화면의 라벨 톤이 본래 다르게 잡혀 있어 통합 결정은 phase 2+.

## phase 1 — 완료 (2026-05-04)

가벼운 섹션을 `SettingsShell` / `SettingsSection` / `SettingsFooter` 규격으로 전환. 시각 회귀 미미.

1. ✅ **profile-section** → `SettingsShell` + `SettingsSection title="내 프로필"` + `SettingsFooter`. sub-group 라벨(Account/Messaging/Notifications)은 children 으로 직접 배치.

2. ✅ **company-section** → `SettingsShell` + `SettingsSection title={title}` + `SettingsFooter className="justify-between"` (reset 좌측 / save status 우측).

3. ✅ **DataSection** (settings-app.tsx 안) → `SettingsShell` + `SettingsSection title="데이터 관리" description="…"`.

4. ✅ **transfers-section** → `SettingsShell` + `SettingsSection title="전달" description="…"`. 보낸/받은 sub-group 은 children 으로 유지.

5. ✅ **members-section** → `SettingsShell` + `SettingsSection title="멤버"`. 활성 멤버 / 외부 super_admin / 대기 초대 / 초대 입력 sub-group 은 children 으로 유지.

6. ✅ **`settings-layout.tsx` 조정**:
   - `SettingsSection` 의 `space-y-md` body wrapper 제거 — card-list / dotted-list / mixed 패턴 모두 흡수.
   - 페이지 헤더 `pb-xl` 로 통일 (settings 표준 톤).
   - `SettingsFooter` default 에 `border-t border-border/80 pt-md` 포함 — 호출처 단순화.

## phase 2 — 완료 (2026-05-04)

무거운 섹션을 `SettingsShell` + `SettingsSection` 규격으로 전환. 외곽만 표준화, row 패턴 통일은 phase 3+.

1. ✅ **`SettingsShell` size prop 추가** — `md` (3xl, default) / `lg` (5xl). 4xl 등 중간 폭은 `className="max-w-4xl"` override.

2. ✅ **verification-section** → `SettingsShell size="lg"` + `SettingsSection`. description 에 ReactNode (super_admin 분기) 활용.

3. ✅ **automation-section** → `SettingsShell size="lg"` + `SettingsSection`.

4. ✅ **export-doc-section** → `SettingsShell size="lg"` + `SettingsSection`. (단순 — 컬럼 토글만)

5. ✅ **import-report-section** → `SettingsShell size="lg"` + `SettingsSection`. ButtonCountriesEditor / AutoCountriesEditor / TodoColumnsToggle 그대로.

6. ✅ **inspection-section** → `SettingsShell size="lg"` + `SettingsSection`. SectionBlock 두 개 (광견병항체/전염병) 그대로.

7. ✅ **detail-view-section** → `SettingsShell className="max-w-4xl"` + `SettingsSection`. 4xl 폭 보존 위해 className override.

8. ❌ **vaccine-section** — 제외. 외곽 div 가 drag-and-drop 컨테이너 (handlers + dynamic className). SettingsShell 의 폭 제어 책임과 다른 SRP 라 별도 패턴 유지. 후속에서 `SettingsShell asChild` 같은 패턴이 필요해지면 그때 합치는 식.

## phase 3a — 완료 (2026-05-04)

`SettingsField` 컴포넌트 도입 + profile / company 의 row 패턴 변환.

1. ✅ **`SettingsField` 추가** — `grid grid-cols-[150px_1fr] gap-md py-3 border-b border-dotted` 패턴.
   - `align="baseline"` (default): input/text 행. 라벨이 input baseline 정렬.
   - `align="center"`: avatar 등 비-텍스트 컨트롤.
   - 컨트롤은 children 슬롯 — 단일 input ~ 복합 배치까지 자유.

2. ✅ **profile-section** — 6개 row 변환:
   - AvatarRow → `<SettingsField label="프로필 이미지" align="center">`
   - 이름 / 이메일 / 로그인 방식 / 푸시 알림 / 검색 노출 → `<SettingsField label="…">`

3. ✅ **company-section** — fields.map 의 동적 row + OrgDmVisibilityRow 변환.
   - HOSPITAL_FIELDS / TRANSPORT_FIELDS 의 11~6개 행 → `<SettingsField key label>`
   - CustomFieldRow 는 `[150px_1fr_auto]` (3-col) 라 그대로 유지.

## phase 3 이후 (합의 필요)

- 카테고리 헤더 UI 도입 — 사이드바 vs 탭 + 그룹 헤더 결정
- inspection-section row 패턴 — `[160px_1fr]` + solid border + items-start 로 SettingsField 와 시각이 다름. 일관 통일할지 별도 디자인 유지할지 결정 필요.
- detail-view-section row 패턴도 SettingsField 적용 가능성 검토.
- ui/section-label vs SettingsSectionLabel 통합 — cases 화면 톤도 합의 후
- vaccine-section 통합 패턴 (`SettingsShell asChild` 또는 별도 컴포넌트)

## 결정 — phase 0 시점 합의

| 항목 | 결정 |
|---|---|
| 카테고리 수 | **4개** (계정·조직 / 케이스 / 업무 / 데이터) |
| 약품(`vaccines`) | **케이스** 카테고리 — 케이스 입력에서 참조하는 마스터 데이터 |
| 상세 탭 | 현재처럼 **통합 유지** |
| 메뉴 UI | phase 0~1 동안 **상단 평면 탭 유지** — phase 2 에서 카테고리 헤더 도입 검토 |
| `SettingsRow` variants | **4개** (toggle/input/chips/static) — 일단 메타데이터, 마이그레이션 진행하며 분기 |

## 관련 파일 (phase 2 완료 시점)

- `apps/admin/components/settings/settings-layout.tsx` — **신규**. Shell(size: md/lg)/Section/Row/Footer + Label 두 종.
- `apps/admin/components/settings/settings-app.tsx` — 진입점, TABS 메타데이터(category) 적용. DataSection 도 Shell 적용.
- `apps/admin/components/settings/detail-view-section.tsx` — 상세 (카테고리 4개 통합). Shell `className="max-w-4xl"`.
- `apps/admin/components/settings/inspection-section.tsx` — 검사 + 컬럼 토글. Shell size="lg" + Label serif.
- `apps/admin/components/settings/import-report-section.tsx` — 신고 + 컬럼 토글. Shell size="lg".
- `apps/admin/components/settings/export-doc-section.tsx` — 서류 (컬럼 토글 전용). Shell size="lg".
- `apps/admin/components/settings/automation-section.tsx` — 자동화 규칙. Shell size="lg".
- `apps/admin/components/settings/verification-section.tsx` — 절차 검증. Shell size="lg".
- `apps/admin/components/settings/transfers-section.tsx` — 전달. Shell.
- `apps/admin/components/settings/members-section.tsx` — 멤버 / 초대. Shell.
- `apps/admin/components/settings/company-section.tsx` — Shell + Label mono.
- `apps/admin/components/settings/profile-section.tsx` — Shell + Label mono.
- `apps/admin/components/settings/documents-section.tsx` — Label serif.
- `apps/admin/components/settings/vaccine-section.tsx` — **제외** (drag-drop 컨테이너 SRP).
- `apps/admin/components/settings/todo-columns-toggle.tsx` — 컬럼 토글 공통 컴포넌트.
- `apps/admin/components/ui/section-label.tsx` — `cases/*` 전용. settings 와는 별개로 유지.
- `apps/admin/components/ui/page-shell.tsx` — 다른 페이지의 공통 셸 (설정엔 미사용).
