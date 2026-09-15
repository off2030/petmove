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
 * 운송업체 검색 통계 — 협상용 성적표.
 *
 * 채널(앱·홈페이지)이 기둥이다. 두 곳은 구조가 같지만(글·카드의 링크 → 안내 페이지)
 * 맥락이 달라 합치면 어느 쪽이 통했는지 알 수 없다.
 *
 * 각 채널은 깔때기 순서로 읽는다: 링크 노출 → 클릭 → 업체 목록 봄 → 업체 연락.
 * '업체 목록 봄'은 클릭과 겹쳐 보이지만 다른 걸 잰다 — 페이지에 들어와 **목록까지 실제로
 * 화면에 띄운** 경우만이다(클릭하고 바로 나가면 빠진다). 홈페이지는 안내 페이지가 검색
 * 유입이 있는 공개 글이라 클릭 없이 생기는 노출이 따로 있고, 그 차이를 '직접 방문'으로
 * 따로 보여준다.
 *
 * 빈 칸은 그리지 않는다 — 연락 0건이면 업체 표를, 나라가 안 잡히면 나라별 줄을, 사람 수가
 * 없으면(홈페이지는 로그인이 없다) 사람 열을 뺀다. 0 만 늘어선 표는 읽는 사람을 지치게 한다.
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
  // 링크를 안 누르고 안내 페이지에 닿은 몫 — 홈페이지는 검색 유입, 앱은 주소로 직접 들어온
  // 경우다. 음수가 나올 수 있다(클릭하고 목록까지 안 내려간 사람이 더 많을 때) — 그땐 안 쓴다.
  const direct = ch.page.impressions - ch.entry.clicks

  return (
    <section className="pt-md first:pt-0">
      <h3 className="font-serif text-[15px] text-foreground">{ch.label}</h3>
      <p className="pb-1 font-mono text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
        {ch.entryLabel} → 안내 페이지
      </p>

      {empty ? (
        <p className="py-1 font-serif italic text-[13px] text-muted-foreground">
          아직 기록이 없습니다.
        </p>
      ) : (
        <>
          <dl className="py-1 text-[13px]">
            <Step
              label="링크 노출"
              count={ch.entry.impressions}
              users={hasUsers ? ch.entry.impressionUsers : null}
            />
            {/* 클릭은 홈페이지에서만 보여준다. 앱은 누르면 곧바로 안내 페이지라 '업체 목록 봄'과
                같은 사건인데, 클릭 쪽이 더 잘 깨진다(이동과 경쟁 — 2026-08-27 유실). 같은 걸 두 번
                재면서 덜 믿음직한 쪽을 화면에 둘 이유가 없다. 홈페이지는 다르다: 안내 페이지가
                검색 유입이 있는 공개 글이라, **어느 글이 끌어왔는지는 클릭에만 남는다.**
                수집은 양쪽 다 계속한다 — 기록이 있어야 나중에 되짚는다. */}
            {ch.key === 'www' && (
              <Step
                label="링크 클릭"
                count={ch.entry.clicks}
                users={hasUsers ? ch.entry.clickUsers : null}
                pct={rate(ch.entry.clicks, ch.entry.impressions)}
              />
            )}
            <Step
              label="업체 목록 봄"
              count={ch.page.impressions}
              users={hasUsers ? ch.page.impressionUsers : null}
              pct={ch.key === 'app' ? rate(ch.page.impressions, ch.entry.impressions) : null}
              note={direct > 0 ? `직접 방문 ${direct}` : null}
            />
            <Step
              label="업체 연락"
              count={contacts}
              users={hasUsers ? ch.page.clickUsers : null}
              pct={rate(contacts, ch.page.impressions)}
            />
          </dl>

          {/* 어느 목적지가 끌어왔나 — 협상에서 제일 쓰이는 쪼갬. 화물 전용국(호주·뉴질랜드·
              남아공)은 운송업체가 필수고 동반 가능국(일본·EU)은 선택이라, 합쳐 놓으면 둘 다
              흐려진다. 카드별(항공권 구매·수입 허가…) 쪼갬은 화면에서 뺐다 — 어느 화면에서
              눌렀나보다 어느 나라 고객이 찾았나가 협상 문장이 된다(기록은 그대로 쌓인다).
              홈페이지 기록에는 목적지가 없어(글은 나라를 특정하지 않는다) 글별 표를 쓴다. */}
          {ch.byDestination.some((d) => d.destination !== '(미지정)') && (
            <table className="mt-sm w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  <th className="py-1 text-left font-mono font-normal">목적지</th>
                  <th className="py-1 text-right font-mono font-normal">노출</th>
                  <th className="py-1 text-right font-mono font-normal">목록</th>
                  <th className="py-1 text-right font-mono font-normal">연락</th>
                </tr>
              </thead>
              <tbody>
                {ch.byDestination.map((d) => (
                  <tr key={d.destination} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-foreground">{d.destination}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{d.impressions}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{d.pageViews}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{d.contacts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 글별 — 홈페이지 전용. 어느 가이드 글이 운송업체로 보냈나는 클릭에만 남는다. */}
          {ch.key === 'www' && ch.entry.rows.length > 0 && (
            <table className="mt-sm w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  <th className="py-1 text-left font-mono font-normal">{ch.entryLabel}</th>
                  <th className="py-1 text-right font-mono font-normal">노출</th>
                  <th className="py-1 text-right font-mono font-normal">클릭</th>
                </tr>
              </thead>
              <tbody>
                {ch.entry.rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-foreground">{r.label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.impressions}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 업체별 연락 — 한 건도 없으면 0 만 늘어선 표라 그리지 않는다. */}
          {contacts > 0 && (
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
  note,
}: {
  label: string
  count: number
  users: number | null
  pct?: string | null
  /** 이 단계에만 붙는 짧은 주석 — 예: 링크를 안 거치고 들어온 몫. */
  note?: string | null
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        <Num>{count}</Num>회
        {users !== null && <span className="text-muted-foreground"> · {users}명</span>}
        {pct && <span className="text-muted-foreground"> ({pct})</span>}
        {note && <span className="text-muted-foreground/70"> · {note}</span>}
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
        <h2 className="font-serif text-[17px] text-foreground">운송업체 검색 통계</h2>
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

        </>
      )}
    </div>
  )
}
