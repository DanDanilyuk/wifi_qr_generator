// Offline support. Bump the version only to force every file to be refetched;
// ordinary deploys are picked up automatically (see the fetch handler).
const CACHE = 'wifi-qr-v2';
const ASSETS = [
  './',
  'index.html',
  'scan.html',
  'styles.css',
  'theme.js',
  'wifi.js',
  'main.js',
  'scan.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/qrcode-generator.js',
  'vendor/jsQR.js',
  'vendor/jspdf.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 'reload' skips the browser's HTTP cache so the copies are current.
      .then((cache) =>
        cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('wifi-qr-') && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from the cache straight away and refresh the
// cached copy in the background. The site opens instantly and offline, and a
// new deploy shows up on the visit after it lands.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Cache by path only. Older setup links carry the Wi-Fi password in the
  // query string, and that must never end up stored as a cache key.
  url.search = '';
  url.hash = '';

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(url.href);
      const fresh = fetch(request).then((response) => {
        if (response.ok) {
          cache.put(url.href, response.clone());
        }

        return response;
      });

      if (!cached) {
        return fresh;
      }

      event.waitUntil(fresh.catch(() => {}));

      return cached;
    })
  );
});
