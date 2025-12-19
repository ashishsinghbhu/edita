const CACHE_NAME = 'edita-disabled';

// Service worker disabled - always fetch fresh content
self.addEventListener('install', (event) => {
  console.log('Service worker installed (cache disabled)');
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Always fetch from network, never use cache
  event.respondWith(
    fetch(event.request, {
      cache: 'no-store'
    })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
