const CACHE_NAME = 'DevPay-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './register.html',
  './app.html',
  './admin.html',
  './manifest.json',
  './css/global.css',
  './css/auth.css',
  './css/app.css',
  './css/admin.css',
  './js/supabase.js',
  './js/auth.js',
  './js/app.js',
  './js/home.js',
  './js/tasks.js',
  './js/profile.js',
  './js/wallet.js',
  './js/notifications.js',
  './js/admin.js'
];

// Install Service Worker and cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event (clean up old caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event with Network-First fallback to Cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local assets (skip supabase API requests, etc.)
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update cache with the latest version
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If not in cache and fails network, return offline page/error
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});
