// Force cache update by incrementing version
const CACHE_VERSION = 'spliteasy-v1738353000000'; // Fixed custom split loading in group-detail
const CACHE_NAME = CACHE_VERSION;

console.log('🔄 SplitEasy Service Worker Loading with cache:', CACHE_NAME);

// Detect base path for GitHub Pages subdirectory
const getBasePath = () => {
  const path = self.location.pathname;
  // If path contains more than just '/', extract base path
  // e.g., '/SplitEasy-Supabase/sw.js' -> '/SplitEasy-Supabase'
  const parts = path.split('/').filter(p => p);
  
  // Only add base path if we're actually in a subdirectory (not just '/sw.js')
  // This handles GitHub Pages but avoids issues when running locally
  if (parts.length > 1 && parts[parts.length - 1] === 'sw.js') {
    // Remove 'sw.js' if present, keep the base path
    const baseParts = parts.slice(0, -1);
    // Only return base path if it's not empty (i.e., we're in a subdirectory)
    if (baseParts.length > 0) {
      return '/' + baseParts.join('/');
    }
  }
  return '';
};

const BASE_PATH = getBasePath();
console.log('🔄 Service Worker Base Path:', BASE_PATH || '(root)');

// Updated file list with your new enhanced files (relative to base path)
// Only cache files that exist - use cache.add() individually to handle failures gracefully
const urlsToCache = [
  BASE_PATH || '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/group-detail.html',
  BASE_PATH + '/css/style.css',
  BASE_PATH + '/js/shared-utils.js',
  BASE_PATH + '/js/shared-supabase.js',
  BASE_PATH + '/js/shared-sync.js',
  BASE_PATH + '/icons/icon-192x192.png',
  BASE_PATH + '/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/lz-string@1.4.4/libs/lz-string.min.js'
];

// Install event - cache resources and FORCE UPDATE
self.addEventListener('install', event => {
  console.log('✅ SplitEasy: Service worker installing with version:', CACHE_VERSION);

  // FORCE IMMEDIATE ACTIVATION - This is key for getting updates
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        console.log('📦 SplitEasy: Caching app shell');
        // Cache files individually to handle failures gracefully
        const cachePromises = urlsToCache.map(url => 
          cache.add(url).catch(err => {
            console.warn(`⚠️ Failed to cache ${url}:`, err.message);
            return null; // Continue even if one file fails
          })
        );
        await Promise.all(cachePromises);
        console.log('✅ SplitEasy: App shell cached successfully');
      })
      .catch(error => {
        console.error('❌ SplitEasy: Cache failed:', error);
      })
  );
});

// Activate event - clean up old caches IMMEDIATELY
self.addEventListener('activate', event => {
  console.log('🔄 SplitEasy: Service worker activating...');

  // TAKE CONTROL IMMEDIATELY - Forces immediate update
  self.clients.claim();

  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('🗂️ Found existing caches:', cacheNames);
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SplitEasy: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ SplitEasy: Service worker activated and old caches cleared');

      // Notify all clients that update is available
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            message: 'App updated! Refresh to see latest changes.'
          });
        });
      });
    })
  );
});

// ENHANCED Fetch event - Network first for HTML, cache for static assets
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external requests (except our allowed CDNs)
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('cdn.jsdelivr.net') &&
      !event.request.url.includes('supabase.co')) {
    return;
  }

  const url = event.request.url;

  // NETWORK FIRST for HTML files - ensures latest content
  if (url.includes('.html') || url.endsWith('/') || url.includes('?id=')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            console.log('🌐 SplitEasy: Serving fresh HTML from network:', event.request.url);
            // Cache the fresh response
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            return response;
          }
          throw new Error('Network response was not ok');
        })
        .catch(() => {
          console.log('📱 SplitEasy: Network failed, serving from cache:', event.request.url);
          return caches.match(event.request).then(response => {
            return response || caches.match(BASE_PATH + '/index.html' || '/index.html');
          });
        })
    );
    return;
  }

  // CACHE FIRST for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('📦 SplitEasy: Serving from cache:', event.request.url);
          return response;
        }

        console.log('🌐 SplitEasy: Fetching from network:', event.request.url);
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        console.log('❌ SplitEasy: Network failed, serving offline page');
        // Return a custom offline page if available
        if (event.request.destination === 'document') {
          return caches.match(BASE_PATH + '/index.html' || '/index.html');
        }
      })
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('🔄 SplitEasy: Background sync triggered');
    event.waitUntil(syncData());
  }
});

// Sync offline data when connection is restored
function syncData() {
  return new Promise((resolve) => {
    // Your app already handles data in localStorage
    // This is just for logging
    console.log('✅ SplitEasy: Data sync completed');
    resolve();
  });
}

// Handle push notifications (future feature)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: data.data || {}
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// ENHANCED: Handle messages from main thread
self.addEventListener('message', event => {
  console.log('📢 SplitEasy: Received message:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⚡ SplitEasy: Skipping waiting...');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🧹 SplitEasy: Clearing all caches...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('✅ SplitEasy: All caches cleared');
        if (event.ports[0]) {
          event.ports[0].postMessage({success: true});
        }
      })
    );
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    if (event.ports[0]) {
      event.ports[0].postMessage({version: CACHE_VERSION});
    }
  }
});

console.log('✅ Enhanced SplitEasy Service Worker loaded successfully with version:', CACHE_VERSION);