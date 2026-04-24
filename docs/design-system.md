# PetMove Editorial 디자인 시스템

새 페이지를 만들 때 이 문서의 토큰·컴포넌트·패턴을 그대로 쓰면 기존 페이지와 자연스럽게 붙는다. "비슷한 걸 다시 만들기" 대신 "기존 걸 import" 가 원칙.

---

## 1. 톤 개요

- **서체 중심**: 본문·타이틀은 `font-serif` (Charter/Source Serif). 소형 라벨·숫자는 `font-mono` (IBM Plex Mono). 기본 sans 는 보조.
- **pill + 점선**: 경계는 `rounded-full` pill 버튼과 `border-dotted border-border/60` 점선 구분. 카드 박스·그림자는 거의 쓰지 않는다.
- **peach 액센트**: 아바타·선택일 등 포인트는 `#E5B89C` 계열 peach. 상태 표기는 dot + 텍스트로 절제.
- **여백**: 섹션 간 `mb-xl` / `pb-xl`, 행 간 `py-2 ~ py-3`, 그룹 내부 `gap-md`.

---

## 2. 토큰

### 2.0 PMW 토큰 (CSS custom properties)

에디토리얼 톤의 "raw" 값. Tailwind 의 HSL 토큰(`--foreground`/`--muted-foreground` 등)과 병행 사용. 신규 컴포넌트는 가능하면 `.pmw-st__*` 유틸리티 클래스 또는 `var(--pmw-*)` 인라인 스타일을 우선 사용.

**폰트 alias** (next/font 래핑 → 이름 있는 변수로 재노출):

| 변수                | 값                                                          |
| ------------------- | ----------------------------------------------------------- |
| `--pmw-font-serif`  | Source Serif 4 → Noto Serif KR → Georgia                    |
| `--pmw-font-sans`   | Inter Tight → Pretendard → Noto Sans KR                     |
| `--pmw-font-mono`   | JetBrains Mono → Pretendard → ui-monospace                  |

**컬러 팔레트** (light mode; 다크모드는 globals.css `.dark` 섹션에서 반전):

| 변수                  | 값         | 용도                             |
| --------------------- | ---------- | -------------------------------- |
| `--pmw-near-black`    | `#1A1816`  | 기본 본문 / 강조 텍스트          |
| `--pmw-olive-gray`    | `#7A776C`  | 보조 텍스트 / 라벨               |
| `--pmw-stone-gray`    | `#9E9C91`  | 카운트·비활성 텍스트             |
| `--pmw-deep`          | `#9B4A2D`  | terracotta 포인트 (chip text)    |
| `--pmw-clay-soft`     | `#E8C9B6`  | peach 액센트 배경 (chip bg)      |
| `--pmw-sage`          | `#5D6F4E`  | 상태 = 정상 / 성공               |
| `--pmw-amber`         | `#B97A1F`  | 상태 = 주의 / 임박               |
| `--pmw-rust`          | `#A04321`  | 상태 = 만료 / 오류               |
| `--pmw-border-warm`   | `#D9D4C6`  | 점선·얇은 구분선                 |
| `--pmw-parchment`     | `#F6F2E7`  | 페이지 배경                      |
| `--pmw-paper`         | `#FBF8EE`  | 팝오버·모달 배경                 |

### 2.0.1 타이포 스케일 (`.pmw-st__*` 유틸리티)

약품 관리 섹션 기준으로 정의. 다른 에디토리얼 섹션(설정, 상세)에서도 그대로 사용.

| 클래스                   | 스펙                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `.pmw-st__sec-title`     | Serif 26px / 400 / letter-spacing −0.3px / `near-black`                     |
| `.pmw-st__sec-lead`      | Serif italic 14.5px / line-height 1.55 / `olive-gray`                       |
| `.pmw-st__group-title`   | Mono 10.5px / 500 / UPPERCASE / letter-spacing 0.6px / `olive-gray`         |
| `.pmw-st__field-label`   | Serif italic 14px / `olive-gray`                                            |
| `.pmw-st__input`         | Sans 14.5px / `near-black`                                                  |
| `.pmw-st__input-mono`    | Mono 13.5px / `near-black`                                                  |
| `.pmw-st__btn`           | Sans 12.5px / 500 / `near-black`                                            |
| `.pmw-st__btn-ghost`     | Serif italic 13px / `olive-gray`                                            |
| `.pmw-st__chip`          | Sans 12px / 500 / `deep` on `clay-soft` bg                                  |
| `.pmw-st__tab-count`     | Mono 10.5px / `stone-gray`                                                  |

