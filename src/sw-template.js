/* Pinch service worker — offline app shell. Generated at build time. */
const VERSION = '__VERSION__'
const SHELL = `pinch-shell-${VERSION}`
const IMAGES = 'pinch-images-v1'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pinch-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (/\/(relay|api)\//.test(url.pathname)) return // live fetches: never cache

  // App shell: same-origin → cache first, fall back to network; navigations fall back to index.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(
        fetch(req).then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./', copy))
          return res
        }).catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
      )
      return
    }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)))
    return
  }

  // Remote recipe photos (when not cached as data URLs): cache-first, keep up to ~200.
  if (req.destination === 'image') {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        try {
          const res = await fetch(req)
          if (res.ok || res.type === 'opaque') {
            c.put(req, res.clone())
            c.keys().then((ks) => ks.length > 200 && c.delete(ks[0]))
          }
          return res
        } catch (err) {
          return hit || Response.error()
        }
      }),
    )
  }
  // Everything else (CORS relays) goes straight to the network.
})
