/* ============================================================
   service-worker.js — makes TutorClock installable and offline.
   ------------------------------------------------------------
   Strategy: network first, fall back to the cache.

   Why not cache first (which is the usual PWA advice)? Because
   while we are still building, cache-first means you edit a file,
   reload, and stubbornly see the OLD version - a genuinely
   confusing bug to chase. Network-first gives you fresh code on
   every reload when you have a connection, and still works fully
   offline because we fall back to the cached copy.

   Bump CACHE_NAME whenever the file list changes; that throws
   away the old cache on the next load.
   ============================================================ */

/* Bump this on every step. The activate handler deletes any cache
   whose name does not match, so changing it is what throws away
   the previous step's files. Forgetting to change it means an old
   version can keep being served from the cache. */
const CACHE_NAME = 'tutorclock-backup1';

const APP_SHELL = [
  './',
  './index.html',
  './css/tutorclock.css',
  './js/app.js',
  './js/store.js',
  './js/share-image.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // addAll fails the whole install if any single file 404s, so
      // add them individually and tolerate misses.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle our own GET requests.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Tuck a fresh copy away for offline use.
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation with nothing cached for that exact URL still
        // gets the app shell, so the app opens offline.
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
