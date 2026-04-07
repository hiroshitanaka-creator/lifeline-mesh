/* global self, caches, Request, fetch, Response */
// Lifeline Mesh Service Worker
// Hardened offline-first app shell strategy for single-file build.

const CACHE_VERSION = "v1.2.0";
const CACHE_NAME = `lifeline-mesh-${CACHE_VERSION}`;

function ensureTrailingSlash(pathname) {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function getScopePath() {
  const scopeUrl = new URL(self.registration.scope);
  return ensureTrailingSlash(scopeUrl.pathname);
}

function buildAppShellUrls() {
  const scopePath = getScopePath();
  return [
    scopePath,
    `${scopePath}index.html`,
    `${scopePath}manifest.json`,
    `${scopePath}service-worker.js`
  ];
}

const APP_SHELL_URLS = buildAppShellUrls();
const APP_SHELL_SET = new Set(APP_SHELL_URLS);
const NAVIGATION_FALLBACK_URL = `${getScopePath()}index.html`;
const SHARE_TARGET_ACTION_PATH = `${getScopePath()}share-target`;
const SHARE_TARGET_PENDING_PATH = `${getScopePath()}share-target-pending`;

function isInScope(url) {
  const scopePath = getScopePath();
  return url.pathname === scopePath || url.pathname.startsWith(scopePath);
}

function isCacheableResponse(response) {
  return Boolean(response) && response.ok && response.type === "basic";
}

async function warmAppShellCache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    APP_SHELL_URLS.map(async (url) => {
      const request = new Request(url, { cache: "reload" });
      const response = await fetch(request);
      if (!isCacheableResponse(response)) {
        throw new Error(`Non-cacheable app-shell response: ${url} (${response?.status})`);
      }
      await cache.put(url, response.clone());
    })
  );
}

self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");
  event.waitUntil(
    warmAppShellCache()
      .then(() => {
        console.log("[ServiceWorker] App shell cached");
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error("[ServiceWorker] Install failed:", err);
        throw err;
      })
  );
});

self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[ServiceWorker] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        console.log("[ServiceWorker] Activate complete");
      })
  );
});

async function handleNavigationRequest(event) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(event.request);
    if (isCacheableResponse(networkResponse)) {
      await cache.put(event.request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn("[ServiceWorker] Navigation fetch failed, using offline fallback:", err);
    return (await cache.match(event.request)) ||
      (await cache.match(NAVIGATION_FALLBACK_URL)) ||
      new Response("Offline: Lifeline Mesh app shell is unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
  }
}

async function handleAppShellRequest(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request.url);

  const updatePromise = fetch(event.request)
    .then(async (networkResponse) => {
      if (isCacheableResponse(networkResponse)) {
        await cache.put(event.request.url, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((err) => {
      console.warn("[ServiceWorker] App shell refresh failed:", event.request.url, err);
      return null;
    });

  if (cached) {
    event.waitUntil(updatePromise);
    return cached;
  }

  const networkResponse = await updatePromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response("Offline: Requested app shell resource is unavailable.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

async function handleScopedAssetRequest(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetch(event.request);
    if (isCacheableResponse(networkResponse)) {
      await cache.put(event.request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.warn("[ServiceWorker] Scoped fetch failed with no cache hit:", event.request.url, err);
    throw err;
  }
}

async function consumeSharedFiles(files) {
  const collected = [];
  for (const file of files) {
    const safeName = typeof file?.name === "string" ? file.name : "shared-file";
    const safeType = typeof file?.type === "string" ? file.type : "";
    const lowerName = safeName.toLowerCase();
    const isJsonLike = safeType.includes("json") || lowerName.endsWith(".json") || lowerName.endsWith(".dmesh");
    if (!isJsonLike) {
      continue;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        continue;
      }
      collected.push({
        name: safeName,
        type: safeType || "application/json",
        text
      });
    } catch (err) {
      console.warn("[ServiceWorker] Failed to read shared file:", safeName, err);
    }
  }
  return collected;
}

async function handleShareTargetPost(event) {
  const cache = await caches.open(CACHE_NAME);
  const formData = await event.request.formData();
  const title = String(formData.get("title") || "");
  const text = String(formData.get("text") || "");
  const files = await consumeSharedFiles(formData.getAll("files"));

  const pendingPayload = {
    createdAt: Date.now(),
    title,
    text,
    files
  };
  await cache.put(
    SHARE_TARGET_PENDING_PATH,
    new Response(JSON.stringify(pendingPayload), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    })
  );

  return Response.redirect(`${NAVIGATION_FALLBACK_URL}?share-target=1`, 303);
}

async function handleShareTargetPendingRequest() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(SHARE_TARGET_PENDING_PATH);
  if (!cached) {
    return new Response("", { status: 204 });
  }

  await cache.delete(SHARE_TARGET_PENDING_PATH);
  return cached;
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method === "POST" && requestUrl.pathname === SHARE_TARGET_ACTION_PATH) {
    event.respondWith(handleShareTargetPost(event));
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (!isInScope(requestUrl)) {
    return;
  }

  if (requestUrl.pathname === SHARE_TARGET_PENDING_PATH) {
    event.respondWith(handleShareTargetPendingRequest());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  if (APP_SHELL_SET.has(requestUrl.pathname)) {
    event.respondWith(handleAppShellRequest(event));
    return;
  }

  event.respondWith(handleScopedAssetRequest(event));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.delete(CACHE_NAME)
        .then(() => {
          console.log("[ServiceWorker] Cache cleared");
          return self.clients.matchAll();
        })
        .then((clients) => {
          clients.forEach((client) => client.postMessage({
            type: "CACHE_CLEARED"
          }));
        })
    );
  }
});
