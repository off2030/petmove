'use client'

import { useMemo } from 'react'
import {
  getAllProducts,
  getLatestProducts,
  type ExpiryStatus,
  type FlatProduct,
  type ProductSection,
  type ProductSpecies,
} from '@/lib/vaccine-lookup'

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
    <span className={`inline-flex items-center gap-xs.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}{extra}
    </span>
  )
}

export function VaccineSection() {
  const products = useMemo(() => getAllProducts(), [])

  // 섹션(접종/구충) → 카테고리(공통→강아지→고양이) → 제품(만료 심각도) 순으로 그룹핑
  const sections = useMemo(() => {
    const statusOrder: ExpiryStatus[] = ['expired', 'urgent', 'warning', 'ok', 'unknown']
    const speciesOrder: ProductSpecies[] = ['common', 'dog', 'cat']
    const sectionOrder: ProductSection[] = ['접종', '구충']

    // 섹션 → 카테고리 라벨 → 제품들
    const bySection = new Map<ProductSection, Map<string, FlatProduct[]>>()
    for (const p of products) {
      if (!bySection.has(p.section)) bySection.set(p.section, new Map())
      const cats = bySection.get(p.section)!
      if (!cats.has(p.categoryLabel)) cats.set(p.categoryLabel, [])
      cats.get(p.categoryLabel)!.push(p)
    }

    return sectionOrder
      .filter((s) => bySection.has(s))
      .map((sectionName) => {
        const cats = bySection.get(sectionName)!
        // 카테고리 정렬: 공통 → 강아지 → 고양이, 그 안에서는 라벨 알파/가나다 순
        const catEntries = Array.from(cats.entries())
        catEntries.sort(([, a], [, b]) => {
          const sa = speciesOrder.indexOf(a[0].species)
          const sb = speciesOrder.indexOf(b[0].species)
          if (sa !== sb) return sa - sb
          return a[0].categoryLabel.localeCompare(b[0].categoryLabel, 'ko')
        })
        // 각 카테고리 내 제품 정렬
        for (const [, list] of catEntries) {
          list.sort((a, b) => {
            const sa = statusOrder.indexOf(a.status)
            const sb = statusOrder.indexOf(b.status)
            if (sa !== sb) return sa - sb
            return (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : 1
          })
        }
        return { section: sectionName, categories: catEntries }
      })
  }, [products])

  // 상단 요약 카운트는 "최근 제품 기준"으로만 계산.
  // 연도별 과거 rabies batch, legacy Frontline Plus 등은 제외되고 제품 family+체중 variant 당 최신 1개만.
  const latestProducts = useMemo(() => getLatestProducts(), [])
  const counts = useMemo(() => {
    const c = { expired: 0, urgent: 0, warning: 0, ok: 0, unknown: 0 }
    for (const p of latestProducts) c[p.status]++
    return c
  }, [latestProducts])

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex gap-md text-sm">
        {counts.expired > 0 && (
          <div className="flex items-center gap-xs.5 px-sm py-1.5 rounded-lg bg-red-50 text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            만료 {counts.expired}
          </div>
        )}
        {counts.urgent > 0 && (
          <div className="flex items-center gap-xs.5 px-sm py-1.5 rounded-lg bg-orange-50 text-orange-700">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            30일 이내 {counts.urgent}
          </div>
        )}
        {counts.expired === 0 && counts.urgent === 0 && (
          <div className="text-sm text-muted-foreground">최근 제품 기준 만료·30일 이내 제품 없음.</div>
        )}
      </div>

      {/* Sections: 접종 / 구충 */}
      {sections.map(({ section, categories }) => (
        <div key={section} className="space-y-3">
          <h2 className="text-base font-semibold border-b border-border pb-1">{section}</h2>
          {categories.map(([categoryLabel, list]) => (
            <div key={categoryLabel} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-md py-2 text-sm font-medium">{categoryLabel}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-md py-2 font-medium">제품명</th>
                    <th className="text-left px-md py-2 font-medium">제조사</th>
                    <th className="text-left px-md py-2 font-medium">Batch</th>
                    <th className="text-left px-md py-2 font-medium">만료일</th>
                    <th className="text-left px-md py-2 font-medium">상태</th>
                    <th className="text-left px-md py-2 font-medium">기준</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                      <td className="px-md py-2">{p.displayName}</td>
                      <td className="px-md py-2 text-muted-foreground">{p.manufacturer}</td>
                      <td className="px-md py-2 font-mono text-xs">{p.batch ?? '—'}</td>
                      <td className="px-md py-2 text-muted-foreground">{p.expiry ?? '—'}</td>
                      <td className="px-md py-2"><StatusBadge status={p.status} daysLeft={p.daysLeft} /></td>
                      <td className="px-md py-2 text-xs text-muted-foreground">{p.meta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
