// This worker only makes the page itself survive a bad connection. It deliberately does NOT
// touch audio any more: pre-downloading the whole file alongside the stream doubled every
// listener's data, competed with the stream on exactly the weak connections it was meant to
// protect, kept nothing when a download was interrupted, and its 5 s timeout turned a slow
// response into a hard error. Audio now goes straight to the network, and the player handles
// dropouts with the media buffer plus its own recovery.

// The same file is served from three addresses, so three workers run side by side on one
// origin and they all share one cache store. The scope goes into the cache name to keep them
// apart. The separator matters: with a plain hyphen the root's prefix 'gotg-' would also
// match 'gotg-en-v30', and the root worker would delete the English page's cache on every
// activation. With '|' around the scope, 'gotg|/|' is not a prefix of 'gotg|/en/|'.
const SCOPE = new URL(self.registration.scope).pathname;   // '/', '/en/', '/lv/'
const PREFIX = 'gotg|' + SCOPE + '|';
const CACHE = PREFIX + 'v33';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Root of this scope only. The browser requests the directory itself for a navigation
      // and cache lookups are exact, so caching just './index.html' left the page unopenable
      // offline. './index.html' is deliberately NOT precached: the host answers it with a 308
      // to the directory, and a redirected response would both risk failing the whole addAll
      // and be refused for a navigation.
      // The lock screen artwork is precached too. It is tiny, and without it the operating
      // system has nothing to draw the player with when the listener is offline.
      .then(c => c.addAll(['./', './cover.jpg', './artwork-512.jpg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          // Our own older versions, plus — from the root worker only — the flat 'gotg-v29'
          // style names left behind by the single-player deployment this replaced. Nobody
          // else will ever clean those up, and the root is the scope that created them.
          .filter(k => (k.startsWith(PREFIX) && k !== CACHE) ||
                       (SCOPE === '/' && /^gotg-v\d+$/.test(k)))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only our own files. Everything else, audio included, is left alone and goes straight to
  // the network.
  if (url.origin !== self.location.origin) return;

  // Look only in this scope's own cache. caches.match() without a name searches every cache
  // on the origin, which across four players would let one address answer with another's
  // page — same filenames, different language.
  e.respondWith(caches.open(CACHE).then(c => {

    // THE PAGE: network first, cache only as a rescue.
    //
    // Cache-first would be faster by a few milliseconds and was how this worked at first, but
    // it meant a listener could be served an old copy of the player after a deploy — with,
    // say, last month's broadcast times in it. One person failing to reload is a small
    // problem. A group in a cemetery running yesterday's schedule is the whole performance.
    // So: always ask the network, and keep the answer in case there is no network next time.
    if (e.request.mode === 'navigate') {
      return fetch(e.request)
        .then(res => {
          // Store under './' — the same key install used — so the rescue below finds it
          // whatever query string the address happened to carry.
          if (res && res.ok && !res.redirected) c.put('./', res.clone());
          return res;
        })
        .catch(() => c.match('./', { ignoreVary: true }));
    }

    // EVERYTHING ELSE (cover.jpg): cache first. It is 4 MB and it never changes within a
    // version, so there is nothing to go stale and a lot of data to save.
    // ignoreSearch/ignoreVary: a cache-busting query string or a Vary header on the host's
    // response would otherwise miss the entry we precached.
    return c.match(e.request, { ignoreSearch: true, ignoreVary: true })
            .then(hit => hit || fetch(e.request));
  }));
});
