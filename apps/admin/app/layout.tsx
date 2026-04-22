import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'

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
    <html lang="ko" suppressHydrationWarning>
      {/*
        Editorial 톤: 폰트는 globals.css 의 @import 에서 로드합니다.
        변경 사항: body className 에 font-sans 명시(= Inter Tight).
      */}
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <ThemeProvider />
        <div className="flex flex-col h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
