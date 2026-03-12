import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CBB Picks',
  description: 'Daily CBB betting picks dashboard',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0a0a] text-white">{children}</body>
    </html>
  )
}
