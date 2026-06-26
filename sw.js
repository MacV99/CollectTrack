const CACHE = 'collecttrack-v4';
const STATIC = ['./manifest.json', './icon.svg'];

// Install: pre-cache solo assets estáticos (NO index.html)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activate: limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch:
//   - Google Sheets → siempre red
//   - HTML (index.html) → network-first (siempre fresco, fallback a cache)
//   - Otros assets → cache-first
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Google Sheets CSV / GAS → red directa
  if (url.includes('googleapis') || url.includes('googleusercontent') || url.includes('script.google.com')) {
    return;
  }

  // HTML → network-first: siempre intenta red, si falla usa cache
  if (e.request.destination === 'document' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Guardar copia fresca en cache
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Otros assets (manifest, icon) → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
