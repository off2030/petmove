#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — Storage 버킷 복사.
 * 기존(src) 프로젝트의 `attachments` 버킷 전체 파일을 신규(dst) 로 재귀 복사.
 *
 * 실행 전 `.env.local` 에 다음 4종 필요:
 *   NEXT_PUBLIC_SUPABASE_URL        (기존)
 *   SUPABASE_SERVICE_ROLE_KEY       (기존)
 *   NEW_SUPABASE_URL                (신규)
 *   NEW_SUPABASE_SERVICE_ROLE_KEY   (신규)
 *
 * 실행:
 *   pnpm -F admin exec node scripts/migrate-storage.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SRC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DST_URL = process.env.NEW_SUPABASE_URL
const DST_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY

if (!SRC_URL || !SRC_KEY || !DST_URL || !DST_KEY) {
  console.error(
    'Missing env. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const src = createClient(SRC_URL, SRC_KEY)
const dst = createClient(DST_URL, DST_KEY)

const BUCKET = 'attachments'

async function ensureDestBucket() {
  const { data: buckets, error } = await dst.storage.listBuckets()
  if (error) throw error
  if (buckets?.some((b) => b.name === BUCKET)) {
    console.log(`[dst] 버킷 "${BUCKET}" 이미 존재`)
    return
  }
  const { error: cErr } = await dst.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800, // 50 MB — 기존과 동일
  })
  if (cErr) throw cErr
  console.log(`[dst] 버킷 "${BUCKET}" 생성 (public, 50MB)`)
}

async function listAllFiles(client, prefix = '') {
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
    })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      // id 가 null 이면 폴더 (list 는 디렉토리/파일 모두 반환)
      if (item.id === null) {
        const nested = await listAllFiles(client, path)
        all.push(...nested)
      } else {
        all.push(path)
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function migrate() {
  console.log(`src: ${SRC_URL}`)
  console.log(`dst: ${DST_URL}`)
  await ensureDestBucket()

  console.log('[src] 파일 목록 재귀 조회...')
  const files = await listAllFiles(src)
  console.log(`[src] 총 ${files.length} 개 파일`)

  let ok = 0
  let fail = 0
  for (const path of files) {
    try {
      const { data: blob, error: dlErr } = await src.storage
        .from(BUCKET)
        .download(path)
      if (dlErr) throw dlErr
      const buf = Buffer.from(await blob.arrayBuffer())

      const { error: upErr } = await dst.storage.from(BUCKET).upload(path, buf, {
        upsert: true,
        contentType: blob.type || 'application/octet-stream',
      })
      if (upErr) throw upErr
      ok++
      if (ok % 10 === 0 || ok === files.length) {
        console.log(`  진행: ${ok}/${files.length}`)
      }
    } catch (e) {
      fail++
      console.error(`  [fail] ${path}: ${e.message}`)
    }
  }

  console.log(`\n완료: ${ok} 성공 / ${fail} 실패 / 총 ${files.length}`)
  if (fail > 0) process.exit(1)
}

migrate().catch((e) => {
  console.error(e)
  process.exit(1)
})
