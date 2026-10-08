/* AccountFlow service worker — offline-first: the app shell and data work
   offline after the first load. Accounting data lives in IndexedDB. */
const CACHE = 'accountflow-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Precache the full app shell so the app works offline from the first visit.
      try {
        const res = await fetch('/precache.json');
        if (res.ok) {
          const files = await res.json();
          await c.addAll(['/', ...files]);
        } else {
          await c.add('/');
        }
      } catch {
        await c.add('/');
      }
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // SPA navigations always serve the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/').then((hit) => hit || fetch(req).catch(() => caches.match('/'))),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
