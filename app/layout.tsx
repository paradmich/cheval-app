import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cheval Holdings — Private Wealth OS',
  description: 'Private, AI-powered family-office operating system.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
