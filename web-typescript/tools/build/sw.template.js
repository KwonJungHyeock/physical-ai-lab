/*
 * Service worker of the installable PC app (generated from tools/build/sw.template.js
 * by tools/build/gen-sw.mjs — edit the template, not public/sw.js).
 *
 * - Pages: network first, the saved copy when offline.
 * - Scripts, 3D models, the Python runtime: saved copy first (they never change
 *   under the same name).
 * - The robot server's /api/ is never touched: that is always live.
 */
const ASSETS = 'assets-__ASSETS_ID__';
const APP = 'app-__BUILD_ID__';
const ASSET_URLS = __ASSET_URLS__;
const PAGES = ['/console', '/agv', '/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSETS);
      const missing = [];
      for (const url of ASSET_URLS) if (!(await assets.match(url))) missing.push(url);
      await assets.addAll(missing);
      const app = await caches.open(APP);
      await Promise.all(PAGES.map((p) => app.add(p).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== ASSETS && key !== APP) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isAsset = (path) => /^\/(robot|draco|pyodide|icons)\//.test(path);
const isImmutable = (path) => path.startsWith('/_next/static/') || isAsset(path);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(APP)).put(url.pathname, res.clone());
          return res;
        } catch {
          return (await caches.match(url.pathname)) || (await caches.match('/console')) || Response.error();
        }
      })(),
    );
    return;
  }

  if (isImmutable(url.pathname)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req, { ignoreSearch: isAsset(url.pathname) });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) (await caches.open(isAsset(url.pathname) ? ASSETS : APP)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Anything else (manifest, fonts, data): live, the saved copy when offline.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(APP)).put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })(),
  );
});

/* The page loaded before this worker took over: it sends what it loaded, to keep those too. */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'keep') return;
  event.waitUntil(
    (async () => {
      const app = await caches.open(APP);
      for (const u of event.data.urls) {
        const url = new URL(u, self.location.origin);
        if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) continue;
        if (await caches.match(url.href)) continue;
        try {
          const res = await fetch(url.href);
          if (res.ok) await (isAsset(url.pathname) ? caches.open(ASSETS) : Promise.resolve(app)).then((c) => c.put(url.href, res));
        } catch {
          /* offline now: try again next time */
        }
      }
      event.source?.postMessage({ type: 'kept' });
    })(),
  );
});
