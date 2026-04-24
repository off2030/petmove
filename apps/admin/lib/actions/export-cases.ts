'use server'

import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/active-org'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const TOP_COLS = [
  'id',
  'org_id',
  'status',
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
    const orgId = await getActiveOrgId()
    const [casesRes, orgRes] = await Promise.all([
      supabase
        .from('cases')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
      supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    ])
    if (casesRes.error) return { ok: false, error: casesRes.error.message }
    const rows = casesRes.data ?? []
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
    return { ok: false, error: (e as Error).message }
  }
}
