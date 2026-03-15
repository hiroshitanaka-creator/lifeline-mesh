// Lifeline Mesh Service Worker
// Enables offline functionality for PWA without external CDN dependencies.

const CACHE_NAME = 'lifeline-mesh-v1.1.0';
const APP_SHELL = [
  './',
  './index.html',
  './main.js',
  './manifest.json',
  './service-worker.js',
  '../crypto/core.js',
  '../crypto/key-backup.js',
  '../crypto/store.js',
  '../crypto/errors.js',
  '../crypto/transport.js',
  '../bluetooth/ble-manager.js',
  '../bluetooth/constants.js'
];

// Install event: cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[ServiceWorker] Install failed:', err);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event: same-origin cache-first, then network fallback
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;

        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));

            return networkResponse;
          });
      })
  );
});

// Message event: handle cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME)
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.postMessage({
            type: 'CACHE_CLEARED'
          }));
        })
    );
  }
});
