# 펫무브워크 (PetMoveWork) — B2B SaaS 웹앱

이 폴더는 **펫무브워크** 앱. 동물병원·에이전시 스태프용 B2B SaaS 웹앱.
**별도의 앱**인 펫무브(`apps/portal`) 와는 DB·도메인 규칙만 공유, 코드는 분리.

## 정체성

| | |
|---|---|
| 사용자 | 동물병원 수의사·매니저, 에이전시 직원, super_admin 운영자 |
| 비즈 모델 | SaaS (org 기반 멤버십, invite-only) |
| 배포 | 웹 only (현재 petmove.vercel.app → 추후 `app.petmove.co.kr`) |
| 디자인 | Editorial 톤 (Parchment/Terracotta) — [docs/design-system.md](../../docs/design-system.md) 단일 출처 |
| 토큰 | `--pmw-*` CSS 변수 + `.pmw-st__*` 타이포 유틸 |
| 우선 | 데스크톱 우선. 모바일은 미디어 쿼리로만 |

## 코드 룰

1. **펫무브 코드 import 금지** — `apps/portal/**` 에서 직접 import 하지 않는다. 공유는 `packages/` 로만.
2. **데스크톱 구성 변경 금지** — 모바일 최적화는 미디어 쿼리/모바일 전용 분기로만. 데스크톱 레이아웃·구조 변경 X.
3. **invite-only 가드** — proxy.ts 의 memberships 0 차단은 admin 에서만. portal 에는 적용되지 않음 (도메인 분리됨).
4. **본체에서 master 직접 작업** — worktree 사용 X. /c/dev/petmove 에서 master 직접 편집·커밋·푸시.
5. **Supabase 는 Seoul 프로젝트만** — Mumbai 사용 금지 (곧 삭제 예정). `pnpm db:link` 확인 필수.

## 작업 시작 전 읽기

- [docs/saas-migration.md](../../docs/saas-migration.md) — 전체 SaaS 전환 로드맵
- [docs/design-system.md](../../docs/design-system.md) — Editorial 토큰
- [packages/auth/README.md](../../packages/auth/README.md) — 인증 서브패스 분리 사유

## 현재 진행

prod 운영 중. 케이스 CRUD, 자동 검증·PDF 생성, 메시지, 검사·일정 관리, 결제, super-admin 완비. 마이그 93건 적용.
