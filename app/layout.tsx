import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { PwaProvider } from "@/components/pwa-provider"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Echoes Mate - AI Chat",
  description: "A Chatbox-like AI chat interface",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Echoes Mate",
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh overflow-hidden antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if(!window.structuredClone){window.structuredClone=function(e){return JSON.parse(JSON.stringify(e))}}`,
          }}
        />
      </head>
      <body className="h-dvh flex flex-col overflow-hidden">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  )
}
