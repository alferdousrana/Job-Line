/* Job Line service worker — works offline, always tries to fetch fresh data first */
const VERSION = "jobline-v1.0.0";
const SHELL = [
  "./", "index.html", "css/style.css", "js/config.js", "js/logic.js", "js/store.js", "js/charts.js", "js/app.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase traffic is handled by the Firebase SDK itself
  if (/firestore|googleapis\.com\/identitytoolkit|securetoken/.test(url.href)) return;

  const networkFirst = url.origin === location.origin; // app files + data: fresh when online
  if (networkFirst) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.url.split("?")[0], copy)); }
        return res;
      }).catch(() => caches.match(req.url.split("?")[0]).then(r => r || caches.match("index.html")))
    );
  } else {
    // CDN libraries & fonts: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