**헬퍼 유틸** (status text + dot):

- `.pmw-st__status--sage|amber|rust|stone` — text color
- `.pmw-st__dot--sage|amber|rust|stone` — background color

### 2.1 색상 (hover / border)

| 용도                                | 클래스                                | 언제                              |
| ----------------------------------- | ------------------------------------- | --------------------------------- |
| 목록 행 hover (클릭 → 선택/이동)    | `hover:bg-accent`                     | 케이스 목록, 약품 목록 등         |
| 필드 행 hover (edit 가능한 행)      | `hover:bg-accent/60`                  | case-detail FieldRow, 공통 필드   |
| 작은 버튼 hover                     | `hover:bg-muted/40`                   | pill 버튼 outline, 캘린더 네비    |
| 섹션 경계 (진한 구분)               | `border-border/70`                    | 섹션 상하단 1px 가로선            |
| 행 구분 (점선)                      | `border-b border-dotted border-border/60` | 필드 리스트의 행간                |
| 필드 하단 (실선 옅음)               | `border-b border-border/60`           | FieldRow 구분선                   |

### 2.2 상태 dot 팔레트

`<StatusDot tone="...">` 사용. 자체 배경 없음.

| tone     | text                       | dot              | 의미                      | PMW 대응          |
| -------- | -------------------------- | ---------------- | ------------------------- | ----------------- |
| `red`    | text-red-700               | bg-red-500       | 만료, 실패, 경고 최상위   | rust              |
| `orange` | text-orange-700            | bg-orange-500    | 30일 이내, 주의           | amber             |
| `yellow` | text-yellow-700            | bg-yellow-500    | 90일 이내, 경계           | amber (soft)      |
| `green`  | text-emerald-700           | bg-emerald-500   | 성공, 활성                | sage              |
| `gray`   | text-muted-foreground      | bg-gray-400      | 정상, 중립                | olive-gray + sage |
| `muted`  | text-muted-foreground/50   | bg-gray-300      | 정보 없음                 | stone-gray        |

PMW 3색(sage/amber/rust) 전환을 선호. vaccine-section 은 inline `style={{ color: 'var(--pmw-rust)' }}` 식으로 이미 이주됨. StatusDot 컴포넌트 확장은 별도 세션에서.

### 2.3 타이포

| 용도            | 클래스                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| 페이지 타이틀   | `font-serif text-[28px] leading-tight text-foreground` → `<SectionHeader>`                 |
| 서브 섹션 제목  | `font-serif text-[17px] text-foreground`                                                   |
| 스몰캡 라벨     | `font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground` → `<SectionLabel>` |
| 본문 값         | `font-serif text-[15-17px] text-foreground`                                                |
| 캡션 (설명)     | `font-serif italic text-[12px] text-muted-foreground/70 leading-relaxed`                   |
| 숫자·코드       | `font-mono text-[12-13px] tabular-nums`                                                    |

### 2.4 레이아웃 max-width

| 페이지 유형               | max-w       |
| ------------------------- | ----------- |
| 설정/폼 (입력 중심)       | `max-w-3xl` |
| 목록/상세 (가로 열 있음)  | `max-w-5xl` |
| 와이드 테이블/계산기      | `max-w-7xl` |

## 3. 공용 컴포넌트

모두 `@/components/ui/` 에서 import.

### 3.1 `<SectionHeader>` — 페이지 타이틀

```tsx
<SectionHeader>약품</SectionHeader>
```

### 3.2 `<SectionLabel>` — 스몰캡 그룹 라벨

```tsx
<SectionLabel>Clinic</SectionLabel>
```

### 3.3 `<PillButton variant="outline|solid">`

```tsx
<PillButton onClick={handleCopy}>링크 복사</PillButton>
<PillButton variant="solid" onClick={handleSubmit}>초대 보내기</PillButton>
```

### 3.4 `<StatusDot tone="...">`

```tsx
<StatusDot tone="orange">D-21</StatusDot>
<StatusDot tone="gray">정상</StatusDot>
```

### 3.5 `<Avatar>`

```tsx
<Avatar label={avatarInitial(user.name)} />
<Avatar label="?" muted />
```

