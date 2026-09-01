# Supabase 자동 백업 → 구글 드라이브

매일 KST 02:00 에 GitHub Actions(`.github/workflows/backup-db.yml`)가 Supabase(Seoul) 의
**DB + 사진·서류 파일**을 구글 드라이브에 올립니다.

```
Petmove-Backups/
  db/                     ← DB 덤프 tar.gz (매일 1개, 30일 보관)
  storage/
    attachments/          ← 케이스 서류·사진 (원본 경로 그대로)
    user-avatars/         ← 보호자·반려동물·직원 프로필 사진
```

> **왜:** Supabase 무료 플랜엔 복구용 자동 백업이 없습니다. 잘못된 마이그레이션·스크립트·앱
> 버그로 데이터가 유실됐을 때 되돌릴 off-site 안전망입니다. (Supabase Pro 로 올리면 매일 자동
> 백업 + 시점복구가 생겨 이 워크플로는 보조가 됩니다.)
>
> **DB 와 파일은 둘 다 있어야 복구됩니다.** DB 덤프에는 "이 서류가 어디 있다"는 주소만 있고
> 실물은 스토리지에 있습니다. 하나만 복구하면 서류 목록은 뜨는데 열면 깨집니다.

설정은 **최초 1회**, GitHub 저장소에 **비밀값(secret) 3개**를 넣으면 끝납니다. 그 전까지는
워크플로가 "건너뜀"으로 조용히 통과합니다(헛경보 없음).

- **DB 백업** — `SUPABASE_DB_URL` + `RCLONE_CONF` (2개 다 있어야 동작)
- **사진·서류 백업** — 위 2개 + `SUPABASE_SERVICE_ROLE_KEY` (없으면 이 단계만 건너뜀)

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

## Secret 3 — `SUPABASE_SERVICE_ROLE_KEY` (사진·서류 백업용)

1. Supabase 대시보드 → 해당(Seoul) 프로젝트 → **Project Settings → API**
2. **Project API keys** 의 **`service_role`** 키를 복사 (`anon` 아님 — 둘을 헷갈리기 쉽습니다)
3. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Secret: 복사한 키 → **Add secret**

> ⚠️ 이 키는 모든 데이터에 접근할 수 있는 마스터 키입니다. 채팅·메일·문서에 붙여넣지 말고
> GitHub secret 칸에만 넣으세요. (secret 은 넣고 나면 화면에서도 다시 볼 수 없습니다.)

---

## 백업할 구글 드라이브를 바꾸려면

용량이 부족하거나 다른 계정으로 옮길 때. **새 계정으로 rclone 인증을 다시 받아
`RCLONE_CONF` 만 갈아끼우면** 됩니다. 코드는 손댈 필요 없습니다.

1. 본인 컴퓨터에서 `rclone config`
   - 기존 `gdrive` 를 지우고(`d` → `gdrive`) 다시 `n` 으로 만들거나, 그냥 `e`(edit)로 재인증
   - 이름은 반드시 **`gdrive`** 그대로. 브라우저가 열리면 **새 구글 계정으로 로그인 → 허용**
2. `rclone config show gdrive` 출력의 `[gdrive]` 블록 전체 복사
3. GitHub → Settings → Secrets → `RCLONE_CONF` → **Update secret** 에 붙여넣기
4. Actions → **Backup DB to Google Drive → Run workflow** 로 수동 1회 실행

> 새 드라이브는 비어 있으므로 **첫 실행에서 사진·서류 전체(수백 MB)를 한 번에 올립니다.**
> 이후엔 새로 생긴 파일만 올라가 몇 초~몇 분이면 끝납니다.
>
> 예전 드라이브의 백업은 그대로 남습니다. 필요 없으면 직접 지우세요. (30일 자동 정리는
> 새 드라이브의 `db/` 폴더에만 적용됩니다.)

---

## 첫 실행 & 확인

1. GitHub → **Actions → Backup DB to Google Drive → Run workflow**(master) 로 수동 실행
2. 초록 체크면 성공 → 구글 드라이브에서 확인
   - `Petmove-Backups/db/petmove-db-YYYYMMDD-HHMMSS.tar.gz`
   - `Petmove-Backups/storage/attachments/…`, `…/user-avatars/…`
3. 이후엔 매일 KST 02:00 자동 실행. (실패하면 Actions 탭에 빨강으로 표시 — 가끔 확인하거나
   GitHub 알림을 켜두세요.)

