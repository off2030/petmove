#!/usr/bin/env tsx
/**
 * 관리자 완료 → 펫무브 앱 푸시 발송 (cron).
 *
 * 펫무브워크에서 관리자가 특정 단계를 완료하면(목적지별 마일스톤), 보호자 앱에 좋은-소식 푸시를
 * 보낸다. 일정 리마인더(기기 로컬 예약)와 달리 이건 서버가 발송하는 서버 푸시(FCM)다.
 *
 * 흐름:
 *   1) 푸시 토큰을 가진 보호자가 링크된, 삭제되지 않은 케이스만 후보로 가져온다.
 *   2) 각 케이스에서 collectMilestonePushes() 로 "지금 완료 상태인" 마일스톤 푸시를 계산
 *      (감지/문구는 앱과 동일 로직 재사용 — apps/portal/lib/journey/milestone-pushes).
 *   3) sent_milestone_pushes 에 key 를 INSERT ON CONFLICT DO NOTHING 으로 '선점'한 경우에만
 *      발송 → 케이스당 1회(크론 중첩에도 정확히 1회). 발송 실패 시 선점 해제 후 다음 회차 재시도.
 *   4) 발송 응답에서 무효(미등록) 토큰은 push_device_tokens 에서 제거(정리).
 *
 * 실행:
 *   pnpm tsx scripts/send-milestone-pushes.ts            # 실제 발송
 *   pnpm tsx scripts/send-milestone-pushes.ts --dry-run  # 발송 없이 대상만 출력(검증용)
 *
 * 필요 env:
 *   SUPABASE_DB_URL       — Supabase Postgres 직접 연결 문자열 (GitHub Actions 비밀 재사용)
 *   FCM_SERVICE_ACCOUNT   — Firebase 서비스 계정 JSON 문자열 (dry-run 에선 불필요)
 */

import pg from 'pg'
import type { CaseRow } from '@petmove/domain'
import { collectMilestonePushes } from '../apps/portal/lib/journey/milestone-pushes'

const DRY_RUN = process.argv.includes('--dry-run')

type FcmMessaging = {
  sendEachForMulticast: (msg: {
    tokens: string[]
    notification: { title: string; body: string }
  }) => Promise<{
    successCount: number
    responses: Array<{ success: boolean; error?: { code?: string } }>
  }>
}

let messagingPromise: Promise<FcmMessaging> | null = null
async function getMessaging(): Promise<FcmMessaging> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const raw = process.env.FCM_SERVICE_ACCOUNT
      if (!raw) throw new Error('FCM_SERVICE_ACCOUNT 환경변수가 필요합니다.')
      const admin = await import('firebase-admin')
      const sa = JSON.parse(raw)
      const app = admin.apps.length
        ? admin.app()
        : admin.initializeApp({ credential: admin.credential.cert(sa) })
      return admin.messaging(app) as unknown as FcmMessaging
    })()
  }
  return messagingPromise
}

/** 발송 결과에서 미등록/무효 토큰을 골라 push_device_tokens 에서 제거. */
async function cleanupInvalidTokens(
  client: pg.Client,
  tokens: string[],
  responses: Array<{ success: boolean; error?: { code?: string } }>,
): Promise<void> {
  const bad: string[] = []
  responses.forEach((r, i) => {
    if (r.success) return
    const code = r.error?.code
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      bad.push(tokens[i])
    }
  })
  if (bad.length) {
    await client.query('delete from push_device_tokens where token = any($1)', [bad])
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) throw new Error('SUPABASE_DB_URL 환경변수가 필요합니다.')

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  let candidates = 0
  let claimed = 0
  let delivered = 0

  try {
    // 1) 푸시 토큰 가진 보호자가 링크된, 삭제 안 된 케이스만.
    const { rows: cases } = await client.query<CaseRow>(`
      select c.*
      from cases c
      where c.deleted_at is null
        and exists (
          select 1
          from case_customer_links ccl
          join push_device_tokens t on t.user_id = ccl.user_id
          where ccl.case_id = c.id
        )
    `)
    candidates = cases.length

    for (const caseRow of cases) {
      const pushes = collectMilestonePushes(caseRow)
      for (const push of pushes) {
        if (DRY_RUN) {
          console.log(`[would send] ${push.key}  →  ${push.body}`)
          claimed++
          continue
        }

        // 3) 선점(이미 보낸 key 면 rowCount 0 → 건너뜀).
        const ins = await client.query(
          'insert into sent_milestone_pushes (key, case_id) values ($1, $2) on conflict (key) do nothing returning key',
          [push.key, caseRow.id],
        )
        if (ins.rowCount === 0) continue
        claimed++

        try {
          // 이 케이스에 링크된 보호자들의 모든 기기 토큰.
          const { rows: toks } = await client.query<{ token: string }>(
            `select distinct t.token
             from push_device_tokens t
             join case_customer_links ccl on ccl.user_id = t.user_id
             where ccl.case_id = $1`,
            [caseRow.id],
          )
          const tokens = toks.map((r) => r.token)
          if (!tokens.length) continue // 토큰 없으면 선점만 남겨 둠(다시 보내지 않음)

          const messaging = await getMessaging()
          const resp = await messaging.sendEachForMulticast({
            tokens,
            notification: { title: push.title, body: push.body },
          })
          delivered += resp.successCount
          await cleanupInvalidTokens(client, tokens, resp.responses)
        } catch (sendErr) {
          // 발송 자체 실패(네트워크/인증 등) → 선점 해제하여 다음 회차에 재시도.
          await client.query('delete from sent_milestone_pushes where key = $1', [push.key])
          throw sendErr
        }
      }
    }
  } finally {
    await client.end()
  }

  console.log(
    `done. candidates=${candidates} ${DRY_RUN ? 'wouldSend' : 'claimed'}=${claimed} delivered=${delivered} dryRun=${DRY_RUN}`,
  )
}

main().catch((e) => {
  console.error('[send-milestone-pushes] 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
