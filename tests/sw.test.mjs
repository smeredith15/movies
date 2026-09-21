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

const APP = 'https://smeredith15.github.io/movies';

export default function run() {
  suite('service worker: the app itself is cached', () => {
    const sw = loadWorker();
    check('the page', handles(sw, `${APP}/`), true);
    check('a hashed bundle', handles(sw, `${APP}/assets/index-ABC123.js`), true);
    check('the icons', handles(sw, `${APP}/icons/icon-192.png`), true);
    check('the manifest', handles(sw, `${APP}/manifest.webmanifest`), true);
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

  suite('service worker: only reads are handled', () => {
    const sw = loadWorker();
    check('a PUT is never intercepted', handles(sw, `${APP}/`, 'PUT'), false);
    check('nor a POST', handles(sw, `${APP}/assets/index-ABC123.js`, 'POST'), false);
  });
}
