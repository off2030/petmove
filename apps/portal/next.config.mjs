import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// package.json 의 version 을 클라이언트에 노출 — 설정 > 앱 정보 행에서 표시.
const require = createRequire(import.meta.url)
const pkgVersion = require('./package.json').version

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkgVersion,
  },
  // Monorepo root — Vercel 의 serverless 함수가 packages/* 를 번들에 포함하도록.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // workspace 패키지(.ts 직접 export)를 Next 가 트랜스파일·watch 하도록 명시.
  transpilePackages: ['@petmove/auth', '@petmove/domain', '@petmove/ui'],
  experimental: {
    serverActions: {
      // 케이스 첨부 서류(사진·PDF) 업로드 — FormData 가 server action 본문으로 전달됨.
      bodySizeLimit: '15mb',
    },
    // workspace 패키지를 deep tree-shake — vaccine-lookup, 15개 procedure-checks 등
    // 포털에서 안 쓰는 모듈이 번들에 포함되지 않도록.
    optimizePackageImports: ['@petmove/domain'],
    // 클라이언트 라우터 캐시 TTL. 4탭 스와이프 + 케이스 전환을 즉시화.
    // dynamic 페이지는 기본 0초 (매 진입마다 서버 왕복) — Context 가 데이터 source 역할을
    // 하므로 stale 진입 시에도 UI 는 즉시 (cases 데이터는 Provider 메모리). admin 변경은
    // Supabase Realtime 으로 push, focus/visibility 로 안전망 → stale 위험 없음.
    staleTimes: {
      dynamic: 120,
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
