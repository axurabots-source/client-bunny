/**
 * CLIENT BUNNY — PRODUCTION SERVICE WORKER
 * Version: 1.0.0
 * Architecture: Stale-While-Revalidate for UI assets, Network-First for API data
 */

const CACHE_NAME = 'client-bunny-v1.0.0';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon.svg',
    '/icons/favicon-32.png',
    '/icons/favicon-16.png',
    '/icons/icon-192.png',
    '/icons/icon-192-maskable.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png'
];

// 1. INSTALL EVENT
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching core application shell...');
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache warning for some assets:', err);
            });
        })
    );
});

// 2. ACTIVATE EVENT (Cache Cleanup)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Clearing outdated cache:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients for instant PWA control...');
            return self.clients.claim();
        })
    );
});

// 3. FETCH EVENT
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests (e.g. POST /api/hunt/start, DELETE /api/lists)
    if (request.method !== 'GET') {
        return;
    }

    // Do NOT intercept SSE streaming endpoints
    if (url.pathname.includes('/api/hunt/stream')) {
        return;
    }

    // Strategy A: Network-First for REST API endpoints (/api/...)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Offline fallback for API
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        return new Response(
                            JSON.stringify({
                                success: false,
                                offline: true,
                                error: 'Offline Mode: Unable to connect to Client Bunny server.'
                            }),
                            {
                                status: 503,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    });
                })
        );
        return;
    }

    // Strategy B: Navigation requests (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match('/index.html') || caches.match('/');
                })
        );
        return;
    }

    // Strategy C: Stale-While-Revalidate for Static Assets (CSS, JS, Fonts, Images)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed, nothing extra needed if cachedResponse was served
                });

            return cachedResponse || fetchPromise;
        })
    );
});

// 4. MESSAGE EVENT
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
