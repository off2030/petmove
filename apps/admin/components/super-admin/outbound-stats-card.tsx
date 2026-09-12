'use client'

import { useEffect, useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getOutboundReport,
  type OutboundChannel,
  type OutboundReport,
} from '@/lib/actions/outbound-report'

/**
 * 운송업체 안내 반응 — 협상용 성적표.
 *
 * 읽는 방향은 **깔때기 순서**다: 링크 노출 → 링크 클릭 → 안내 페이지 → 업체 연락.
 * 예전엔 안내 페이지가 위, 그 페이지로 들어오는 입구가 맨 아래에 있어서 거꾸로 읽혔다.
 *
 * 채널(앱·홈페이지)로 먼저 가른다 — 두 곳은 구조가 같지만(글·카드의 링크 → 안내 페이지)
 * 맥락이 달라 합치면 어느 쪽이 통했는지 알 수 없다. 홈페이지는 로그인 개념이 없어 사람
 * 수가 없다(0 이면 사람 열을 그리지 않는다).
 */

const RANGES = [14, 30, 90] as const

/** 두 단계 사이의 전환율 — 분모가 0 이면 보여줄 게 없다. */
function rate(top: number, bottom: number): string | null {
  if (bottom <= 0) return null
  return `${Math.round((top / bottom) * 100)}%`
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>
}

function ChannelBlock({ ch }: { ch: OutboundChannel }) {
  const hasUsers = ch.entry.impressionUsers > 0 || ch.page.impressionUsers > 0
  const contacts = ch.page.partners.reduce((n, p) => n + p.tel + p.mail + p.web, 0)
  const empty = ch.entry.impressions === 0 && ch.entry.clicks === 0 && ch.page.impressions === 0

  return (
    <section className="pt-md first:pt-0">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
        {ch.label}
      </h3>

      {empty ? (
        <p className="py-1 font-serif italic text-[13px] text-muted-foreground">
          아직 기록이 없습니다.
        </p>
      ) : (
        <>
          {/* 깔때기 세 줄 — 노출 → 클릭 → 연락. 옆에 바로 앞 단계 대비 전환율. */}
          <dl className="py-1 text-[13px]">
            <Step
              label={`${ch.entryLabel} 링크 노출`}
              count={ch.entry.impressions}
              users={hasUsers ? ch.entry.impressionUsers : null}
            />
            <Step
              label="링크 클릭 → 안내 페이지"
              count={ch.entry.clicks}
              users={hasUsers ? ch.entry.clickUsers : null}
              pct={rate(ch.entry.clicks, ch.entry.impressions)}
            />
            <Step
              label="안내 페이지 노출"
              count={ch.page.impressions}
              users={hasUsers ? ch.page.impressionUsers : null}
            />
            <Step
              label="업체 연락"
              count={contacts}
              users={hasUsers ? ch.page.clickUsers : null}
              pct={rate(contacts, ch.page.impressions)}
            />
          </dl>

          {/* 어느 카드·글이 끌어왔나 — 유입 자리별로. */}
          {ch.entry.rows.length > 0 && (
            <table className="mt-sm w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  <th className="py-1 text-left font-mono font-normal">{ch.entryLabel}</th>
                  <th className="py-1 text-right font-mono font-normal">노출</th>
                  <th className="py-1 text-right font-mono font-normal">클릭</th>
                  {hasUsers && <th className="py-1 text-right font-mono font-normal">사람</th>}
                </tr>
              </thead>
              <tbody>
                {ch.entry.rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-foreground">{r.label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.impressions}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.clicks}</td>
                    {hasUsers && (
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {r.users}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 업체별 연락 — 안내 페이지에만 연락 버튼이 있으므로 여기 한 표뿐. */}
          {ch.page.impressions > 0 && (
            <table className="mt-sm w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  <th className="py-1 text-left font-mono font-normal">업체</th>
                  <th className="py-1 text-right font-mono font-normal">전화</th>
                  <th className="py-1 text-right font-mono font-normal">메일</th>
                  <th className="py-1 text-right font-mono font-normal">문의</th>
                  {hasUsers && <th className="py-1 text-right font-mono font-normal">사람</th>}
                </tr>
              </thead>
              <tbody>
                {ch.page.partners.map((p) => (
                  <tr key={p.slug} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-foreground">{p.name}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{p.tel}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{p.mail}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{p.web}</td>
                    {hasUsers && (
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {p.users}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

function Step({
  label,
  count,
  users,
  pct,
}: {
  label: string
  count: number
  users: number | null
  pct?: string | null
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        <Num>{count}</Num>회
        {users !== null && <span className="text-muted-foreground"> · {users}명</span>}
        {pct && <span className="text-muted-foreground"> ({pct})</span>}
      </dd>
    </div>
  )
}

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
    report.channels.some((c) => c.entry.impressions > 0 || c.entry.clicks > 0 || c.page.impressions > 0)

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
          {report.channels.map((ch) => (
            <ChannelBlock key={ch.key} ch={ch} />
          ))}

          {report.byDestination.length > 0 && (
            <p className="mt-sm text-[12px] leading-relaxed text-muted-foreground">
              {report.byDestination
                .slice(0, 6)
                .map((d) => `${d.destination} ${d.clicks}/${d.impressions}`)
                .join(' · ')}
              <span className="ml-1 text-muted-foreground/60">(업체 연락/링크 노출)</span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
