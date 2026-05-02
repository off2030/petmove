import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  // 스킨이 정의하는 색·typography tier 클래스 — 사용처 없어도 항상 생성.
  // 새 컴포넌트가 token 을 쓰려고 하는데 클래스 없는 상황 방지.
  safelist: [
    'text-pmw-text-primary',
    'text-pmw-text-secondary',
    'text-pmw-text-tertiary',
    'text-pmw-text-disabled',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '2000px',
      '4xl': '2560px',
      '5xl': '3200px',
      '6xl': '3840px',
    },
    extend: {
      // Editorial 톤: 폰트 스택 명시 — Tailwind `font-sans`/`font-serif`/`font-mono` 가 여기를 따라감
      fontFamily: {
        sans: ['var(--font-sans)', 'Pretendard', 'var(--font-sans-kr)', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Arial', 'sans-serif'],
        serif: ['var(--font-serif)', 'var(--font-serif-kr)', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['var(--font-mono)', 'Pretendard', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem',
        // 모바일 — iOS HIG 44pt / Android Material 48dp 절충값. min-h-touch / min-w-touch / p-touch 로 사용
        touch: '2.75rem', // 44px
        // safe-area aliases — globals.css :root 에서 정의된 var(--safe-*) 참조
        'safe-t': 'var(--safe-top)',
        'safe-r': 'var(--safe-right)',
        'safe-b': 'var(--safe-bottom)',
        'safe-l': 'var(--safe-left)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary:     { DEFAULT: 'hsl(var(--primary))',     foreground: 'hsl(var(--primary-foreground))' },
        secondary:   { DEFAULT: 'hsl(var(--secondary))',   foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted:       { DEFAULT: 'hsl(var(--muted))',       foreground: 'hsl(var(--muted-foreground))' },
        accent:      { DEFAULT: 'hsl(var(--accent))',      foreground: 'hsl(var(--accent-foreground))' },
        popover:     { DEFAULT: 'hsl(var(--popover))',     foreground: 'hsl(var(--popover-foreground))' },
        card:        { DEFAULT: 'hsl(var(--card))',        foreground: 'hsl(var(--card-foreground))' },
        // PMW semantic 토큰 — 스킨별 다른 색이지만 의미는 동일.
        // bg-pmw-accent/15 같은 opacity modifier 쓰려고 hsl(var()) 래핑.
        'pmw-accent':         { DEFAULT: 'hsl(var(--pmw-accent))',         foreground: 'hsl(var(--pmw-accent-fg))' },
        'pmw-accent-strong':  'hsl(var(--pmw-accent-strong))',
        'pmw-tag':            { DEFAULT: 'hsl(var(--pmw-tag-bg))',         foreground: 'hsl(var(--pmw-tag-fg))' },
        'pmw-cal-today':      'hsl(var(--pmw-cal-today))',
        'pmw-cal-sunday':     'hsl(var(--pmw-cal-sunday))',
        'pmw-cal-saturday':   'hsl(var(--pmw-cal-saturday))',
        'pmw-positive':       'hsl(var(--pmw-positive))',
        'pmw-avatar':         { DEFAULT: 'hsl(var(--pmw-avatar-bg))',      foreground: 'hsl(var(--pmw-avatar-fg))' },
        'pmw-code':           'hsl(var(--pmw-code-label))',
        // 텍스트 4-tier (Linear 모델) — 스킨이 정의한 곳에서만 의미. editorial 은 fallback 으로 muted-foreground 사용.
        'pmw-text-primary':   'hsl(var(--pmw-text-primary, var(--foreground)))',
        'pmw-text-secondary': 'hsl(var(--pmw-text-secondary, var(--muted-foreground)))',
        'pmw-text-tertiary':  'hsl(var(--pmw-text-tertiary, var(--muted-foreground)))',
        'pmw-text-disabled':  'hsl(var(--pmw-text-disabled, var(--muted-foreground)))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
