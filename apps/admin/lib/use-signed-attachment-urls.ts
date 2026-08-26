'use client'

import { useEffect, useState } from 'react'
import { signAttachmentUrls } from '@/lib/actions/attachment-urls'

/**
 * 서명 URL 재발급 주기 — 서명 TTL(attachment-urls.ts SIGN_TTL_SECONDS = 1시간)의 절반.
 * 여유를 절반이나 두는 이유는 절전·백그라운드로 타이머가 밀릴 수 있어서다.
 */
const REFRESH_MS = 30 * 60 * 1000

/** 첨부가 없을 때 돌려줄 빈 맵 — 매 렌더 새 객체를 만들지 않도록 상수로 고정. */
const EMPTY_URLS: Record<string, string> = {}

/**
 * 케이스 첨부의 path → signed URL 맵을 발급하고, 만료 전에 자동 갱신한다.
 *
 * WHY: 예전에는 컴포넌트 마운트 때 한 번만 발급했다. 서명 TTL 은 1시간인데 운영자는
 * 케이스 상세를 하루 종일 열어두므로, 한 시간이 지나면 링크가 전부 죽어 파일을 눌러도
 * `{"error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}` 만 떴다.
 * 파일·스토리지는 멀쩡한데 첨부가 유실된 것처럼 보여 원인 추적이 어려웠다
 * (2026-08-26 홍소영/토비 — 제출 3건 정상 업로드, 링크만 만료).
 *
 * 갱신은 두 겹이다:
 *   · 주기 타이머 — 탭이 계속 떠 있는 평상시 경로.
 *   · 복귀 이벤트(visibilitychange·focus) — 절전·백그라운드에서 타이머가 멈추거나
 *     스로틀되면 주기만으로는 만료를 못 막는다. 깨어난 시점에 경과를 직접 확인한다.
 *
 * @param caseId  케이스 id — 케이스가 바뀌면 이전 맵을 버린다.
 * @param files   첨부 목록. 배열 아이덴티티가 아니라 내용으로 비교하므로 호출부에서
 *                매 렌더 새 배열을 만들어도 재발급이 일어나지 않는다.
 */
export function useSignedAttachmentUrls(
  caseId: string,
  files: { path: string; name: string }[],
): Record<string, string> {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  // 목록을 직렬화해 그대로 deps 로 쓴다 — 배열을 넣으면 매 렌더 재발급, 개수만 쓰면
  // 같은 개수의 교체(삭제+추가)를 놓친다. 첨부는 케이스당 소수라 직렬화 비용은 무시할 수준.
  const serialized = JSON.stringify(files.map((f) => [f.path, f.name]))

  useEffect(() => {
    const list = (JSON.parse(serialized) as [string, string][]).map(([path, name]) => ({ path, name }))
    // 첨부 0건이면 발급할 것도 비울 것도 없다 — 반환값에서 빈 맵으로 덮는다(아래).
    if (list.length === 0) return
    const paths = list.map((f) => f.path)
    // path → 표시명: 다운로드 시 storage safeName(한글→'_') 대신 업로드명을 쓰도록.
    const names: Record<string, string> = {}
    for (const f of list) names[f.path] = f.name

    let cancelled = false
    let signedAt = 0
    let pending = false

    const sign = () => {
      if (pending) return
      pending = true
      signAttachmentUrls(paths, names)
        .then((map) => {
          if (cancelled) return
          signedAt = Date.now()
          setSignedUrls(map)
        })
        .catch(() => {})
        .finally(() => { pending = false })
    }
    sign()

    const timer = setInterval(sign, REFRESH_MS)
    const onWake = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - signedAt < REFRESH_MS) return
      sign()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [caseId, serialized])

  // 첨부가 사라진 직후에는 이전 맵이 남아 있을 수 있어 여기서 빈 맵으로 덮는다.
  // (경로가 `{caseId}/...` 라 케이스가 바뀌어도 옛 URL 이 조회될 일은 없다.)
  return files.length === 0 ? EMPTY_URLS : signedUrls
}
