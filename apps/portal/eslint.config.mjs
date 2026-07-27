import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // eslint-plugin-react-hooks v7 의 React Compiler 자문 규칙들 — 동작상 문제 없는
      // 기존 코드(이벤트 핸들러 안에서만 읽는 ref, 정적 표시용 Date.now, 렌더 지역 변수
      // 누적 등)에 false-positive 로 걸린다. set-state-in-effect 와 동일하게 'warn' 으로
      // 두어 가시성은 유지하되 CI 를 막지 않는다.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    // PM_DIST_DIR 로 만드는 별도 빌드 디렉터리(.claude/launch.json 의 portal-verify 서버가
    // dev 서버와 .next 를 두고 부딪히지 않게 쓴다). ignore 에 없어서 빌드 산출물이 lint 대상이
    // 됐고, 소스에는 error 가 0건인데 portal eslint 가 실패하고 있었다(2026-07-20).
    // ⚠️ 와일드카드인 이유 — 세션이 늘며 '.next-verify2' 가 생기자 같은 사고가 그대로
    //   재발했다(2026-07-27, error 722건 전부 그 폴더). 접미사가 붙어도 걸리게 둔다.
    //   .gitignore 도 같은 이유로 '.next-verify*/' 로 넓혔다.
    '.next-verify*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
  ]),
])

export default eslintConfig
