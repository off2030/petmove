#!/usr/bin/env node
/**
 * Phase 2.6 Seoul 이관 — field_definitions 중복 제거.
 * 이유: schema-consolidated.sql 에 seed INSERT 가 포함되어 dst에 46행 선삽입됨.
 *       이어서 migrate-data.mjs 가 src의 46행을 다른 uuid 로 upsert → 총 92행.
 * 해결: src 에 없는 id (= seed 에서 생성된 uuid) 를 dst 에서 삭제.
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const src = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const dst = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SUPABASE_SERVICE_ROLE_KEY)

const { data: srcRows, error: sErr } = await src.from('field_definitions').select('id')
if (sErr) throw sErr
const srcIds = new Set(srcRows.map((r) => r.id))
console.log(`src ids: ${srcIds.size}`)

const { data: dstRows, error: dErr } = await dst.from('field_definitions').select('id')
if (dErr) throw dErr
console.log(`dst ids: ${dstRows.length}`)

const toDelete = dstRows.filter((r) => !srcIds.has(r.id)).map((r) => r.id)
console.log(`삭제 대상 (seed uuid): ${toDelete.length}`)

if (toDelete.length === 0) {
  console.log('정리 불필요')
  process.exit(0)
}

const { error: delErr } = await dst.from('field_definitions').delete().in('id', toDelete)
if (delErr) throw delErr

const { count } = await dst.from('field_definitions').select('*', { count: 'exact', head: true })
console.log(`✓ 삭제 완료. dst 현재 행수: ${count}`)
