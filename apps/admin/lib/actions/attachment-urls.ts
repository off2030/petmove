'use server'

import { createClient } from '@petmove/auth/server'

const SIGN_TTL_SECONDS = 60 * 60

/**
 * 케이스 첨부파일(또는 메모 첨부) 경로 배열을 받아 signed URL 매핑을 반환.
 * RLS 정책 (storage.objects + cases) 이 접근 제어를 담당하므로 인증된 server client 사용.
 * 권한 없는 path 는 결과 맵에서 빠짐 (예외 X). 호출자는 누락된 path 를 그대로 처리.
 */
export async function signAttachmentUrls(
  paths: string[],
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
    if (item.signedUrl && item.path) out[item.path] = item.signedUrl
  }
  return out
}
