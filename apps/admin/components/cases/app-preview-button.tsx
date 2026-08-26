'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCaseAppLink, type CaseAppLinkInfo } from '@/lib/actions/case-app-link'

/**
 * 상세 상단 툴바의 "펫무브 앱 미리보기" 버튼.
 *
 * 아이콘 색이 곧 앱 연결 상태다 — 초록이면 이 고객이 펫무브 앱에 연결돼 있고(케이스가
 * 실제 로그인 계정에 물려 있음), 앰버면 같은 이메일로 가입한 계정은 있는데 링크가 없고,
 * 회색이면 미연결. 소유권은 case_customer_links.user_id 로 고정돼 있어(A안) 상세의
 * 이메일 필드만 봐서는 알 수 없기 때문에 여기서 알려준다. 자세한 계정 정보는 툴팁.
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

/** 툴팁 본문 — 버튼 제목 아래에 붙일 연결 상태 설명. */
function statusLines(info: CaseAppLinkInfo | null): string[] {
  if (!info) return ['앱 연결 상태 확인 중…']
  if (info.accounts.length === 0) {
    if (info.emailCandidates > 0) {
      return [`앱 미연결 — 같은 이메일로 가입한 계정 ${info.emailCandidates}개 있음 (수동 연결 필요)`]
    }
    return [
      info.caseEmail
        ? '앱 미연결 — 아직 이 이메일로 펫무브 앱에 가입하지 않았습니다'
        : '앱 미연결 — 케이스에 이메일이 없어 자동 연결이 안 됩니다',
    ]
  }
  const head = `앱 연결됨${info.accounts.length > 1 ? ` · ${info.accounts.length}명` : ''}`
  const rows = info.accounts.map((a) => {
    const meta = [
      a.provider ? (PROVIDER_LABEL[a.provider] ?? a.provider) : null,
      VIA_LABEL[a.linkedVia] ?? a.linkedVia,
      shortDate(a.linkedAt) ? `${shortDate(a.linkedAt)} 연결` : null,
      shortDate(a.lastSignInAt) ? `최근 로그인 ${shortDate(a.lastSignInAt)}` : null,
    ].filter(Boolean) as string[]
    const who = [a.loginEmail ?? '(이메일 없음)', a.displayName].filter(Boolean).join(' · ')
    return `• ${who}\n  ${meta.join(' · ')}`
  })
  return [head, ...rows]
}

export function AppPreviewButton({ caseId, onOpen }: { caseId: string; onOpen: () => void }) {
  // 결과에 caseId 를 함께 담아 둔다 — 케이스를 바꿨을 때 effect 안에서 다시 setState 로
  // 로딩 상태를 되돌리지 않아도, 아래 비교 한 줄로 옛 케이스 결과가 자동 무효화된다.
  const [loaded, setLoaded] = useState<{ caseId: string; info: CaseAppLinkInfo | null } | null>(null)
  const info = loaded?.caseId === caseId ? loaded.info : null

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
  const pending = !connected && (info?.emailCandidates ?? 0) > 0
  const title = ['펫무브 앱 미리보기', '', ...statusLines(info)].join('\n')

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label="펫무브 앱 미리보기"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        connected
          ? 'text-pmw-positive hover:bg-pmw-positive/12'
          : pending
            ? 'text-pmw-warning hover:bg-pmw-warning/15'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Smartphone className="h-3.5 w-3.5" />
    </button>
  )
}
