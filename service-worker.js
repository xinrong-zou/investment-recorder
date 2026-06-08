const CACHE_NAME = 'hermes-invest-v1';
const STATIC_ASSETS = [
  'style.css',
  'nav-bar.js',
  'favicon.svg',
  'manifest.json'
];

// CDN / external URL patterns to NEVER cache
const EXTERNAL_PATTERNS = [
  'unpkg.com',
  'cdn.jsdelivr.net'
];

function isExternalUrl(url) {
  return EXTERNAL_PATTERNS.some(pattern => url.includes(pattern));
}

function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  return STATIC_ASSETS.some(asset => pathname.endsWith('/' + asset) || pathname === '/' + asset);
}

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // Never cache external CDN scripts
  if (isExternalUrl(requestUrl)) {
    return;
  }

  // Cache-first for static assets
  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // Network-first for all other GET requests (API calls, supabase, etc.)
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
