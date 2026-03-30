/**
 * sw.js — Service Worker for CCNA Mastery (Offline-First)
 *
 * Strategy: Cache-first for all app assets; network-only for anything outside the app.
 * On install: pre-cache all static assets.
 * On fetch:   serve from cache, fall back to network, update cache in background.
 *
 * Bump CACHE_VERSION to force a fresh install after deploying updates.
 */

const CACHE_VERSION = 'ccna-v4';
const CACHE_NAME    = `ccna-mastery-${CACHE_VERSION}`;

// All assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',   // landing page
  './app.html',     // the app itself
  './css/tailwind.js',
  './js/main.js',
  './js/core/EventBus.js',
  './js/core/Store.js',
  './js/engine/BossBattle.js',
  './js/engine/QuizEngine.js',
  './js/engine/Subnetting.js',
  './js/engine/Terminal.js',
  './js/ui/HUD.js',
  './js/ui/StoryMode.js',
  // Split content files (replaces monolithic content.json)
  './data/meta.json',
  './data/week1.json',
  './data/week2.json',
  './data/week3.json',
  './data/week4.json',
  './data/week5.json',
  './data/week6.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/diagrams/osi.js',
  './js/diagrams/tcp.js',
  './js/diagrams/stp.js',
  './js/diagrams/ospf.js',
  './js/diagrams/ethernet.js',
  './js/diagrams/nat.js',
  './js/diagrams/vlan.js',
  './js/diagrams/ipv6.js',
  './js/diagrams/acl.js',
  './js/diagrams/subnetting.js',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())  // activate immediately
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('ccna-mastery-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // take control of open tabs
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache; refresh in background (stale-while-revalidate)
        const networkUpdate = fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
            }
            return response;
          })
          .catch(() => {/* offline — ignore */});
        return cached;
      }
      // Not in cache — fetch from network and cache it
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      });
    })
  );
});
