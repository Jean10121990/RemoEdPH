/**
 * Service Worker for RemoEdPH Teacher Portal
 * Handles push notifications and offline functionality
 */

const CACHE_NAME = 'remoed-teacher-v1';
const urlsToCache = [
    '/',
    '/teacher-dashboard.html',
    '/teacher-profile.html',
    '/modern-styles.css',
    '/mobile-utils.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);
    
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'RemoEdPH Notification';
    const options = {
        body: data.body || 'You have a new notification',
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        data: data.data || {}
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    
    event.notification.close();
    
    const data = event.notification.data;
    let url = '/teacher-dashboard.html';
    
    // Navigate based on notification type
    if (data && data.url) {
        url = data.url;
    } else if (data && data.type) {
        switch (data.type) {
            case 'booking':
                url = '/teacher-class-table.html';
                break;
            case 'payment':
                url = '/teacher-service-fee.html';
                break;
            case 'message':
                url = '/teacher-dashboard.html';
                break;
        }
    }
    
    event.waitUntil(
        clients.openWindow(url)
    );
});
