import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

import { check, suite } from './harness.mjs';

const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');

/**
 * Run the real service worker in a stubbed environment and see which requests
 * it takes responsibility for. The rules matter: answering a save to GitHub
 * out of a cache would show one of us a watch list the other has already
 * changed, which is the exact failure the whole optimistic-concurrency dance
 * exists to prevent.
 */
function loadWorker(origin = 'https://smeredith15.github.io') {
  const listeners = {};
  const context = createContext({
    self: {
      location: new URL(`${origin}/movies/sw.js`),
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => ({ keys: async () => [], put: async () => {}, delete: async () => {} }),
      keys: async () => [],
      match: async () => undefined,
      delete: async () => {},
    },
    fetch: async () => new Response('', { status: 200 }),
    Response,
    URL,
    console,
  });
  runInContext(readFileSync(WORKER, 'utf8'), context);
  return listeners;
}

/** Ask the worker what it would do with one request. */
function handles(listeners, url, method = 'GET') {
  let claimed = false;
  listeners.fetch({
    request: { url, method },
    respondWith: () => {
      claimed = true;
    },
  });
  return claimed;
}

const MANIFEST = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'manifest.webmanifest'), 'utf8')
);

const MANIFEST_URL = 'https://smeredith15.github.io/movies/manifest.webmanifest';

const APP = 'https://smeredith15.github.io/movies';

export default function run() {
  suite('manifest: the app says who it is', () => {
    // Without this the identity is the resolved start_url, and Chrome keeps a
    // registration under it that survives an uninstall and a site-data wipe —
    // leaving an install button that insists the app is already installed and
    // an Open that cannot open anything. An explicit id is also what lets
    // start_url move later without orphaning everyone's installed copy.
    check('the id is explicit', MANIFEST.id, '/movies/app');
    check('and is not the start url', MANIFEST.id === MANIFEST.start_url, false);

    // Relative, so they resolve against the manifest's own URL and the app
    // keeps working under /movies/ without the base path being written out.
    // Relative, so the app keeps working under /movies/ without the base path
    // being written out. Where they actually land is the part worth asserting:
    // an edit here moves the app's launch URL, and under a browser that goes by
    // start_url rather than id, its identity with it.
    check('start_url is relative', MANIFEST.start_url, '.');
    check('and lands on the app', new URL(MANIFEST.start_url, MANIFEST_URL).href, `${APP}/`);
    check('scope is relative', MANIFEST.scope, '.');
    check('and covers the app', new URL(MANIFEST.scope, MANIFEST_URL).href, `${APP}/`);
    check('it can be installed', MANIFEST.display, 'standalone');

    const purposes = MANIFEST.icons.map((i) => `${i.sizes}/${i.purpose}`);
    check('a maskable 192 exists', purposes.includes('192x192/maskable'), true);
    check('and a maskable 512', purposes.includes('512x512/maskable'), true);
  });

  suite('service worker: the app itself is cached', () => {
    const sw = loadWorker();
    check('the page', handles(sw, `${APP}/`), true);
    check('a hashed bundle', handles(sw, `${APP}/assets/index-ABC123.js`), true);
    check('the icons', handles(sw, `${APP}/icons/icon-192.png`), true);
    check('the icons again, hashed or not', handles(sw, `${APP}/icons/icon-512.png`), true);
  });

  suite('service worker: nothing we read or write is', () => {
    const sw = loadWorker();
    check(
      'the ledgers, read from raw',
      handles(sw, 'https://raw.githubusercontent.com/smeredith15/movies/main/data/watches.json'),
      false
    );
    check(
      'a save through the Contents API',
      handles(sw, 'https://api.github.com/repos/smeredith15/movies/contents/data/watches.json'),
      false
    );
    check('a TMDB lookup', handles(sw, 'https://api.themoviedb.org/3/movie/550'), false);
    check('a poster', handles(sw, 'https://image.tmdb.org/t/p/w185/poster.jpg'), false);
  });

  suite('service worker: the manifest always goes to the network', () => {
    // Served from a cache it can describe an app that no longer exists, which
    // is an install button insisting the app is already installed next to an
    // Open that cannot open anything.
    const sw = loadWorker();
    check('the manifest is not claimed', handles(sw, `${APP}/manifest.webmanifest`), false);
    check('nor with a cache-busting query', handles(sw, `${APP}/manifest.webmanifest?v=2`), false);
  });

  suite('service worker: only reads are handled', () => {
    const sw = loadWorker();
    check('a PUT is never intercepted', handles(sw, `${APP}/`, 'PUT'), false);
    check('nor a POST', handles(sw, `${APP}/assets/index-ABC123.js`, 'POST'), false);
  });
}
