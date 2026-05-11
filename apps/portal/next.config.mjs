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
  },
  // 정적 자산 (법무 마크다운 등) 을 Vercel serverless 함수 번들에 포함.
  // monorepo 외부 경로(../../docs) 는 Next 의 기본 file tracer 가 못 잡아서 명시.
  outputFileTracingIncludes: {
    '/terms': ['../../docs/legal/terms.md'],
    '/privacy': ['../../docs/legal/privacy.md'],
  },
}

export default nextConfig
