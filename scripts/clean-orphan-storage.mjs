#!/usr/bin/env node
/**
 * 스토리지 고아 파일 정리 — DB 어디에서도 참조하지 않는 파일을 찾아 지운다.
 *
 * 고아가 생기는 경로: 업로드는 됐는데 DB 저장이 실패했거나, 메모·서류를 지울 때 스토리지
 * 삭제만 실패했거나, 레거시 필드가 정리되며 링크가 끊긴 경우. 앱에서는 이미 보이지 않는
 * 파일들이라 지워도 화면상 변화가 없다.
 *
 * 안전장치 3겹:
 *   1. 기본이 dry-run. --apply 를 줘야 실제로 지운다.
 *   2. 참조 판정은 DB 전체(모든 테이블) 텍스트에 경로·URL·인코딩 변형이 있는지로 한다.
 *      하나라도 걸리면 고아가 아니다 — 애매하면 남기는 쪽.
 *   3. 구글 드라이브 미러(backup-storage-mirror.mjs)에 이미 백업된 파일만 지운다.
 *      백업이 확인 안 되면 건너뛴다. --force 로만 무시 가능.
 *
 *   node scripts/clean-orphan-storage.mjs                 # 목록만 (안전)
 *   node scripts/clean-orphan-storage.mjs --safe --apply  # 폐기 버킷·옛 아바타·삭제된 케이스만
 *   node scripts/clean-orphan-storage.mjs --all --apply   # 살아있는 케이스의 고아까지 전부
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (apps 의 .env.local 자동 사용)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
function loadEnv(fp) {
  if (!existsSync(fp)) return {}
  const o = {}
  for (const l of readFileSync(fp, 'utf-8').split('\n')) {
    const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) o[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return o
}
const env = {
  ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')),
  ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')),
  ...process.env,
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
// Seoul 프로젝트 전용 가드 — 다른 프로젝트 파일을 지우는 사고 방지
if (!URL_.includes('ugywxiyivfzflqkcnqvu')) {
  console.error(`Seoul 프로젝트가 아님: ${URL_}`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const force = argv.includes('--force')
const scope = argv.includes('--all') ? 'all' : argv.includes('--safe') ? 'safe' : 'none'
const REMOTE = process.env.BACKUP_REMOTE || 'gdrive:Petmove-Backups/storage'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const mb = (n) => (n / 1024 / 1024).toFixed(1)

/** PostgREST 가 노출하는 전체 테이블 — 새 테이블이 생겨도 자동 포함된다. */
async function allTables() {
  const spec = await (await fetch(`${URL_}/rest/v1/`, { headers: H })).json()
  return Object.keys(spec.paths || {})
    .filter((k) => k.startsWith('/') && k.length > 1 && !k.startsWith('/rpc/')) // 함수(rpc)는 제외
    .map((k) => k.slice(1))
}

