// Echoes Mate — Service Worker
const CACHE_NAME = "echoes-mate-v3"

// Install: don't pre-cache — fetch on demand
self.addEventListener("install", () => {
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for everything, cache as offline fallback only
self.addEventListener("fetch", (event) => {
  const { request } = event

  // Skip non-GET and API calls
  if (request.method !== "GET") return
  if (request.url.includes("/api/")) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Update cache with fresh response
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(request)
      })
  )
})
