/*
 * Service worker for the wallet.
 *
 * The governing constraint is that this app is a per-user financial ledger
 * behind a login. A cache that held API responses could serve one person's
 * figures to the next person to open the app on a shared device, and could
 * show stale balances that look authoritative. So nothing from /api is ever
 * cached or served from cache — not even briefly.
 *
 * What is cached is only what is safe and useful: build assets, which are
 * content-hashed and immutable, and one offline page to explain the situation
 * when the network is gone.
 */

const VERSION = 'wallet-v1';
const PRECACHE = `${VERSION}-precache`;
const ASSETS = `${VERSION}-assets`;

/** Shown when a navigation cannot reach the network. */
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Take over straight away rather than waiting for every tab to close.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== PRECACHE && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Anything that could carry one account's data must never be stored.
 *
 * Signing out clears the cookie but not a cache, so a cached API response
 * would outlive the session that was allowed to see it.
 */
function isPrivate(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/sign-in') ||
    url.pathname.startsWith('/sign-up') ||
    // Clerk's own endpoints carry session material.
    url.hostname.includes('clerk')
  );
}

/** Build output is content-hashed, so a hit can be trusted indefinitely. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only GET, only this origin, never anything private. Everything else falls
  // through to the network untouched, as though no worker were installed.
  if (request.method !== 'GET' || url.origin !== self.location.origin || isPrivate(url)) {
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            // Only store a complete, successful response; a 206 or an opaque
            // error would poison the cache.
            if (response.ok && response.status === 200) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    // Network-first, and the response is deliberately not cached: page HTML is
    // only reached behind a session, and a stale shell is worse than a clear
    // offline message.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: PRECACHE }).then(
          (offline) =>
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }),
        ),
      ),
    );
  }
});
