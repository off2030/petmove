import { PageShell, SectionHeader } from '@petmove/ui'

/**
 * Portal 스캐폴딩 placeholder.
 * 실제 홈은 Phase 11.0.7 에서 (anon 토큰 뷰 / 로그인 후 케이스 목록) 구성.
 *   - docs/portal-plan.md
 *   - docs/portal-preview/ (디자인 freeze)
 */
export default function HomePage() {
  return (
    <PageShell title="펫무브">
      <div className="px-sm md:px-lg space-y-md">
        <SectionHeader>준비 중</SectionHeader>
        <p className="font-serif text-[17px] text-muted-foreground leading-relaxed max-w-prose">
          반려동물 해외 출국 보호자 셀프서비스 — 곧 만나뵙겠습니다.
        </p>
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-foreground/70">
          @petmove/portal · scaffold
        </p>
      </div>
    </PageShell>
  )
}
