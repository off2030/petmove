#!/usr/bin/env node
/**
 * Supabase Storage(사진·서류) → 구글 드라이브 미러 백업.
 *
 * DB 백업(.github/workflows/backup-db.yml 의 tar.gz)에는 '파일이 어디 있다'는 주소만 담기고
 * 파일 실물은 스토리지에 있다. 둘 중 하나만 있으면 복구가 안 되므로(서류 목록은 뜨는데 열면
 * 깨짐) 실물도 같은 드라이브에 떠 둔다.
 *
 * 방식: 매일 통째로 올리지 않고 '드라이브에 없는 파일만' 올리는 증분 미러.
 *   드라이브: Petmove-Backups/storage/<버킷>/<원본 경로 그대로>
 *   스토리지 파일은 경로에 타임스탬프·uuid 가 박혀 사실상 불변이라 미러가 적합하다.
 *
 * 스토리지에서 지워진 파일도 드라이브에서는 지우지 않는다 — 실수로 지운 서류를 되찾는 것이
 * 백업의 목적이기 때문. (DB 덤프의 30일 보관과 다른 규칙이다.)
 *
 *   node scripts/backup-storage-mirror.mjs            # dry-run (뭘 올릴지만 계산)
 *   node scripts/backup-storage-mirror.mjs --apply    # 실제 업로드
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *      (로컬은 apps/admin·apps/portal 의 .env.local 자동 사용, CI 는 secrets)
 * 사전 요구: rclone 설치 + 'gdrive' 리모트 설정 (docs/backup-setup.md)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
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
if (!URL_ || !KEY) { console.error('env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
// Seoul 프로젝트 전용 가드 (Mumbai 금지 — 다른 프로젝트를 백업하는 사고 방지)
if (!URL_.includes('ugywxiyivfzflqkcnqvu')) { console.error(`Seoul 프로젝트가 아님: ${URL_}`); process.exit(1) }

const apply = process.argv.includes('--apply')
const REMOTE = process.env.BACKUP_REMOTE || 'gdrive:Petmove-Backups/storage'
const BUCKETS = ['attachments', 'user-avatars']
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const mb = (n) => (n / 1024 / 1024).toFixed(1)

console.log(`Mode: ${apply ? 'APPLY (실제 업로드)' : 'DRY-RUN (계산만)'}`)
console.log(`대상: ${REMOTE}\n`)

/**
 * 5xx·429·네트워크 오류는 잠깐 기다렸다 다시 시도한다.
 * 무인으로 도는 야간 작업이라, 일시적인 503 하나에 그날 백업 전체가 날아가면 안 된다.
 */
async function fetchRetry(url, init, { attempts = 5, label = '' } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((res) => setTimeout(res, 1000 * 2 ** (i - 1))) // 1s, 2s, 4s, 8s
    try {
      const r = await fetch(url, init)
      if (r.ok) return r
      if (r.status < 500 && r.status !== 429) return r // 400·404 등은 재시도해도 같다
      lastErr = new Error(`HTTP ${r.status}`)
    } catch (e) {
      lastErr = e
    }
    console.log(`  … 재시도 ${i + 1}/${attempts - 1} (${label}: ${lastErr.message})`)
  }
  throw new Error(`${label} 실패 — ${attempts}번 시도: ${lastErr?.message}`)
}

/** 버킷 한 단계 나열 (Supabase list 는 재귀가 안 돼 폴더를 직접 파고든다). */
async function listPrefix(bucket, prefix) {
  const out = []
  let offset = 0
  for (;;) {
    const r = await fetchRetry(
      `${URL_}/storage/v1/object/list/${bucket}`,
      {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      },
      { label: `목록 ${bucket}/${prefix}` },
    )
    if (!r.ok) throw new Error(`list 실패 ${bucket}/${prefix}: ${r.status}`)
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < 1000) break
    offset += 1000
  }
  return out
}

/**
 * 동시 실행을 limit 개로 묶어 처리한다. 이 작업의 병목은 용량이 아니라 '파일 개수'다 —
 * 파일 하나마다 목록/내려받기 왕복이 붙어, 순차로 돌리면 6MB짜리 79개도 몇 분씩 걸린다.
 */