async function fetchAllText(table) {
  let text = ''
  let offset = 0
  for (;;) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`, { headers: H })
    if (!r.ok) return text
    let rows
    try {
      rows = await r.json()
    } catch {
      return text // 빈 응답(뷰·권한 등) — 건너뛴다
    }
    if (!Array.isArray(rows) || rows.length === 0) break
    text += JSON.stringify(rows)
    if (rows.length < 1000) break
    offset += 1000
  }
  return text
}

async function listPrefix(bucket, prefix) {
  const out = []
  let offset = 0
  for (;;) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < 1000) break
    offset += 1000
  }
  return out
}

/** Supabase list 는 재귀가 안 돼 폴더를 직접 파고든다. */
async function walk(bucket, prefix = '') {
  const files = []
  for (const row of await listPrefix(bucket, prefix)) {
    const full = prefix ? `${prefix}/${row.name}` : row.name
    if (row.id === null) files.push(...(await walk(bucket, full)))
    else files.push({ bucket, path: full, size: row.metadata?.size ?? 0, created: row.created_at })
  }
  return files
}

console.log(`Mode: ${apply ? 'APPLY (실제 삭제)' : 'DRY-RUN (목록만)'} / 범위: ${scope}\n`)

const tables = await allTables()
let haystack = ''
for (const t of tables) haystack += await fetchAllText(t)
console.log(`DB 스캔: ${tables.length}개 테이블, ${mb(haystack.length)}MB 텍스트`)

// attachments 최상위 폴더 = caseId. 케이스 존재·휴지통 여부로 등급을 나눈다.
const caseState = new Map()
{
  let offset = 0
  for (;;) {
    const r = await fetch(`${URL_}/rest/v1/cases?select=id,deleted_at&limit=1000&offset=${offset}`, { headers: H })
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const row of rows) caseState.set(row.id, row.deleted_at)
    if (rows.length < 1000) break
    offset += 1000
  }
}
console.log(`케이스 ${caseState.size}건 확인\n`)

/** 경로가 DB 어딘가에 등장하는지 — 원문·URL 인코딩 변형까지 본다. */
function referenced(p) {
  const base = p.split('/').pop()
  return [p, encodeURIComponent(p), encodeURI(p), base, encodeURIComponent(base)].some((v) =>
    haystack.includes(v),
  )
}

const groups = { chat: [], avatars: [], deadCase: [], trashedCase: [], liveCase: [] }
for (const bucket of ['chat-files', 'user-avatars', 'attachments']) {
  for (const f of await walk(bucket)) {
    if (referenced(f.path)) continue
    if (bucket === 'chat-files') groups.chat.push(f)
    else if (bucket === 'user-avatars') groups.avatars.push(f)
    else {
      const caseId = f.path.split('/')[0]
      if (!caseState.has(caseId)) groups.deadCase.push(f)
      else if (caseState.get(caseId)) groups.trashedCase.push(f)
      else groups.liveCase.push(f)
    }
  }
}

const LABEL = {
  chat: '폐기된 채팅 기능 파일',
  avatars: '교체되고 남은 옛 프로필 사진',
  deadCase: '케이스가 완전히 삭제된 파일',
  trashedCase: '휴지통 케이스의 파일',
  liveCase: '살아있는 케이스인데 참조 끊긴 파일',
}
for (const [k, files] of Object.entries(groups)) {
  const size = files.reduce((s, f) => s + f.size, 0)
  console.log(`${LABEL[k].padEnd(26)} ${String(files.length).padStart(4)}개 ${mb(size).padStart(6)}MB`)
}

const targets =
  scope === 'all'
    ? [...groups.chat, ...groups.avatars, ...groups.deadCase, ...groups.trashedCase, ...groups.liveCase]
    : scope === 'safe'
      ? [...groups.chat, ...groups.avatars, ...groups.deadCase, ...groups.trashedCase]
      : []
console.log(`\n선택된 삭제 대상: ${targets.length}개 ${mb(targets.reduce((s, f) => s + f.size, 0))}MB`)

if (!apply) {
  console.log('\n(dry-run — 아무것도 지우지 않았습니다. 실제 삭제는 --safe 또는 --all 과 --apply 를 함께)')
  process.exit(0)
}
if (scope === 'none') {
  console.error('\n--safe 또는 --all 중 하나를 지정해야 삭제합니다.')
  process.exit(1)
}

// 안전장치 3 — 드라이브 미러에 올라간 파일만 삭제한다.
const mirrored = {}
for (const bucket of ['chat-files', 'user-avatars', 'attachments']) {
  try {
    const out = execFileSync('rclone', ['lsf', '-R', '--files-only', `${REMOTE}/${bucket}/`], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    mirrored[bucket] = new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))
  } catch {
    mirrored[bucket] = new Set()
  }
}
const deletable = force ? targets : targets.filter((f) => mirrored[f.bucket]?.has(f.path))
const skipped = targets.length - deletable.length
if (skipped > 0) {
  console.log(
    `\n백업 미확인으로 건너뜀: ${skipped}개 — 먼저 'node scripts/backup-storage-mirror.mjs --apply' 로 드라이브에 올리세요.`,
  )
}
if (deletable.length === 0) {
  console.log('삭제할 파일이 없습니다.')
  process.exit(0)
}

for (const bucket of ['chat-files', 'user-avatars', 'attachments']) {
  const paths = deletable.filter((f) => f.bucket === bucket).map((f) => f.path)
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100)
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: H,
      body: JSON.stringify({ prefixes: chunk }),
    })
    console.log(`[${bucket}] ${chunk.length}개 삭제 ${r.ok ? '성공' : `실패(${r.status})`}`)
  }
}
console.log(`\n정리 완료: ${deletable.length}개 ${mb(deletable.reduce((s, f) => s + f.size, 0))}MB 확보`)