> **예약 실행은 정시에 안 옵니다.** GitHub 무료 예약은 밀리는 게 정상이라 실제로는 2~8시간
> 늦게 도는 날이 있고, 아주 가끔 그날 실행이 통째로 건너뛰기도 합니다. 며칠치가 비어 있으면
> 수동 실행으로 메우면 됩니다.

## 백업 파일 안에 든 것

`tar.gz` 안에 SQL 3개:
- `roles.sql` — DB 역할
- `schema.sql` — 테이블 구조(스키마)
- `data.sql` — **실제 데이터**(케이스·보호자·프로필 등)

복구는 새 Supabase 프로젝트에 `psql` 로 roles → schema → data 순서로 적용합니다.
(실제 복구가 필요해지면 함께 진행하면 됩니다.)

**사진·서류는 별도로 되돌립니다** — DB 를 복구한 뒤 드라이브의 미러를 스토리지로 올립니다.
파일 하나만 되찾는 경우도 같은 방법입니다.

```bash
# 예: 특정 케이스의 서류만 되찾기
rclone copy "gdrive:Petmove-Backups/storage/attachments/<케이스ID>" ./restore
```

> **복구 시 주의 — 순환 외래키:** `conversations` ↔ `messages` 테이블이 서로 참조해서,
> data-only 덤프를 그대로 넣으면 외래키 검사에 걸립니다. **데이터는 빠짐없이 들어 있고**,
> 넣을 때만 외래키 검사를 잠시 끄면 됩니다 — data.sql 적용 전에
> `SET session_replication_role = replica;` 를 실행(또는 `psql --single-transaction` +
> 그 설정)하면 깔끔히 복구됩니다. pg_dump 가 띄우는 경고가 이 얘기로, **백업 누락이 아닙니다.**

## 사진·서류(Storage) 백업

`scripts/backup-storage-mirror.mjs` 가 **드라이브에 아직 없는 파일만** 골라 올립니다
(증분 미러). 파일 경로에 타임스탬프·uuid 가 박혀 사실상 불변이라, 매일 통째로 올리지 않고
새로 생긴 것만 더하는 방식입니다.

```bash
node scripts/backup-storage-mirror.mjs           # 뭘 올릴지 계산만 (안전)
node scripts/backup-storage-mirror.mjs --apply   # 실제 업로드
```

> **스토리지에서 지운 파일도 드라이브에서는 지우지 않습니다.** 실수로 지운 서류를 되찾는 게
> 백업의 목적이기 때문입니다. (DB 덤프의 30일 보관과는 다른 규칙 — `db/` 폴더만 정리됩니다.)

## 안 쓰는 파일 정리로 용량 확보

`scripts/clean-orphan-storage.mjs` 가 **DB 어디에서도 참조하지 않는 파일**(업로드 후 저장이
실패했거나, 삭제할 때 파일만 남은 것들)을 찾아 정리합니다. 앱에서 이미 안 보이는 파일이라
지워도 화면은 그대로입니다.

```bash
node scripts/clean-orphan-storage.mjs                 # 목록만 (안전)
node scripts/clean-orphan-storage.mjs --safe --apply  # 폐기 버킷·옛 아바타·삭제된 케이스만
node scripts/clean-orphan-storage.mjs --all --apply   # 살아있는 케이스의 고아까지 전부
```

안전장치 3겹: ①기본 dry-run ②경로·URL·인코딩 변형까지 훑어 하나라도 걸리면 남김
③**드라이브 미러에 백업된 파일만 삭제**(백업 안 된 건 건너뜀). 그래서 정리 전에
`backup-storage-mirror.mjs --apply` 를 먼저 돌려야 합니다.

## 백업에 **안 들어가는** 것

- Supabase **인증 사용자(auth.users)** 는 Supabase 가 관리하는 영역이라 이 덤프(public 스키마
  중심)와는 별개입니다.
- `chat-files` 버킷 — 폐기된 채팅 기능의 잔재라 미러 대상에서 뺐습니다.

## 보관·주기 바꾸기

`.github/workflows/backup-db.yml` 에서:
- 실행 시각: `cron: '0 17 * * *'` (UTC. KST 02:00)
- 보관 기간: `rclone delete --min-age 30d` 의 `30d`
  - ⚠️ 이 명령의 경로는 반드시 `Petmove-Backups/db/` 여야 합니다. `Petmove-Backups/` 전체를
    주면 30일 지난 **사진·서류 미러까지 지워집니다.**
