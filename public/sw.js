const CACHE_NAME = "muhcs-v1"
const STATIC_ASSETS = [
  "/",
  "/login",
  "/manifest.json",
  "/favicon.ico",
  "/logo.jpg",
]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", event => {
  const { request } = event
  const url = new URL(request.url)

  // Don't cache Supabase API calls — always fetch fresh
  if (url.hostname.includes("supabase")) {
    event.respondWith(fetch(request))
    return
  }

  // For navigation requests — network first, fallback to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then(r => r || caches.match("/")))
    )
    return
  }

  // For static assets — cache first, fallback to network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
    })
  )
})