import { CaseSwitcher } from '@/components/portal-shell/case-switcher'

/**
 * 케이스 컨텍스트 layout — 4탭 페이지(journey/docs/info)가 이 아래에 들어옴.
 *
 * 데이터 fetch 는 상위 (authed) 레이아웃에서 한 번만 — CaseDataProvider 가 Context 로 공유.
 * 여기는 서버 fetch 없이 CaseSwitcher 만 렌더 → 케이스 전환 시 RSC payload 가 거의 비어
 * 라우터 캐시 만료/miss 시에도 즉시 전환.
 *
 * id 검증은 페이지 컴포넌트가 useCase(id) 결과로 처리 (없으면 notFound).
 */
export default async function CaseLayout({
  children,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  return (
    <>
      <CaseSwitcher />
      {children}
    </>
  )
}
