import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@petmove/auth/server'
import { PageShell, SectionHeader } from '@petmove/ui'

export const dynamic = 'force-dynamic'

/**
 * Portal 진입점.
 *   - 로그인된 보호자 → /journey (4탭 셸).
 *   - 비로그인 → 간단 안내 + 로그인/신청 링크.
 *
 * proxy.ts 가 `/` 는 항상 public 으로 통과시키므로 분기는 여기서.
 */
export default async function HomePage() {
  const supabase = await createClient()
  let userId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    userId = null
  }
  if (userId) redirect('/journey')

  return (
    <PageShell title="펫무브">
      <div className="px-sm md:px-lg space-y-md">
        <SectionHeader>반려동물 해외 출국</SectionHeader>
        <p className="font-serif text-[17px] text-muted-foreground leading-relaxed max-w-prose">
          보호자 셀프서비스 — 신청부터 출국까지 한 손에.
        </p>
        <div className="flex gap-sm pt-md">
          <Link
            href="/login"
            className="px-md py-sm rounded-full bg-primary text-primary-foreground text-[14px] font-medium"
          >
            로그인
          </Link>
          <Link
            href="/apply"
            className="px-md py-sm rounded-full border border-border text-[14px] font-medium"
          >
            신청서 작성
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
