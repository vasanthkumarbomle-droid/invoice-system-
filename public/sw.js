const CACHE_NAME = 'ledgerflow-offline-v3';
const OFFLINE_URL = '/offline.html';
const APP_SHELL_URLS = ['/', '/index.html', OFFLINE_URL, '/favicon.svg'];

async function cacheSuccessfulResponse(cache, url, response) {
  if (response && response.ok && response.type !== 'opaque') {
    await cache.put(url, response.clone());
  }
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.all(APP_SHELL_URLS.map(async (url) => {
    try {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      await cacheSuccessfulResponse(cache, url, response);
      return url === '/index.html' ? response : null;
    } catch {
      return null;
    }
  }));

  const indexResponse = results.find(Boolean);
  if (indexResponse) {
    const html = await indexResponse.clone().text();
    const assets = new Set();
    const pattern = /(?:src|href)="([^"]+)"/g;
    let match;
    while ((match = pattern.exec(html))) {
      const asset = match[1];
      if (asset.endsWith('.js') || asset.endsWith('.css') || asset.includes('.js?') || asset.includes('.css?')) assets.add(asset);
    }
    await Promise.all([...assets].map(async (asset) => {
      try {
        const response = await fetch(new Request(asset, { cache: 'reload' }));
        await cacheSuccessfulResponse(cache, asset, response);
      } catch {
        // A failed asset fetch should not prevent the rest of the app shell caching.
      }
    }));
  }

  // Ensure a minimal retry page is available even if the build shell cannot load.
  try {
    if (!await cache.match(OFFLINE_URL)) {
      const response = await fetch(OFFLINE_URL);
      await cacheSuccessfulResponse(cache, OFFLINE_URL, response);
    }
  } catch {
    // Keep install resilient: the cached index shell is the primary offline fallback.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precacheAppShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('ledgerflow-offline-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cacheSuccessfulResponse(cache, '/index.html', url.pathname === '/index.html' ? response : response.clone());
          // All app routes are SPA routes; retain the built shell under the root key too.
          await cacheSuccessfulResponse(cache, '/', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) ||
          (await cache.match('/')) ||
          (await cache.match(OFFLINE_URL)) ||
          new Response('LedgerFlow is offline. Reconnect and try again.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
          });
      }
    })());
    return;
  }

  const cacheableAsset = ['script', 'style', 'image', 'font', 'worker'].includes(request.destination) ||
    url.pathname.startsWith('/assets/');
  if (!cacheableAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cacheSuccessfulResponse(cache, request, response);
      return response;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
