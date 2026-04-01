// ── ORICS Expense Report — Service Worker ─────────────────────────────────────
// Strategy:
//   • index.html  → Network-first: always try to fetch fresh, cache as fallback.
//                   This guarantees the latest version is served when online,
//                   and a working offline copy when not.
//   • CDN assets  → Cache-first: libraries (jsPDF, pdf.js, litepicker …) never
//                   change at a given URL, so cache them forever.
//   • Everything else → Network-only (no caching).
//
// BUMP THIS VERSION STRING every time you deploy a new release.
// The old cache is deleted on activate so users always get fresh code.
// ──────────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = 'orics-v7';   // ← bump this on every deploy

const APP_SHELL = [
    './index.html',
    './',
];

const CDN_ORIGINS = [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'docs.opencv.org',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
];

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
    );
    // Take control immediately so the new SW is used right away
    self.skipWaiting();
});

// ── Activate: delete every old cache version ───────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())   // take over existing tabs immediately
    );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // ── CDN assets: cache-first ─────────────────────────────────────────────
    if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then(c => c.put(request, clone));
                    }
                    return response;
                }).catch(() => cached); // offline and not cached → nothing (lib fails gracefully)
            })
        );
        return;
    }

    // ── App shell (index.html / same origin): network-first ────────────────
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cache the fresh response
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then(c => c.put(request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))  // offline → serve cached copy
        );
        return;
    }

    // Everything else: network only
});

// ── Message: allow page to force skip waiting ──────────────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
