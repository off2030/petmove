// 오프라인 폴백 — 네트워크 끊김 + 캐시도 없을 때 service worker 가 이 페이지 반환.
// 정적 마크업만 (서버/DB 호출 X) — SW install 시 미리 캐시되어야 하므로.
import { LogoMark } from '@/components/portal-shell/logo-mark'
import { ReloadButton } from './reload-button'

export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
      <div className="max-w-sm px-md text-center font-serif">
        <div className="mb-md inline-flex justify-center">
          <LogoMark size={64} />
        </div>
        <h1 className="mb-sm text-[20px] font-medium">오프라인입니다</h1>
        <p className="mb-md text-[14px] text-foreground/60 leading-relaxed">
          네트워크 연결이 없어 이 페이지를 불러올 수 없습니다.
          <br />
          연결을 확인하고 다시 시도하세요.
        </p>
        <ReloadButton />
      </div>
    </div>
  )
}
