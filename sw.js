const CACHE = 'gotg-v9';

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

// Called from main page when user presses play
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_AUDIO') {
    const { url } = e.data;
    caches.open(CACHE).then(async cache => {
      if (await cache.match(url)) return; // already cached
      fetch(url, { mode: 'cors' })
        .then(res => {
          const type = res.headers.get('Content-Type') || '';
          if (res.ok && type.includes('audio')) { // FIX 5: validate content-type
            cache.put(url, res.clone());           // FIX 4: clone before putting
          }
        })
        .catch(() => {});
    });
  }
});

// FIX 6: timeout wrapper — avoids long stalls on captive portals / weak wifi
function fetchWithTimeout(request, timeout = 5000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    )
  ]);
}

// Serve a range request from a fully cached file
async function handleRangeFromCache(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url);
  if (!cached) return null;

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cached;

  // Blob, not arrayBuffer: arrayBuffer pulled the whole file (150 MB) into RAM on every single
  // range request, which killed playback on a phone within minutes. blob.slice() stays lazy.
  const blob = await cached.blob();
  const total = blob.size;

  // FIX 2: safe range parsing — handles malformed or unexpected range headers
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return cached;
  const start = match[1] ? parseInt(match[1], 10) : 0;
  const end   = match[2] ? parseInt(match[2], 10) : total - 1;

  // FIX 3: clamp bounds — return 416 if range is invalid
  const safeStart = Math.max(0, start);
  const safeEnd   = Math.min(end, total - 1);
  if (safeStart > safeEnd) {
    return new Response(null, { status: 416 });
  }

  return new Response(blob.slice(safeStart, safeEnd + 1), {
    status: 206,
    headers: {
      'Content-Range':  `bytes ${safeStart}-${safeEnd}/${total}`,
      'Content-Length': String(safeEnd - safeStart + 1),
      'Content-Type':   cached.headers.get('Content-Type') || 'audio/mpeg',
      'Accept-Ranges':  'bytes',
    }
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Same-origin assets (index.html, cover.jpg): cache first, and if the network is gone
  // fall back to the cached page so a navigation still opens offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request)
        .then(hit => hit || fetch(e.request))
        .catch(() => caches.match('./'))
    );
    return;
  }

  // Audio hosts: network first with timeout, fall back to cache
  const isAudio = url.hostname.endsWith('r2.dev') ||
                  url.hostname.includes('github.com') ||
                  url.hostname.includes('githubusercontent.com');
  if (isAudio) {
    e.respondWith(
      fetchWithTimeout(e.request).catch(() =>
        handleRangeFromCache(e.request).then(r => r || Response.error())
      )
    );
  }
});
