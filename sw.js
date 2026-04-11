const CACHE = 'collecttrack-v1';
const STATIC = ['/', './index.html', './manifest.json', './icon.svg'];

// Install: pre-cache static files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for own files, network-only for external (Google Sheets)
self.addEventListener('fetch', e => {
  if (e.request.url.includes('googleapis') || e.request.url.includes('googleusercontent')) {
    return; // Let CSV fetches go straight to network
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
