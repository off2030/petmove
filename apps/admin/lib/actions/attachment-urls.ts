'use server'

import { createClient } from '@petmove/auth/server'

const SIGN_TTL_SECONDS = 60 * 60

/**
 * 케이스 첨부파일(또는 메모 첨부) 경로 배열을 받아 signed URL 매핑을 반환.
 * RLS 정책 (storage.objects + cases) 이 접근 제어를 담당하므로 인증된 server client 사용.
 * 권한 없는 path 는 결과 맵에서 빠짐 (예외 X). 호출자는 누락된 path 를 그대로 처리.
 *
 * names: path → 표시명 맵(옵션). storage 경로는 한글을 '_' 로 치환한 safeName 이라
 * 그대로 다운로드하면 파일명이 '광견병_항체_검사_결과지.jpg' 처럼 깨진다. 표시명이
 * 있으면 signed URL 에 download 쿼리를 붙여 Content-Disposition 파일명을 업로드명과
 * 통일한다. (cross-origin 이라 <a download> 속성은 무시되므로 URL 쿼리로 강제.)
 * createSignedUrls 배치는 download 를 path 별로 지정할 수 없어 직접 덧붙인다.
 */
export async function signAttachmentUrls(
  paths: string[],
  names?: Record<string, string>,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}

  const supabase = await createClient()
  const { data, error } = await supabase
    .storage
    .from('attachments')
    .createSignedUrls(paths, SIGN_TTL_SECONDS)

  if (error || !data) return {}

  const out: Record<string, string> = {}
  for (const item of data) {
    if (!item.signedUrl || !item.path) continue
    const name = names?.[item.path]
    out[item.path] = name
      ? `${item.signedUrl}&download=${encodeURIComponent(name)}`
      : item.signedUrl
  }
  return out
}
