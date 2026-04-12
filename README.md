# PetMove

반려동물 해외 이동 검역 관리 웹앱.

## 현재 상태

Phase 1 스키마 작성 완료. 아직 DB에 적용 안 됨.

```
.
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260412000001_initial_schema.sql       # organizations, cases, field_definitions
│       └── 20260412000002_field_definitions_seed.sql  # 현재 구글폼 34개 필드 정의
├── .env.local           # gitignored, Supabase URL + publishable key
├── .env.example
└── package.json
```

## 다음에 당신이 실행할 것 (순서대로)

터미널에서 이 디렉토리로 이동 후:

```bash
cd /c/dev/petmove     # git bash
# 또는 cmd: cd C:\dev\petmove
```

### 1. Supabase CLI 로그인

```bash
npx supabase login
```

브라우저가 열리며 Supabase 계정으로 인증. 한 번만 하면 됩니다.

### 2. 원격 프로젝트 연결

```bash
npm run db:link
```

또는 직접:
```bash
npx supabase link --project-ref jxyalwbstsqpecavqfkb
```

**DB 비밀번호 입력하라고 나옵니다.** 프로젝트 생성 때 설정한 비밀번호를 입력하세요. 모르면 Supabase 대시보드 → Project Settings → Database → Reset database password 에서 재설정.

### 3. 마이그레이션 푸시 (스키마를 DB에 적용)

```bash
npm run db:push
```

또는 직접:
```bash
npx supabase db push
```

성공하면 원격 DB에 `organizations`, `cases`, `field_definitions` 세 테이블이 생기고 34개 필드 정의가 seed 됩니다.

### 4. 대시보드에서 확인

https://supabase.com/dashboard/project/jxyalwbstsqpecavqfkb/editor 에서 테이블 탭을 열면:
- `organizations` 에 "PetMove" 1건
- `cases` 는 비어 있음 (아직 import 전)
- `field_definitions` 에 34건

## 이후 계획

1. ~~스키마 작성~~ ✅
2. Supabase에 스키마 적용 ← **지금 당신이 하는 단계**
3. 기존 `Original form.xlsx` 의 구글폼 시트 5,950행을 `cases` 테이블로 import (1회성 스크립트)
4. Next.js 스캐폴딩
5. 목록/상세/편집 페이지 (shadcn/ui)
6. 타임라인 뷰
7. 인증 (운영자 → 에이전시 다중 → 고객 포털 순)

## 스키마 설계 요약

- **정규 컬럼**: `microchip`, `customer_name`, `customer_name_en`, `pet_name`, `pet_name_en`, `destination`, `status`, `org_id`, `created_at`, `updated_at`
- **유연 필드**: 나머지는 전부 `cases.data` (jsonb) 안에 저장
- **field_definitions** 가 각 필드의 라벨·타입·순서·그룹·is_step 을 정의하여 UI 를 드라이브
- 필드 추가·이름변경·비활성화는 `field_definitions` 수정만으로 가능 (DB 스키마 변경 없음)
- 멀티테넌트 대비: 모든 업무 테이블에 `org_id` 이미 박혀 있음

## 문제 해결

**`supabase: command not found`** - `npx supabase ...` 를 대신 쓰거나 `C:\Program Files\nodejs` 가 PATH 에 있는지 확인.

**마이그레이션 푸시 실패** - Supabase 대시보드 SQL Editor 에서 `supabase/migrations/*.sql` 내용을 직접 붙여넣어 실행해도 됩니다 (같은 효과).

**DB 재시작하고 싶음** - `npm run db:reset` (원격에는 영향 없음, 로컬 전용). 원격 DB 를 날리려면 대시보드에서 테이블 삭제 후 다시 `db push`.
