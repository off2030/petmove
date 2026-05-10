/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // workspace 패키지(.ts 직접 export)를 Next 가 트랜스파일·watch 하도록 명시.
  // 누락 시 monorepo + Windows 환경에서 hot reload 가 변경을 못 잡는 경우가 있음.
  transpilePackages: ['@petmove/domain', '@petmove/ui'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
}

export default nextConfig
