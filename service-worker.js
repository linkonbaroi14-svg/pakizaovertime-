// Bump CACHE_VERSION whenever any app file changes.
const CACHE_VERSION = "pakiza-ot-v17";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icon-192.png", "icon-512.png", "banner.jpg", "profile.jpg", "cloud.js", "firebase-config.js", "i18n.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
