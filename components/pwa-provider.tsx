"use client"

import { useEffect } from "react"

/**
 * Registers the service worker for PWA offline caching and
 * installability. Only runs in production to avoid dev caching issues.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Only register in production to avoid caching dev assets
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registered:", reg.scope)
          })
          .catch((err) => {
            console.warn("[PWA] Service Worker registration failed:", err)
          })
      } else {
        // In dev, unregister any existing SW to prevent stale caching
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister())
        })
      }
    }
  }, [])

  return <>{children}</>
}
