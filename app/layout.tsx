import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SignPortal License Server',
  description: 'License + activation + auto-update server for SignPortal Desktop.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
