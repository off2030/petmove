'use client'

import { useMemo } from 'react'
import { getAllProducts, type ExpiryStatus, type FlatProduct } from '@/lib/vaccine-lookup'

const STATUS_STYLES: Record<ExpiryStatus, { label: string; bg: string; text: string; dot: string }> = {
  expired: { label: '만료됨',       bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
  urgent:  { label: '30일 이내',    bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  warning: { label: '90일 이내',    bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  ok:      { label: '정상',         bg: '',             text: 'text-muted-foreground', dot: 'bg-gray-300' },
  unknown: { label: '정보 없음',    bg: '',             text: 'text-muted-foreground/50', dot: 'bg-gray-200' },
}

function StatusBadge({ status, daysLeft }: { status: ExpiryStatus; daysLeft: number | null }) {
  const s = STATUS_STYLES[status]
  let extra = ''
  if (status === 'expired' && daysLeft !== null) extra = ` (${Math.abs(daysLeft)}일 경과)`
  else if ((status === 'urgent' || status === 'warning') && daysLeft !== null) extra = ` (D-${daysLeft})`
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}{extra}
    </span>
  )
}

export function VaccineSection() {
  const products = useMemo(() => getAllProducts(), [])

  // 카테고리별로 그룹핑, 만료 심각도로 정렬
  const grouped = useMemo(() => {
    const map = new Map<string, FlatProduct[]>()
    const statusOrder: ExpiryStatus[] = ['expired', 'urgent', 'warning', 'ok', 'unknown']
    for (const p of products) {
      if (!map.has(p.categoryLabel)) map.set(p.categoryLabel, [])
      map.get(p.categoryLabel)!.push(p)
    }
    // 각 그룹 안에서 status 순 → expiry 오름차순
    for (const list of map.values()) {
      list.sort((a, b) => {
        const sa = statusOrder.indexOf(a.status)
        const sb = statusOrder.indexOf(b.status)
        if (sa !== sb) return sa - sb
        return (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : 1
      })
    }
    return Array.from(map.entries())
  }, [products])

  const counts = useMemo(() => {
    const c = { expired: 0, urgent: 0, warning: 0, ok: 0, unknown: 0 }
    for (const p of products) c[p.status]++
    return c
  }, [products])

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-3 text-sm">
        {counts.expired > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            만료 {counts.expired}
          </div>
        )}
        {counts.urgent > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            30일 이내 {counts.urgent}
          </div>
        )}
        {counts.warning > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            90일 이내 {counts.warning}
          </div>
        )}
        {counts.expired === 0 && counts.urgent === 0 && counts.warning === 0 && (
          <div className="text-sm text-muted-foreground">모든 제품이 90일 이상 유효합니다.</div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        편집하려면 <code className="px-1 bg-muted rounded">data/vaccine-products.json</code> 파일을 수정하세요.
        (향후 앱 내 편집 UI 추가 예정)
      </p>

      {/* Groups */}
      {grouped.map(([categoryLabel, list]) => (
        <div key={categoryLabel} className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium">{categoryLabel}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">제품명</th>
                <th className="text-left px-4 py-2 font-medium">제조사</th>
                <th className="text-left px-4 py-2 font-medium">Batch</th>
                <th className="text-left px-4 py-2 font-medium">만료일</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">기준</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2">{p.displayName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.manufacturer}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.batch ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.expiry ?? '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={p.status} daysLeft={p.daysLeft} /></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.meta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
