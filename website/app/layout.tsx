import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SITE_URL } from '@/components/site'
import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

const description =
  'An agent development environment for Windows: a VS Code-style workspace where the editor is an AI chat. GeekedGPT builds, browses and tests with the full Claude Code toolset.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Geeked IDE: describe it, GeekedGPT builds it',
  description,
  applicationName: 'Geeked IDE',
  openGraph: {
    title: 'Geeked IDE',
    description,
    url: SITE_URL,
    siteName: 'Geeked IDE',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geeked IDE',
    description
  }
}

export const viewport: Viewport = {
  themeColor: '#0a0b0f',
  colorScheme: 'dark'
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {/* Without JavaScript, scroll reveals never run: show everything. */}
        <noscript>
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  )
}
