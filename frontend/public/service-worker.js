/**
 * Heva ONE Service Worker
 * ───────────────────────
 * Strategy:
 *   • NEVER cache /api/ or /socket.io/ — those are live.
 *   • NEVER cache HTML navigation requests — always fetch fresh so
 *     clicks/routing work immediately after deploy (no hard refresh
 *     needed). Fall back to cached index.html only when offline.
 *   • Cache JS/CSS/fonts/images with stale-while-revalidate so
 *     subsequent visits feel instant but updates propagate within
 *     one page load.
 *   • Bump CACHE_NAME on deploy (commit hash would be ideal but
 *     we bump manually here) to evict old caches.
 */

const CACHE_NAME = 'heva-one-v3-2026-04-21';
const STATIC_EXT = /\.(?:js|css|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|ico|webp)$/i;

self.addEventListener('install', (event) => {
  // Activate the new SW immediately so users get the fixed behaviour
  // without needing to close and reopen tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear out any previous cache versions on activation.
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests. POST/PUT/DELETE always go to network.
  if (req.method !== 'GET') return;

  // Don't touch cross-origin requests (fonts.googleapis etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache API or websocket traffic.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return; // let the network handle it
  }

  // ── Navigation requests (HTML) — network-first, fall back to cached
  //    index.html for offline support. Stale HTML was the root cause of
  //    the "need hard refresh to click anything" bug.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Update the cached copy of index.html for offline fallback
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', resClone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Static assets (hashed JS/CSS/images) — stale-while-revalidate.
  if (STATIC_EXT.test(url.pathname)) {
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

  // Everything else — just go to network (no cache interference).
});
