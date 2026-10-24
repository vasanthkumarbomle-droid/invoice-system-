const CACHE_NAME = 'ledgerflow-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
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
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const offlinePage = await cache.match(OFFLINE_URL);
      if (offlinePage) return offlinePage;
      return new Response(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are offline · LedgerFlow</title><body style="font:16px system-ui;background:#f4f7fb;color:#172033;display:grid;place-items:center;min-height:100vh;margin:0"><main style="background:white;border:1px solid #e2e8f0;border-radius:20px;padding:32px;max-width:520px"><h1>You are offline</h1><p>Reconnect to the internet and retry LedgerFlow.</p><button onclick="location.reload()">Retry connection</button></main></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 }
      );
    }
  })());
});
