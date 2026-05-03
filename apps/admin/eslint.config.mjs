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
