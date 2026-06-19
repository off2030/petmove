# Supabase DB 자동 백업 → 구글 드라이브

매일 KST 02:00 에 GitHub Actions(`.github/workflows/backup-db.yml`)가 Supabase(Seoul) DB 를
덤프해 구글 드라이브 `Petmove-Backups/` 폴더에 올립니다. 30일 지난 백업은 자동 정리됩니다.

> **왜:** Supabase 무료 플랜엔 복구용 자동 백업이 없습니다. 잘못된 마이그레이션·스크립트·앱
> 버그로 데이터가 유실됐을 때 되돌릴 off-site 안전망입니다. (Supabase Pro 로 올리면 매일 자동
> 백업 + 시점복구가 생겨 이 워크플로는 보조가 됩니다.)

설정은 **최초 1회**, GitHub 저장소에 **비밀값(secret) 2개**를 넣으면 끝납니다. 그 전까지는
워크플로가 "건너뜀"으로 조용히 통과합니다(헛경보 없음).

---

## Secret 1 — `SUPABASE_DB_URL` (DB 접속 주소)

1. Supabase 대시보드 → 해당(Seoul) 프로젝트 → **Project Settings → Database**
2. **Connection string** 섹션에서 **`Session pooler`** 탭 선택 → URI 를 복사
   - ⚠️ 반드시 **Session pooler**(포트 **5432**). Transaction pooler(6543)·직접연결은 덤프가 안 됩니다.
   - 형태: `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-...pooler.supabase.com:5432/postgres`
3. 복사한 문자열의 `[YOUR-PASSWORD]` 를 **실제 DB 비밀번호**로 바꿉니다.
   (비밀번호를 모르면 같은 화면에서 `Reset database password` 로 재설정 → `.env.local` 의
   `SUPABASE_DB_PASSWORD` 도 같이 갱신)
4. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SUPABASE_DB_URL`
   - Secret: 위에서 완성한 연결 문자열 → **Add secret**

---

## Secret 2 — `RCLONE_CONF` (구글 드라이브 연결)

구글 드라이브에 업로드하려면 한 번 인증이 필요합니다. **rclone** 이라는 무료 도구를 쓰면
구글 클라우드 콘솔 설정 없이 브라우저 로그인만으로 됩니다.

1. 본인 컴퓨터에 rclone 설치 — https://rclone.org/downloads/ (Windows zip 풀어 `rclone.exe`)
2. 터미널(PowerShell)에서:
   ```powershell
   .\rclone config
   ```
   - `n` (new remote)
   - name: **`gdrive`** ← 이 이름 그대로 (워크플로가 이 이름을 씁니다)
   - Storage: `drive` (Google Drive) 선택
   - `client_id` / `client_secret`: 비워두고 Enter (rclone 기본값 사용)
   - scope: `1` (Full access) 또는 `3` (drive.file — rclone 이 만든 파일만; 더 안전)
   - `root_folder_id` / `service_account_file`: 비워두고 Enter
   - `Edit advanced config?`: `n`
   - `Use auto config?`: `y` → 브라우저 열림 → **백업을 저장할 구글 계정으로 로그인 → 허용**
   - `Configure this as a Shared Drive?`: `n`
   - `y` 로 저장 → `q` 로 종료
3. 설정 내용 확인:
   ```powershell
   .\rclone config show gdrive
   ```
   출력된 **`[gdrive]` 블록 전체**를 복사 (아래 형태):
   ```
   [gdrive]
   type = drive
   scope = drive
   token = {"access_token":"...","refresh_token":"...",...}
   ...
   ```
4. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `RCLONE_CONF`
   - Secret: 위 `[gdrive]` 블록 전체 → **Add secret**

> 폴더는 따로 안 만들어도 됩니다 — 첫 업로드 때 드라이브에 `Petmove-Backups/` 가 자동 생성됩니다.

---

## 첫 실행 & 확인

1. GitHub → **Actions → Backup DB to Google Drive → Run workflow**(master) 로 수동 실행
2. 초록 체크면 성공 → 구글 드라이브 `Petmove-Backups/` 에 `petmove-db-YYYYMMDD-HHMMSS.tar.gz` 확인
3. 이후엔 매일 KST 02:00 자동 실행. (실패하면 Actions 탭에 빨강으로 표시 — 가끔 확인하거나
   GitHub 알림을 켜두세요.)

## 백업 파일 안에 든 것

`tar.gz` 안에 SQL 3개:
- `roles.sql` — DB 역할
- `schema.sql` — 테이블 구조(스키마)
- `data.sql` — **실제 데이터**(케이스·보호자·프로필 등)

복구는 새 Supabase 프로젝트에 `psql` 로 roles → schema → data 순서로 적용합니다.
(실제 복구가 필요해지면 함께 진행하면 됩니다.)

## 백업에 **안 들어가는** 것

- **Storage 파일**(아바타·서류 이미지 등 버킷 파일)은 DB 덤프에 포함되지 않습니다. 필요하면
  별도 백업 단계를 추가할 수 있습니다.
- Supabase **인증 사용자(auth.users)** 는 Supabase 가 관리하는 영역이라 이 덤프(public 스키마
  중심)와는 별개입니다.

## 보관·주기 바꾸기

`.github/workflows/backup-db.yml` 에서:
- 실행 시각: `cron: '0 17 * * *'` (UTC. KST 02:00)
- 보관 기간: `rclone delete --min-age 30d` 의 `30d`
