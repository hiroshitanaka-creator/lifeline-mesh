// Lifeline Mesh Service Worker
// Enables offline functionality for PWA

const CACHE_NAME = 'lifeline-mesh-v1.0.0';
const CACHE_URLS = [
  '/lifeline-mesh/',
  '/lifeline-mesh/index.html',
  '/lifeline-mesh/manifest.json',
  '/lifeline-mesh/../crypto/core.js',
  'https://unpkg.com/tweetnacl@1.0.3/nacl-fast.min.js',
  'https://unpkg.com/tweetnacl-util@0.15.1/nacl-util.min.js',
  'https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Install event: cache critical assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        console.log('[ServiceWorker] Install complete');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[ServiceWorker] Install failed:', err);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[ServiceWorker] Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activate complete');
        return self.clients.claim();
      })
  );
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) &&
      !event.request.url.startsWith('https://unpkg.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
          return response;
        }

        console.log('[ServiceWorker] Fetching from network:', event.request.url);
        return fetch(event.request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response (can only be consumed once)
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch((err) => {
            console.error('[ServiceWorker] Fetch failed:', err);
            // Could return offline page here if implemented
            throw err;
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
        .then(() => {
          console.log('[ServiceWorker] Cache cleared');
          return self.clients.matchAll();
        })
        .then((clients) => {
          clients.forEach(client => client.postMessage({
            type: 'CACHE_CLEARED'
          }));
        })
    );
  }
});
