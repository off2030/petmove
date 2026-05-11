import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Monorepo root — Vercel 의 serverless 함수가 packages/* 를 번들에 포함하도록.
  // 누락 시 dynamic import('@petmove/auth/server') 같은 호출이 런타임에 모듈 못 찾아
  // 500 (Server Components render 실패). admin 은 apps/admin 이라 두 단계 위가 root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // workspace 패키지(.ts 직접 export)를 Next 가 트랜스파일·watch 하도록 명시.
  // 누락 시 monorepo + Windows 환경에서 hot reload 가 변경을 못 잡는 경우가 있음.
  transpilePackages: ['@petmove/auth', '@petmove/domain', '@petmove/ui'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // PDF 생성 서버 액션이 동적 경로로 읽는 바이너리 자산을 Vercel serverless
  // 함수 번들에 포함. Next.js 기본 file tracer 는 dynamic readFile 경로를
  // 놓치므로 명시해 줘야 배포 환경에서 템플릿/폰트/서명 이미지를 찾을 수 있다.
  outputFileTracingIncludes: {
    '/api/pdf': [
      './data/pdf-templates/**/*',
      './data/pdf-field-mappings.json',
      './data/fonts/**/*',
      './public/signatures/**/*',
    ],
  },
}

export default withSentryConfig(nextConfig, {
  org: 'petmove',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
})
