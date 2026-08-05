import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// package.json 의 version 을 클라이언트에 노출 — 설정 > 앱 정보 행에서 표시.
const require = createRequire(import.meta.url)
const pkgVersion = require('./package.json').version
// 빌드 시점의 git short SHA — 설정 > 앱 정보 의 부제(베타 단계 버그 신고용).
// Vercel 환경에서는 VERCEL_GIT_COMMIT_SHA 가 자동 제공, 로컬은 git rev-parse fallback.
const gitSha = (() => {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return '' }
})()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 검증용 dev 서버를 기존 dev 서버와 동시에 띄울 때 .next 디렉터리 충돌(락·캐시 오염)
  // 을 피하기 위한 격리 스위치 — 평소(미설정)엔 기본 .next 그대로.
  ...(process.env.PM_DIST_DIR ? { distDir: process.env.PM_DIST_DIR } : {}),
  // 같은 와이파이의 실기기(폰)에서 dev 서버 접속 허용 — 없으면 Next 가 localhost 외
  // origin 의 /_next/* 요청을 차단해 페이지가 겉만 뜨고 JS 가 죽는다(버튼 무반응).
  // 프로덕션 빌드에는 영향 없음. PC IP 대역이 바뀌면(다른 와이파이) 여기에 추가.
  //   172.30.1.* = 직장, 192.168.45.* = 집(SK), 나머지 = 흔한 공유기 기본 대역.
  allowedDevOrigins: [
    '172.30.1.*',
    '192.168.45.*',
    '192.168.0.*',
    '192.168.1.*',
    '192.168.35.*',
    '10.0.0.*',
  ],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkgVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha,
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
    //
    // dynamic 을 길게(30분) 잡는다 — 잎 페이지는 전부 client 컴포넌트라 RSC payload 에
    // stale 될 데이터가 없다(cases·profile 은 CaseDataProvider 메모리에서 읽고, today 같은
    // 값도 매 렌더 라이브 계산). 데이터 신선도는 Realtime push + focus/visibility refetch +
    // mutation 후 명시적 refresh 가 책임진다. 따라서 RSC 캐시가 오래 살아도 stale 위험 0.
    //
    // 120초였을 때의 회귀: CaseDataProvider 의 prefetch 가 prefetchedRef 로 URL 을 1회만
    // 예열하고 재예열하지 않는다 → 120초가 지나 캐시가 식으면 영영 콜드 → "처음엔 빠르다
    // 2분 뒤 다시 느림". 세션 길이(30분)를 넘기게 잡아 그 만료 구간을 없앤다.
    staleTimes: {
      dynamic: 1800,
      static: 300,
    },
  },
  // 정적 자산 (법무 마크다운 등) 을 Vercel serverless 함수 번들에 포함.
  // monorepo 외부 경로(../../docs) 는 Next 의 기본 file tracer 가 못 잡아서 명시.
  outputFileTracingIncludes: {
    '/terms': ['../../docs/legal/terms.md'],
    '/privacy': ['../../docs/legal/privacy.md'],
  },
  // 여정 히어로 사진(public/destinations) — 파일명 그대로 재압축해 교체되는 경우가
  // 있어(2026-07 WebP 전환 때도 그랬음) immutable 은 위험. 7일 fresh + 30일
  // stale-while-revalidate 로 재방문 시 즉시 로드하면서도 교체 반영은 일주일 내로.
  async headers() {
    return [
      {
        source: '/destinations/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
    ]
  },
}

// Sentry 에러 수집 (2026-08-01 도입 — 프로젝트 petmove/portal, admin 과 별도 프로젝트).
// tunnelRoute: 이벤트를 /monitoring 경유로 보내 광고차단·WebView 차단을 우회한다
//   (proxy.ts PUBLIC_PREFIXES 에 등록 — 미인증 POST 허용 필수).
// sourcemaps: SENTRY_AUTH_TOKEN 이 빌드 환경에 없으면 업로드를 조용히 끈다 —
//   Vercel(portal) 에 토큰을 아직 안 넣었고, 없어도 빌드가 실패하면 안 된다.
export default withSentryConfig(nextConfig, {
  org: 'petmove',
  project: 'portal',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
})