async function pool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        results[i] = await fn(items[i], i)
      }
    }),
  )
  return results
}

const LIST_CONCURRENCY = 8
const DOWNLOAD_CONCURRENCY = 8

/** 한 폴더 아래를 순차로 파고든다(케이스 폴더 내부는 얕아 병렬화 이득이 없다). */
async function walkSeq(bucket, prefix) {
  const files = []
  for (const row of await listPrefix(bucket, prefix)) {
    const full = prefix ? `${prefix}/${row.name}` : row.name
    if (row.id === null) files.push(...(await walkSeq(bucket, full)))
    else files.push({ path: full, size: row.metadata?.size ?? 0 })
  }
  return files
}

/**
 * 버킷 전체 나열. 최상위 폴더(케이스·사용자 단위, 수백 개)만 병렬로 훑는다 —
 * 재귀 전체를 병렬화하면 깊이마다 곱해져 동시 요청이 폭발한다.
 */
async function walk(bucket) {
  const rows = await listPrefix(bucket, '')
  const files = rows.filter((r) => r.id !== null).map((r) => ({ path: r.name, size: r.metadata?.size ?? 0 }))
  const folders = rows.filter((r) => r.id === null).map((r) => r.name)
  const nested = await pool(folders, LIST_CONCURRENCY, (name) => walkSeq(bucket, name))
  return [...files, ...nested.flat()]
}

/** 드라이브에 이미 있는 파일 목록 (없는 폴더면 빈 목록). */
function remoteList(bucket) {
  try {
    const out = execFileSync('rclone', ['lsf', '-R', '--files-only', `${REMOTE}/${bucket}/`], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'], // 첫 실행은 '폴더 없음' 에러가 정상이라 stderr 는 버린다
    })
    return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))
  } catch {
    return new Set() // 첫 실행 — 폴더 없음
  }
}

const tmp = path.join(os.tmpdir(), `pm-storage-mirror-${Date.now()}`)
let totalNew = 0
let totalBytes = 0

for (const bucket of BUCKETS) {
  const files = await walk(bucket)
  const have = remoteList(bucket)
  const missing = files.filter((f) => !have.has(f.path))
  const bytes = missing.reduce((s, f) => s + f.size, 0)
  totalNew += missing.length
  totalBytes += bytes
  console.log(`[${bucket}] 스토리지 ${files.length}개 / 드라이브 ${have.size}개 → 올릴 것 ${missing.length}개 (${mb(bytes)}MB)`)

  if (!apply || missing.length === 0) continue

  // 내려받아 임시 폴더에 원본 경로 그대로 쌓은 뒤 한 번에 올린다.
  const stage = path.join(tmp, bucket)
  let done = 0
  await pool(missing, DOWNLOAD_CONCURRENCY, async (f) => {
    let r
    try {
      r = await fetchRetry(
        `${URL_}/storage/v1/object/${bucket}/${f.path.split('/').map(encodeURIComponent).join('/')}`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
        { label: `내려받기 ${f.path}` },
      )
    } catch (e) {
      // 한 파일이 끝내 안 내려와도 나머지는 올린다. 다음 실행에서 다시 시도된다.
      console.log(`  ! 내려받기 실패(건너뜀): ${f.path} — ${e.message}`)
      return
    }
    if (!r.ok) { console.log(`  ! 내려받기 실패(건너뜀): ${f.path} — ${r.status}`); return }
    const dest = path.join(stage, f.path)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
    if (++done % 50 === 0) console.log(`  …${done}/${missing.length}`)
  })
  execFileSync('rclone', ['copy', stage, `${REMOTE}/${bucket}/`, '--transfers', '8', '--stats-one-line'], {
    stdio: 'inherit',
  })
  console.log(`  ✓ ${bucket} ${done}개 업로드 완료`)
}

if (apply && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
console.log(`\n${apply ? '업로드 완료' : '올릴 대상'}: ${totalNew}개 ${mb(totalBytes)}MB`)
