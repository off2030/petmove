import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'

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
          <Sidebar />
          <main className="flex-1 min-w-0 h-screen overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
