// 收益账本 Service Worker v4 — 家庭基金 + 份额占比修复
const CACHE_NAME = '收益账本-v4';
const STATIC_ASSETS = [
  'index.html',
  'style.css',
  'nav-bar.js',
  'data-service.js',
  'achievement-system.js',
  'favicon.svg',
  'manifest.json',
  'offline.html',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// CDN / external URL patterns to NEVER cache
const EXTERNAL_PATTERNS = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'supabase'
];

// Offline fallback
const OFFLINE_PAGE = 'offline.html';

function isExternalUrl(url) {
  return EXTERNAL_PATTERNS.some(pattern => url.includes(pattern));
}

function isStaticAsset(url) {
  try {
    const pathname = new URL(url).pathname;
    return STATIC_ASSETS.some(asset => pathname.endsWith('/' + asset) || pathname === '/' + asset);
  } catch { return false; }
}

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        // Individual asset failure shouldn't block install
        console.warn('SW install cache partial failure:', err);
      });
    })
  );
  // Don't skipWaiting immediately — wait for user confirmation
});

// Activate: clear old caches, then take control
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

// Listen for skip-waiting request from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notify all clients that a new version is available
self.addEventListener('statechange', () => {
  if (self.state === 'installed' && self.navigator && self.navigator.serviceWorker) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
      });
    });
  }
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // Never cache external CDN scripts or API calls
  if (isExternalUrl(requestUrl)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // HTML navigation requests: network-first (always try to get latest)
  if (event.request.mode === 'navigate') {
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
        // Offline: serve offline page
        return caches.match(OFFLINE_PAGE).then(cachedPage => {
          if (cachedPage) return cachedPage;
          return new Response('离线', { status: 503 });
        });
      })
    );
    return;
  }

  // Static assets: cache-first
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

  // All other requests: network-first
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
