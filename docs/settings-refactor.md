# 설정 화면 리팩터링 계획 (work in progress)

> 마지막 업데이트: 2026-05-04 (phase 0 완료)
> 다음 시작점: phase 1 — profile/company 를 SettingsLayout 규격으로 변환

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

## phase 1 이후 (부분 합의 필요)

- profile-section / company-section 을 `SettingsLayout` 규격으로 변환 (가벼움)
- detail-view-section / inspection-section / import-report-section 변환 (무거움)
- 카테고리 헤더 UI 도입 — 이때 사이드바 vs 탭 + 그룹 헤더 결정
- 무거운 섹션의 분리 (재배치) — phase 1 끝나고 별도 PR

## 결정 — phase 0 시점 합의

| 항목 | 결정 |
|---|---|
| 카테고리 수 | **4개** (계정·조직 / 케이스 / 업무 / 데이터) |
| 약품(`vaccines`) | **케이스** 카테고리 — 케이스 입력에서 참조하는 마스터 데이터 |
| 상세 탭 | 현재처럼 **통합 유지** |
| 메뉴 UI | phase 0~1 동안 **상단 평면 탭 유지** — phase 2 에서 카테고리 헤더 도입 검토 |
| `SettingsRow` variants | **4개** (toggle/input/chips/static) — 일단 메타데이터, 마이그레이션 진행하며 분기 |

## 관련 파일 (phase 0 완료 시점)

- `apps/admin/components/settings/settings-layout.tsx` — **신규**. Shell/Section/Row/Footer + Label 두 종.
- `apps/admin/components/settings/settings-app.tsx` — 진입점, TABS 메타데이터(category) 적용 완료.
- `apps/admin/components/settings/detail-view-section.tsx` — 상세 탭 (카테고리 4개 통합됨).
- `apps/admin/components/settings/inspection-section.tsx` — 검사 + 컬럼 토글. Label serif 통일.
- `apps/admin/components/settings/import-report-section.tsx` — 신고 + 컬럼 토글.
- `apps/admin/components/settings/export-doc-section.tsx` — 서류 (컬럼 토글 전용).
- `apps/admin/components/settings/transfers-section.tsx` — 전달 (보낸→받은 순서).
- `apps/admin/components/settings/company-section.tsx` — Label mono 통일.
- `apps/admin/components/settings/profile-section.tsx` — Label mono 통일.
- `apps/admin/components/settings/documents-section.tsx` — Label serif 통일.
- `apps/admin/components/settings/todo-columns-toggle.tsx` — 컬럼 토글 공통 컴포넌트.
- `apps/admin/components/ui/section-label.tsx` — `cases/*` 전용. settings 와는 별개로 유지.
- `apps/admin/components/ui/page-shell.tsx` — 다른 페이지의 공통 셸 (설정엔 미사용).
