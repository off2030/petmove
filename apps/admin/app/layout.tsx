import type { Metadata } from 'next'
import { Inter_Tight, Source_Serif_4, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'

// next/font — 동일 오리진에서 폰트 서빙, Turbopack/CSS @import 이슈 우회.
// CSS 변수로 노출해서 tailwind fontFamily 가 참조.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '펫무브워크',
  description: '반려동물 해외 이동 검역 관리',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${interTight.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <ThemeProvider />
        <div className="flex flex-col h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
