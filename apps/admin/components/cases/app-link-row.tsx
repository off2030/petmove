'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/ui/section-label'
import { getCaseAppLink, type CaseAppLinkInfo } from '@/lib/actions/case-app-link'

/**
 * 고객정보 섹션 마지막 줄 — "이 고객이 펫무브 고객앱에 연결돼 있나?"
 *
 * 케이스 소유권은 이메일이 아니라 case_customer_links 의 user_id 로 고정돼 있어서
 * 상세의 이메일 필드만 봐서는 알 수 없다(관리자가 서류용 이메일로 고쳐도 링크는 유지).
 * 연결돼 있으면 실제 로그인 계정(이메일·로그인 수단·연결 경로·최근 로그인)을,
 * 아니면 같은 이메일로 가입한 계정이 있는지까지 보여준다.
 */

const PROVIDER_LABEL: Record<string, string> = {
  google: '구글',
  apple: '애플',
  kakao: '카카오',
  naver: '네이버',
  email: '이메일',
}

const VIA_LABEL: Record<string, string> = {
  'share-token': '링크 수락',
  'email-match': '이메일 자동',
  'phone-match': '전화 자동',
  manual: '수동 연결',
}

/** '2026-06-27T…' → '26.06.27' */
function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : null
}

export function AppLinkRow({ caseId }: { caseId: string }) {
  // 결과에 caseId 를 함께 담아 둔다 — 케이스를 바꿨을 때 effect 안에서 다시 setState 로
  // 로딩 상태를 되돌리지 않아도, 아래 비교 한 줄로 옛 케이스 결과가 자동 무효화된다.
  const [loaded, setLoaded] = useState<{ caseId: string; info: CaseAppLinkInfo | null } | null>(null)
  const current = loaded?.caseId === caseId ? loaded : null
  const state: 'loading' | 'ready' | 'error' =
    !current ? 'loading' : current.info ? 'ready' : 'error'
  const info = current?.info ?? null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await getCaseAppLink(caseId)
      if (cancelled) return
      setLoaded({ caseId, info: r.ok ? r.value : null })
    })()
    return () => { cancelled = true }
  }, [caseId])

  const connected = (info?.accounts.length ?? 0) > 0

  return (
    <div
      data-field="app_link"
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0"
    >
      <SectionLabel className="pt-1">앱 연결</SectionLabel>

      <div className="min-w-0 pt-0.5 text-[14px]">
        {state === 'loading' && (
          <span className="text-muted-foreground/50">확인 중…</span>
        )}

        {state === 'error' && (
          <span className="text-muted-foreground/60">연결 상태를 불러오지 못했습니다</span>
        )}

        {state === 'ready' && info && (
          <div className="flex flex-col gap-1.5">
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px]',
                connected
                  ? 'bg-pmw-positive/12 text-pmw-positive'
                  : info.emailCandidates > 0
                    ? 'bg-pmw-warning/15 text-pmw-warning'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              <Smartphone className="h-3.5 w-3.5" />
              {connected
                ? `연결됨${info.accounts.length > 1 ? ` · ${info.accounts.length}명` : ''}`
                : '미연결'}
            </span>

            {connected &&
              info.accounts.map((a) => {
                const parts = [
                  a.provider ? (PROVIDER_LABEL[a.provider] ?? a.provider) : null,
                  VIA_LABEL[a.linkedVia] ?? a.linkedVia,
                  shortDate(a.linkedAt) ? `${shortDate(a.linkedAt)} 연결` : null,
                  shortDate(a.lastSignInAt) ? `최근 로그인 ${shortDate(a.lastSignInAt)}` : null,
                ].filter(Boolean) as string[]
                return (
                  <div key={a.userId} className="min-w-0">
                    <div className="truncate text-foreground">
                      {a.loginEmail ?? '(이메일 없음)'}
                      {a.displayName && (
                        <span className="ml-1.5 text-muted-foreground">{a.displayName}</span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground/70">
                      {parts.join(' · ')}
                    </div>
                  </div>
                )
              })}

            {!connected && info.emailCandidates > 0 && (
              <span className="text-[12.5px] text-muted-foreground">
                이 케이스 이메일로 가입한 계정이 {info.emailCandidates}개 있는데 연결돼 있지 않습니다 — 수동 연결 필요
              </span>
            )}

            {!connected && info.emailCandidates === 0 && (
              <span className="text-[12.5px] text-muted-foreground/70">
                {info.caseEmail
                  ? '아직 이 이메일로 고객앱에 가입하지 않았습니다'
                  : '케이스에 이메일이 없어 자동 연결이 안 됩니다'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
