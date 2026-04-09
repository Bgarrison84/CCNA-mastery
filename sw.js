/**
 * sw.js — Service Worker for CCNA Mastery (Offline-First)
 *
 * Strategy: Cache-first for all app assets; network-only for anything outside the app.
 * On install: pre-cache all static assets.
 * On fetch:   serve from cache, fall back to network, update cache in background.
 *
 * Bump CACHE_VERSION to force a fresh install after deploying updates.
 */

const CACHE_VERSION = 'ccna-v18';
const CACHE_NAME    = `ccna-mastery-${CACHE_VERSION}`;

// All assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',   // landing page (entry point)
  './landing.html', // alternate landing page
  './app.html',     // the app itself
  './css/app.css',
  './manifest.json',
  './js/main.js',
  './js/core/EventBus.js',
  './js/core/Store.js',
  './js/engine/BossBattle.js',
  './js/engine/QuizEngine.js',
  './js/engine/Subnetting.js',
  './js/engine/Terminal.js',
  './js/engine/ScriptingEngine.js',
  './js/engine/practice_terminal.js',
  './js/ui/HUD.js',
  './js/ui/Router.js',
  './js/ui/StoryMode.js',
  './js/ui/LabView.js',
  './js/ui/GrindView.js',
  './js/ui/StatsView.js',
  './js/ui/ExamView.js',
  './js/ui/BossView.js',
  './js/ui/SubnetView.js',
  './js/ui/ReferenceView.js',
  './js/ui/CharacterWidget.js',
  './js/ui/FlashView.js',
  './js/utils/ui.js',
  './js/utils/sound.js',
  './js/utils/glossary.js',
  './js/diagrams/traceroute.js',
  // Split content files
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
  // Diagram modules
  './js/diagrams/osi.js',
  './js/diagrams/tcp.js',
  './js/diagrams/udp.js',
  './js/diagrams/ftp.js',
  './js/diagrams/stp.js',
  './js/diagrams/ospf.js',
  './js/diagrams/ethernet.js',
  './js/diagrams/nat.js',
  './js/diagrams/vlan.js',
  './js/diagrams/ipv6.js',
  './js/diagrams/acl.js',
  './js/diagrams/subnetting.js',
  './js/diagrams/ports.js',
  './js/diagrams/routing.js',
  './js/diagrams/hsrp.js',
  './js/diagrams/snmp.js',
  './js/diagrams/aaa.js',
  './js/diagrams/cloud.js',
  './js/diagrams/encapsulation.js',
  './js/diagrams/topology.js',
  './js/diagrams/dhcp.js',
  './js/diagrams/arp.js',
  './js/diagrams/dns.js',
  './js/diagrams/stp_timeline.js',
];

// Optional assets: cached opportunistically — won't block SW install if missing
const OPTIONAL_URLS = [
  './fonts/OpenDyslexic-Regular.woff2',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).then(() =>
        Promise.all(OPTIONAL_URLS.map(url =>
          cache.add(url).catch(() => { /* skip missing optional assets */ })
        ))
      )
    ).then(() => self.skipWaiting())
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
