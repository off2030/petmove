import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo root — Vercel 의 serverless 함수가 packages/* 를 번들에 포함하도록.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // workspace 패키지(.ts 직접 export)를 Next 가 트랜스파일·watch 하도록 명시.
  transpilePackages: ['@petmove/auth', '@petmove/domain', '@petmove/ui'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // 클라이언트 라우터 캐시 TTL. 4탭 스와이프 전환을 즉시화.
    // dynamic 페이지는 기본 0초 (매 진입마다 서버 왕복) — 30초로 늘리면 prefetch 된
    // 인접 탭이 캐시에 머물러 스와이프가 즉시 전환.
    // mutation 은 server action 의 revalidatePath 가 캐시 무효화 → stale 없음.
    // admin 측 변경은 최대 30초 stale 가능 (앱 재진입·새로고침·router.refresh 면 즉시).
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  // 정적 자산 (법무 마크다운 등) 을 Vercel serverless 함수 번들에 포함.
  // monorepo 외부 경로(../../docs) 는 Next 의 기본 file tracer 가 못 잡아서 명시.
  outputFileTracingIncludes: {
    '/terms': ['../../docs/legal/terms.md'],
    '/privacy': ['../../docs/legal/privacy.md'],
  },
}

export default nextConfig
