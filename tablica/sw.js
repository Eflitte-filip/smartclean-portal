/* SmartClean — service worker (SmartClean tablica). ZGRAJENO z aplikacija/zgradi.py — ne urejaj ročno. */
/* HTML = network-first (vedno sveža koda, brez povezave iz predpomnilnika),
   lastne statične datoteke = cache-first. Klici na Supabase se NIKOLI ne predpomnijo. */
const CACHE = "pralnica-tablica-v11-12";
const CORE = ["index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "supabase.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    // samo lastne stare različice (portal na isti domeni ima svoj »sc-portal«)
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf("pralnica-tablica-v") === 0).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // Supabase: vedno z mreže
  const path = url.pathname;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html") || path.endsWith("/") || path.endsWith("index.html");
  if (isHTML) {
    // Šibka povezava (pralnica): če strežnik ne odgovori v 4 s, se odpre shranjena kopija
    // (aplikacija je ena datoteka, zato ni mešanja starega in novega). Nova različica se vseeno
    // shrani, ko prispe — velja ob naslednjem odprtju.
    e.respondWith(new Promise((resolve) => {
      let gotovo = false;
      const shranjena = () => caches.match("index.html");
      const t = setTimeout(() => { shranjena().then((h) => { if (h && !gotovo) { gotovo = true; resolve(h); } }); }, 4000);
      fetch(req).then((resp) => {
        clearTimeout(t);
        if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)).catch(() => {}); }
        if (!gotovo) { gotovo = true; resolve(resp); }
      }).catch(() => {
        clearTimeout(t);
        shranjena().then((h) => { if (!gotovo) { gotovo = true; resolve(h || Response.error()); } });
      });
    }));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
    const copy = resp.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return resp;
  })));
});
