const CACHE_NAME = 'food-at-home-v4'
// Every page of the app is the same index.html, so it is kept under one key.
const SHELL = '/'
// How long a page load waits on the network before the cached app is shown
// instead. Only page loads: data requests are never answered from an old cache
// while the network is merely slow, or a just-saved change would appear to be
// undone.
const NAVIGATE_WAIT_MS = 4000

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Store a good response; an error page must never replace a working copy.
function keep(key, response) {
  if (response.ok) {
    const clone = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(key, clone))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  // Cache API rejects cache.put for non-GET; a POST to /functions/ must go
  // straight to the network and never be answered from cache.
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Page loads: network first, the cached app after the wait or on failure.
  if (event.request.mode === 'navigate') {
    const network = fetch(event.request).then((response) =>
      (response.headers.get('content-type') || '').includes('text/html') ? keep(SHELL, response) : response)
    // After the wait: the cached app if there is one, else keep waiting.
    const cachedAfterWait = new Promise((resolve) => setTimeout(resolve, NAVIGATE_WAIT_MS))
      .then(() => caches.match(SHELL))
      .then((cached) => cached || network)
    event.respondWith(Promise.race([network, cachedAfterWait]).catch(() => caches.match(SHELL)))
    return
  }

  // Data: network first, the cache only when the request fails outright.
  if (url.pathname.includes('/rest/') || url.pathname.includes('/functions/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => keep(event.request, response))
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Static files: cache first. The build's hashed files are stored as they are
  // fetched — the cached app is useless without the scripts it points at.
  // A build file that no longer exists is answered by the host with the app's
  // HTML page and status 200 — that must never be stored as the script.
  const hashed = url.origin === self.location.origin && url.pathname.startsWith('/assets/')
  const isPage = (response) => (response.headers.get('content-type') || '').includes('text/html')
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((response) => (hashed && !isPage(response) ? keep(event.request, response) : response)))
  )
})