### 3.6 `<PillSelect>` — 드롭다운

네이티브 `<select>` 는 금지 (브라우저별 파란 하이라이트가 에디토리얼 톤을 깨뜨림). 항상 `PillSelect` 사용.

```tsx
import { PillSelect } from '@/components/ui/pill-select'

<PillSelect
  value={value}
  onChange={setValue}
  options={[{ value: 'KRSL', label: 'KRSL' }, { value: 'APQA', label: 'APQA Seoul' }]}
  aria-label="기본 검사기관"
/>
```

**Variants**:
- `pill` (기본): rounded-full + warm border + `bg-background/60`. 필드 행 값 입력용.
- `chip`: clay-soft 배경 + deep text (`pmw-st__chip`). 규칙 행 우측 inline chip.
- `ghost`: dotted border + olive-gray. "+ 추가" 류 보조 선택.

키보드 지원 ↑↓ Home End Esc Enter. 외부 클릭 → 닫힘. 파란 브라우저 하이라이트 없음.

### 3.7 `<DateTextField>` — 날짜 입력

**항상** 이 컴포넌트를 쓴다. 네이티브 `<input type="date">` 는 금지.

```tsx
import { DateTextField } from '@/components/ui/date-text-field'

<DateTextField value={value} onChange={setValue} />
```

브라우저별 UI 차이, 한국어 locale, peach 선택색, 오늘/삭제 푸터가 이 안에 다 들어있다.

### 3.8 `<Calendar>` — 저수준 캘린더

`DateTextField` 내부에서 쓰이는 react-day-picker v9 래퍼. 보통 직접 쓸 일 없음.

---

## 4. 반복 패턴

### 4.1 필드 행 (label-value)

```tsx
<div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60 last:border-0">
  <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground pt-1">라벨</span>
  <div>값…</div>
</div>
```

→ 가능한 경우 `FieldRow` (`components/cases/extra-field-shell.tsx`) 재사용.

### 4.2 목록 행 (클릭 → 선택)

```tsx
<button className="group block w-full px-lg py-4 text-left transition-colors hover:bg-accent">
  …
</button>
```

- 선택 상태: `bg-accent`
- 키보드 하이라이트: `bg-accent/70`

### 4.3 섹션 블록

```tsx
<section className="mb-xl">
  <div className="mb-2">
    <SectionLabel>Clinic</SectionLabel>
  </div>
  <div className="border-t border-border/70">
    {/* 필드 행들 — py-3 border-b border-dotted */}
  </div>
</section>
```

### 4.4 상태 요약 pill (페이지 상단 집계)

```tsx
<span className="inline-flex items-center gap-xs font-serif text-[12px] px-2 py-0.5 rounded-full bg-red-50 text-red-700">
  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
  만료 3
</span>
```

실제 `<StatusDot>` 과 다른 점: 배경 pill 이 있다. 페이지 최상단 "전체 N건" 같은 집계 chip 에만 사용.

---

## 5. Do / Don't

### Do

- 새 페이지는 `<SectionHeader>` + `<SectionLabel>` 로 구조 잡기
- 날짜 입력은 `<DateTextField>` 만
- 점선 구분선은 `border-dotted border-border/60`
- 목록 행 hover 는 `bg-accent`, 필드 행 hover 는 `bg-accent/60`

### Don't

- 네이티브 `<input type="date">` 쓰지 말기
- 네이티브 `<select>` 쓰지 말기 — `<PillSelect>` 만 사용
- 목록 행을 `hover:bg-accent/20` 처럼 더 옅게 잡지 말기 (홈·설정 일관성 깨짐)
- 상태 표기에 배경 pill 쓰지 말기 (페이지 상단 집계 chip 은 예외)
- 카드 shadow·두꺼운 border 로 섹션 분리하지 말기 — border-top 얇은 선으로 충분

---

## 6. 미완 사항

- 기존 페이지의 38개 `SectionLabel` 인라인, 33개 필드 행 인라인은 아직 마이그레이션 안 됨. 새 공용 컴포넌트는 **앞으로 만드는 페이지 + editorial 리뉴얼 중인 섹션** 에서만 사용. 일괄 교체는 별도 세션에서.
- 다크모드 대응은 대부분 자동이지만 peach 계열은 `dark:` 변형을 명시 (avatar, calendar 참조).
