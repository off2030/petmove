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

  const hasAny =
    !!report &&
    (report.places.some((pl) => pl.impressions > 0) || report.guideLinks.length > 0)

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
      ) : !hasAny ? (
        <p className="py-2 font-serif italic text-[13px] text-muted-foreground">
          아직 노출 기록이 없습니다.
        </p>
      ) : (
        <>
          {/* 자리별로 나눠 본다 — 같은 안내라도 여정 카드와 안내 페이지는 반응이 다르다. */}
          {report.places.map((pl) => {
            const clicks = pl.partners.reduce((n, p) => n + p.tel + p.mail + p.web, 0)
            const rate =
              pl.impressionUsers > 0
                ? Math.round((pl.clickUsers / pl.impressionUsers) * 100)
                : null
            return (
              <section key={pl.key} className="pt-sm first:pt-0">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  {pl.label}
                </h3>

                {pl.impressions === 0 ? (
                  <p className="py-1 font-serif italic text-[13px] text-muted-foreground">
                    아직 기록이 없습니다.
                  </p>
                ) : (
                  <>
                    <p className="py-1 text-[13px] leading-relaxed text-foreground">
                      본 <span className="font-mono tabular-nums">{pl.impressionUsers}</span>명 중{' '}
                      <span className="font-mono tabular-nums">{pl.clickUsers}</span>명이 연락을
                      눌렀어요
                      {rate !== null && <span className="text-muted-foreground"> ({rate}%)</span>}.
                    </p>
                    <p className="pb-sm text-[12px] text-muted-foreground">
                      View <span className="font-mono tabular-nums">{pl.impressions}</span>회 · 클릭{' '}
                      <span className="font-mono tabular-nums">{clicks}</span>회
                    </p>

                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                          <th className="py-1 text-left font-mono font-normal">업체</th>
                          <th className="py-1 text-right font-mono font-normal">전화</th>
                          <th className="py-1 text-right font-mono font-normal">메일</th>
                          <th className="py-1 text-right font-mono font-normal">문의</th>
                          <th className="py-1 text-right font-mono font-normal">사람</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pl.partners.map((p) => (
                          <tr key={p.slug} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 text-foreground">{p.name}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums">{p.tel}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums">{p.mail}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums">{p.web}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                              {p.users}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </section>
            )
          })}

          {/* 여정 카드의 한 줄 안내 → 운송업체 페이지. 업체를 지목하지 않는 내부 링크라
              업체별 표에 넣을 수 없다. 어느 카드가 수요를 끌었는지가 핵심이라 카드별로 나눈다. */}
          {report.guideLinks.length > 0 && (
            <section className="pt-sm">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                여정 카드 → 운송업체 문의 버튼
              </h3>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                    <th className="py-1 text-left font-mono font-normal">카드</th>
                    <th className="py-1 text-right font-mono font-normal">View</th>
                    <th className="py-1 text-right font-mono font-normal">클릭</th>
                    <th className="py-1 text-right font-mono font-normal">사람</th>
                  </tr>
                </thead>
                <tbody>
                  {report.guideLinks.map((g) => (
                    <tr key={g.stepId} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 text-foreground">{g.label}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{g.impressions}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{g.clicks}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {g.users}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

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
