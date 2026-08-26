'use client'

import { useEffect, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOutboundReport, type OutboundReport } from '@/lib/actions/outbound-report'

/**
 * 운송업체 안내 반응 — 고객앱 여정 '운송 예약/항공권 구매' 카드 하단 블록의 성적표.
 *
 * 협상용 문장이 바로 나오게 구성한다: "안내를 본 N명 중 M명이 연락을 눌렀다".
 * 절대 건수는 앱 규모에 묶이지만 비율은 수요의 존재를 증명한다.
 */

const RANGES = [14, 30, 90] as const

export function OutboundStatsCard() {
  const [days, setDays] = useState<number>(14)
  const [report, setReport] = useState<OutboundReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const r = await getOutboundReport(days)
      if (r.ok) {
        setReport(r.value)
        setError(null)
      } else {
        setError(r.error)
      }
    })
  }, [days])

  const totalClicks = report?.partners.reduce((n, p) => n + p.tel + p.mail, 0) ?? 0
  const rate =
    report && report.impressionUsers > 0
      ? Math.round((report.clickUsers / report.impressionUsers) * 100)
      : null

  return (
    <div className="rounded-xl bg-card px-lg pt-md pb-md">
      <div className="flex items-baseline justify-between pb-sm border-b border-border/80 mb-sm">
        <h2 className="font-serif text-[17px] text-foreground">운송업체 안내 반응</h2>
        <div className="flex items-center gap-1.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors',
                days === d
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {d}일
            </button>
          ))}
          <RefreshCw className={cn('h-3 w-3 text-muted-foreground', pending && 'animate-spin')} />
        </div>
      </div>

      {error ? (
        <p className="py-2 text-[13px] text-destructive">{error}</p>
      ) : !report ? (
        <p className="py-2 font-serif italic text-[13px] text-muted-foreground">불러오는 중…</p>
      ) : report.impressions === 0 ? (
        <p className="py-2 font-serif italic text-[13px] text-muted-foreground">
          아직 노출 기록이 없습니다.
        </p>
      ) : (
        <>
          {/* 한 줄 요약 — 협상에서 그대로 쓰는 문장. */}
          <p className="py-1 text-[13px] leading-relaxed text-foreground">
            안내를 본 <span className="font-mono tabular-nums">{report.impressionUsers}</span>명 중{' '}
            <span className="font-mono tabular-nums">{report.clickUsers}</span>명이 연락을 눌렀어요
            {rate !== null && <span className="text-muted-foreground"> ({rate}%)</span>}.
          </p>
          <p className="pb-sm text-[12px] text-muted-foreground">
            노출 <span className="font-mono tabular-nums">{report.impressions}</span>회 · 클릭{' '}
            <span className="font-mono tabular-nums">{totalClicks}</span>회
          </p>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                <th className="py-1 text-left font-mono font-normal">업체</th>
                <th className="py-1 text-right font-mono font-normal">전화</th>
                <th className="py-1 text-right font-mono font-normal">메일</th>
                <th className="py-1 text-right font-mono font-normal">사람</th>
              </tr>
            </thead>
            <tbody>
              {report.partners.map((p) => (
                <tr key={p.slug} className="border-b border-border/40 last:border-0">
                  <td className="py-1.5 text-foreground">{p.name}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{p.tel}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{p.mail}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {p.users}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {report.byDestination.length > 0 && (
            <p className="mt-sm text-[12px] leading-relaxed text-muted-foreground">
              {report.byDestination
                .slice(0, 6)
                .map((d) => `${d.destination} ${d.clicks}/${d.impressions}`)
                .join(' · ')}
              <span className="ml-1 text-muted-foreground/60">(클릭/노출)</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
