/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 구 Ghost URL 이 전부 `/` 로 끝남 — 슬러그 보존의 핵심. /docs/japan-pet-travel-guide/ 형태 유지.
  trailingSlash: true,
}

export default nextConfig
