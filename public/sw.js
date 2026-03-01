/**
 * Service Worker for Organize Yourselves PWA
 *
 * Strategy:
 * - App shell (HTML): Network-first, fall back to cache
 * - Static assets (JS/CSS with hashes): Cache-first (immutable)
 * - Images/fonts: Cache-first with network fallback
 * - API calls: Network-only (none in Phase 1, but future-proof)
 *
 * All data is in IndexedDB via Dexie.js, so we only need to cache
 * the app shell for offline functionality.
 */

const CACHE_NAME = 'organize-yourselves-v1';

// Core app shell files to precache on install (relative to SW scope)
const APP_SHELL = [
  './',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// --- Install: precache app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately, don't wait for old SW to finish
  self.skipWaiting();
});

// --- Activate: clean up old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// --- Fetch: serve from cache or network ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Navigation requests (HTML pages) — Network-first
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hashed assets (Vite generates these) — Cache-first (immutable)
  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Other static assets — Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// --- Caching strategies ---

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation, try to serve the cached index page
    // Use self.registration.scope to handle GitHub Pages base path
    const scope = self.registration ? self.registration.scope : self.location.origin + '/';
    const fallback = await caches.match(scope);
    if (fallback) return fallback;

    return new Response('Offline — please reconnect and try again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Asset not available offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

// --- Helpers ---

function isHashedAsset(pathname) {
  // Vite generates files like /assets/index-abc123.js
  return /\/assets\/.*\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot|svg|png|jpg|webp)$/i.test(pathname);
}
