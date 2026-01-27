// OpSyncPro Service Worker
// Version 1.0.1 - Fix for stale cache causing blank pages

const CACHE_NAME = 'opsyncpro-v3';  // Bump to invalidate old caches
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/assets/logos/logo-icon.svg'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Precaching assets');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      console.log('[Service Worker] Skip waiting');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - network-first for critical files, stale-while-revalidate for images
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first strategy for:
  // - API calls
  // - HTML files (navigation)
  // - JS files (to prevent stale cache issues)
  // - CSS files
  const isApi = url.pathname.startsWith('/api/') || 
                url.pathname.startsWith('/.netlify/') ||
                url.pathname.includes('supabase');
  const isNavigate = request.mode === 'navigate';
  const isJsOrCss = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  
  if (isApi || isNavigate || isJsOrCss) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version if network fails
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Show offline page for navigation requests
            if (isNavigate) {
              return caches.match(OFFLINE_URL);
            }
          });
        })
    );
    return;
  }

  // Cache-first strategy for static assets (images, fonts, etc.)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached but also update in background
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone and cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return response;
        })
        .catch(() => {
          // Nothing to show for static assets
        });
    })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
