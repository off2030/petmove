/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace 패키지(.ts 직접 export)를 Next 가 트랜스파일·watch 하도록 명시.
  // 누락 시 monorepo + Windows 환경에서 hot reload 가 변경을 못 잡는 경우가 있음.
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
