/**
 * Heva ONE Service Worker
 * ───────────────────────
 * Strategy (tuned to eliminate the "click does nothing until hard refresh" bug):
 *   • Skip waiting + claim clients immediately so a new deploy takes over
 *     without a second visit.
 *   • Never cache /api/ or /socket.io/ — those are live.
 *   • Navigation (HTML) requests → network-first, fall back to cached
 *     index.html only when offline. This guarantees users get the latest
 *     index.html (which references the latest hashed JS bundle).
 *   • Hashed JS/CSS from /static/ → cache-first (safe because the filename
 *     itself changes on every build).
 *   • Other static assets (images, fonts, manifest icons) →
 *     stale-while-revalidate.
 *   • Everything else → passthrough (no cache interference).
 *   • Bump CACHE_NAME on every deploy to evict stale entries.
 */

const CACHE_NAME = 'heva-one-v5-2026-02-11';
const HASHED_STATIC = /^\/static\/(?:js|css|media)\//;
const OTHER_ASSET_EXT = /\.(?:woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|ico|webp)$/i;

self.addEventListener('install', () => {
  // Activate the new SW immediately so users get the fixed behaviour
  // without needing to close and reopen tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate activation handshake if needed.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests. POST/PUT/DELETE always go to network.
  if (req.method !== 'GET') return;

  // Don't touch cross-origin requests (fonts.googleapis etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache API or websocket traffic.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Navigation requests (HTML) → network-first. Stale HTML was the root
  // cause of "need hard refresh to click anything" after deploys.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', resClone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed JS/CSS from CRA's /static/ → cache-first. Filenames change on
  // every build so we can safely serve from cache without going stale.
  if (HASHED_STATIC.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      })
    );
    return;
  }

  // Other static assets (images/fonts/icons) → stale-while-revalidate.
  if (OTHER_ASSET_EXT.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else — straight to network.
});
