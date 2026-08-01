'use server'

import { reportActionError } from './_report-error'
import ExcelJS from 'exceljs'
import { createClient } from '@petmove/auth/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const TOP_COLS = [
  'id',
  'org_id',
  'customer_name',
  'customer_name_en',
  'pet_name',
  'pet_name_en',
  'microchip',
  'microchip_extra',
  'destination',
  'departure_date',
  'created_at',
  'updated_at',
] as const

/**
 * 활성 조직의 모든 케이스를 XLSX (Excel native) 로 내보냄.
 * - 최상위 컬럼 + data jsonb 의 모든 키를 평탄화 (data.X → 컬럼)
 * - 객체/배열 값은 JSON 문자열
 * - Server action 직렬화 위해 base64 문자열로 반환
 */
export async function exportCasesXlsx(): Promise<
  Result<{ filename: string; base64: string }>
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '인증 필요' }
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (!prof?.is_super_admin) {
      return { ok: false, error: '데이터 내보내기는 슈퍼 관리자만 가능합니다.' }
    }
    const orgId = await getActiveOrgId()
    // P2 — 이전엔 limit 없이 select 한 번 → Supabase 기본 cap (1000) 으로 데이터
    // 일부 누락 가능했음. fetchAllCases 와 동일한 batched pagination 으로 전체 행
    // 안전 수집. 동시에 export 상한(50,000) 으로 메모리·timeout 보호.
    const orgRes = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    const rows: Array<Record<string, unknown>> = []
    const batchSize = 1000
    const HARD_CAP = 50_000
    let from = 0
    while (rows.length < HARD_CAP) {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .range(from, from + batchSize - 1)
      if (error) return { ok: false, error: error.message }
      if (!data || data.length === 0) break
      rows.push(...(data as Array<Record<string, unknown>>))
      if (data.length < batchSize) break
      from += batchSize
    }
    if (rows.length >= HARD_CAP) {
      return {
        ok: false,
        error: `데이터가 너무 많습니다 (${HARD_CAP.toLocaleString()}건 이상). 검색·필터로 범위를 좁힌 export 가 필요합니다.`,
      }
    }
    const orgName = (orgRes.data?.name as string | undefined)?.trim() || 'org'

    // data jsonb 의 모든 키 수집 (정렬해서 안정적인 컬럼 순서)
    const dataKeys = new Set<string>()
    for (const r of rows) {
      const d = (r as Record<string, unknown>).data as Record<string, unknown> | null
      if (d && typeof d === 'object') {
        for (const k of Object.keys(d)) dataKeys.add(k)
      }
    }
    const sortedDataKeys = Array.from(dataKeys).sort((a, b) => a.localeCompare(b))

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'PetMove'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('cases')

    // 컬럼 정의 (header + key + width)
    sheet.columns = [
      ...TOP_COLS.map((c) => ({ header: c, key: c, width: 18 })),
      ...sortedDataKeys.map((k) => ({ header: `data.${k}`, key: `data.${k}`, width: 18 })),
    ]

    // Header 굵게
    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const cellValue = (v: unknown): string | number | null => {
      if (v == null) return null
      if (typeof v === 'string' || typeof v === 'number') return v
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
      return JSON.stringify(v)
    }

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const d = (r.data ?? {}) as Record<string, unknown>
      const rowObj: Record<string, string | number | null> = {}
      for (const col of TOP_COLS) rowObj[col] = cellValue(r[col])
      for (const k of sortedDataKeys) rowObj[`data.${k}`] = cellValue(d[k])
      sheet.addRow(rowObj)
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
    const base64 = Buffer.from(buffer).toString('base64')
    const today = new Date().toISOString().slice(0, 10)
    // Windows·macOS 파일명에서 금지된 문자 제거 + 공백을 _ 로
    const safeOrg = orgName.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')
    return { ok: true, value: { filename: `${safeOrg}_${today}.xlsx`, base64 } }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'export-cases.exportCasesXlsx') }
  }
}
