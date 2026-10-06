/* ============================================================
   DailyVet — Service Worker v2.0
   Handles: offline caching + push notification clicks
   ============================================================ */

const CACHE_NAME = 'dailyvet-v4-tailwind';   /* bumped: forces browsers to drop old cache and load Tailwind */
const CACHE_URLS = [
    '/',
    '/index.html',
    '/home.html',
    '/climate-dashboard.html',
    '/manifest.json',
    '/js/tailwind-v4.js',
    '/assets/dailyvetlogo.jpeg'
];

/* ===== INSTALL — pre-cache shell ===== */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_URLS))
            .catch(err => console.warn('[SW] Pre-cache partial:', err.message))
    );
    self.skipWaiting();
});

/* ===== ACTIVATE — clean old caches ===== */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

/* ===== FETCH — network-first for HTML, cache-first for static ===== */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    /* Never cache Firebase / NASA / Google API calls */
    if (url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('nasa.gov') ||
        url.hostname.includes('openrouter') ||
        url.hostname.includes('groq')) {
        return;
    }

    /* Only GET */
    if (event.request.method !== 'GET') return;

    /* HTML / JS / CSS: NETWORK-FIRST (so code fixes reach users immediately; cache = offline fallback).
       Images / fonts: cache-first. The old version served JS cache-first forever, so a fixed
       climate-feature.js would never reach a phone that had already cached the old one. */
    const isCode = event.request.mode === 'navigate' ||
                   url.pathname.endsWith('.html') ||
                   url.pathname.endsWith('.js') ||
                   url.pathname.endsWith('.css');
    const isAsset = isCode ||
                    url.pathname.endsWith('.png') ||
                    url.pathname.endsWith('.jpeg') ||
                    url.pathname.endsWith('.jpg') ||
                    url.pathname.endsWith('.svg') ||
                    url.pathname.endsWith('.woff2');

    const fromNetwork = () => fetch(event.request).then(response => {
        if (isAsset && url.origin === self.location.origin && response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone).catch(() => {}));
        }
        return response;
    });

    if (isCode) {
        event.respondWith(
            fromNetwork().catch(() =>
                caches.match(event.request).then(cached =>
                    cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : undefined)))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => cached || fromNetwork().catch(() => undefined))
    );
});

/* ============================================================
   NOTIFICATION CLICK HANDLER
   ----------------------------------------
   Triggered when user taps a DailyVet notification.
   • If a DailyVet tab is already open → focus it and navigate
   • Otherwise → open a new window at the target URL
   Handles: NASA outbreak alerts + AI reminders + medicine/vaccine
   ============================================================ */
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    /* URL comes from the notification data set in notification-engine.js */
    const targetUrl = (event.notification.data && event.notification.data.url)
        ? event.notification.data.url
        : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            /* Prefer an existing DailyVet tab */
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
                    return client.focus().then(function () {
                        if ('navigate' in client) {
                            return client.navigate(targetUrl);
                        }
                    });
                }
            }
            /* Otherwise open a new window */
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

/* ============================================================
   NOTIFICATION CLOSE HANDLER
   Fires when user dismisses a notification (swipe away / clear all)
   Useful for analytics / cleanup — currently just logs.
   ============================================================ */
self.addEventListener('notificationclose', function (event) {
    if (event.notification && event.notification.tag) {
        console.log('[SW] Notification dismissed:', event.notification.tag);
    }
});

/* ============================================================
   PUSH HANDLER (for future server-side push)
   Currently unused (client-side Notification API is used instead),
   but included so that if you later set up FCM / Web Push you have
   a ready hook.
   ============================================================ */
self.addEventListener('push', function (event) {
    if (!event.data) return;

    let payload = {};
    try { payload = event.data.json(); }
    catch (_) { payload = { title: 'DailyVet', body: event.data.text() }; }

    const title = payload.title || 'DailyVet';
    const options = {
        body: payload.body || '',
        icon: payload.icon || '/assets/dailyvetlogo.jpeg',
        badge: '/assets/dailyvetlogo.jpeg',
        tag: payload.tag || 'dailyvet-push',
        lang: 'bn',
        data: { url: payload.url || '/' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});