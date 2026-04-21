/**
 * Service Worker for RemoEdPH (teacher push + light offline shell)
 * v4: bump cache name (drop stale HTML) + network-first for static assets + safe cache storage (no double Brotli)
 */

const CACHE_NAME = 'remoed-teacher-v5';

/** HTML shells only — avoid precaching CSS/JS (encoding + freshness handled at fetch time). */
const urlsToCache = ['/teacher-dashboard.html', '/teacher-profile.html'];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

/** CSS, JS, and common image types: network first, cache only when offline. */
function isNetworkFirstPath(pathname) {
  return /\.(?:css|js|mjs)(?:$|\?)/i.test(pathname) || /\.(?:png|jpe?g|gif|webp|svg|ico|avif)(?:$|\?)/i.test(pathname);
}

/**
 * Store a decoded body in Cache API without Content-Encoding / Content-Length mismatch
 * (fetch already decompresses br/gzip; stripping headers avoids "double decode" fetch errors).
 */
async function putSanitizedResponse(cache, request, response) {
  if (!response || !response.ok) return;
  try {
    const body = await response.clone().arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
    await cache.put(
      request,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    );
  } catch (e) {
    console.warn('[sw] cache put failed:', e && e.message ? e.message : e);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(urlsToCache).catch((err) => {
        console.warn('[sw] precache addAll failed:', err && err.message ? err.message : err);
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[sw] deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            return undefined;
          })
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Never cache admin hub/tool pages (prevents stale/truncated iframe HTML causing JS parse errors).
  // Also bypass when explicitly embedded (?adminEmbed=1).
  if (
    url.searchParams.get('adminEmbed') === '1' ||
    url.pathname.startsWith('/admin/') ||
    /^\/admin-[^/]+\.html$/i.test(url.pathname) ||
    url.pathname === '/admin-users.html'
  ) {
    event.respondWith(fetch(req));
    return;
  }

  if (!sameOrigin(url)) {
    event.respondWith(fetch(req));
    return;
  }

  if (isNetworkFirstPath(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const forCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => putSanitizedResponse(cache, req, forCache));
          }
          return response;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) => cached || new Response('', { status: 503, statusText: 'Offline' })
          )
        )
    );
    return;
  }

  event.respondWith(
    caches
      .match(req)
      .then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response && response.ok && sameOrigin(url)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => putSanitizedResponse(cache, req, copy));
          }
          return response;
        });
      })
      .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
  );
});

self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'RemoEdPH Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/images/remoed-favicon.png',
    badge: data.badge || '/images/remoed-favicon.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  const data = event.notification.data;
  let targetUrl = '/teacher-dashboard.html';

  if (data && data.url) {
    targetUrl = data.url;
  } else if (data && data.type) {
    switch (data.type) {
      case 'booking':
        targetUrl = '/teacher-class-table.html';
        break;
      case 'payment':
        targetUrl = '/teacher-service-fee.html';
        break;
      case 'message':
        targetUrl = '/teacher-dashboard.html';
        break;
      default:
        break;
    }
  }

  event.waitUntil(clients.openWindow(targetUrl));
});
