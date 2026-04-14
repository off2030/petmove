import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PetMove',
  description: '반려동물 해외 이동 검역 관리',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
