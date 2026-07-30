const CACHE = 'gotg-v21';

// This worker only makes the page itself survive a bad connection. It deliberately does NOT
// touch audio any more: pre-downloading the whole file alongside the stream doubled every
// listener's data, competed with the stream on exactly the weak connections it was meant to
// protect, kept nothing when a download was interrupted, and its 5 s timeout turned a slow
// response into a hard error. Audio now goes straight to the network, and the player handles
// dropouts with the media buffer plus its own recovery.

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Root only. The browser requests '/' for a navigation and cache lookups are exact, so
      // caching just './index.html' left the page unopenable offline. './index.html' itself is
      // deliberately NOT precached: the host answers it with a 308 to the root, and a redirected
      // response would both risk failing the whole addAll and be refused for a navigation.
      .then(c => c.addAll(['./', './cover.jpg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Same-origin assets (the page, cover.jpg): cache first, and if the network is gone fall
  // back to the cached page so a navigation still opens offline.
  // Everything else, audio included, is left alone and goes straight to the network.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    // ignoreSearch/ignoreVary: a cache-busting query string or a Vary header on the host's
    // response would otherwise miss the entry we precached and leave the page unopenable.
    caches.match(e.request, { ignoreSearch: true, ignoreVary: true })
      .then(hit => hit || fetch(e.request))
      .catch(() => caches.match('./', { ignoreVary: true }))
  );
});
