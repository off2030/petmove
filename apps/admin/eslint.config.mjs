import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // JSX 텍스트 안의 따옴표/아포스트로피는 모던 React 에서 동작 무관 — false positive 노이즈
      'react/no-unescaped-entities': 'off',
      // _ 접두사 = "의도적 미사용" 관례. catch (e) 도 무시.
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
      // React 19 새 룰. 대부분의 위반은 의도된 패턴 (SSR-safe localStorage init,
      // caseId 전환 시 리셋, ref.focus() 등) 이라 일괄 fix 가 위험·효과 작음.
      // error → warn 으로 강등하여 CI 막지 않게 두고, 실제 핫스팟은 React
      // Profiler 로 측정해 핀포인트 정리.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'scripts/**',
    'supabase/**',
    'public/sw.js',
  ]),
])

export default eslintConfig
