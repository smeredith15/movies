/*
 * Offline support for the installed app.
 *
 * The caching is deliberately timid. Everything this app knows lives in a
 * GitHub repository that two people write to, so a stale answer is not a
 * cosmetic problem: it is one of us looking at a watch list the other already
 * changed. Only files whose names already contain a hash of their contents are
 * served from the cache first. Everything else goes to the network and falls
 * back to the cache only when the network cannot answer, which is what makes
 * the app open on the sofa with the wifi out without letting it lie about what
 * we have watched.
 */
const SHELL = 'movies-shell-v1';
const ASSETS = 'movies-assets-v1';

/** Hashed builds are immutable, so keeping a few spare costs nothing. */
const ASSET_LIMIT = 60;

self.addEventListener('install', (event) => {
  // Nothing is pre-cached: the first visit online fills these as it goes, and
  // pre-caching a file list would need this worker rebuilt whenever it changed.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== SHELL && name !== ASSETS).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/** Keep the asset cache from growing for ever; oldest first out. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSETS);
    await cache.put(request, response.clone());
    void trim(ASSETS, ASSET_LIMIT);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Anything not served from here is left entirely alone: the ledgers read
  // from raw.githubusercontent, every save to the Contents API, TMDB lookups
  // and posters. Saving a watch must never be answered out of a cache, and the
  // app already asks for the ledgers with `cache: 'no-store'` for the same
  // reason.
  if (url.origin !== self.location.origin) return;

  // Vite fingerprints these, so a given name always means the same bytes.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
