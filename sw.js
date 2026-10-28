// Offline-Unterstützung: App-Dateien und Psalmen werden zwischengespeichert.
const CACHE = "wetter-psalm-v2";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "psalms.json",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Wetter-APIs nicht abfangen – die App speichert die letzten Daten selbst.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Netzwerk zuerst (für Updates), bei Offline aus dem Cache.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
