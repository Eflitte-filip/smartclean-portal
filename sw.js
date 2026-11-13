/* SmartClean Portal — service worker (PWA)
   STALNA IMENA DATOTEK: portal.css / portal.js se prepišeta na istem mestu, index.html jih naloži z ?v=<različica>.
   - Koda z oznako različice (portal.js?v=5.01 …): iz shrambe, ko je tam — ista različica je ista vsebina.
     Zato se zagonski zaslon izriše takoj tudi pri slabi povezavi (prej: bela stran, dokler mreža ni odgovorila).
   - Stran (HTML) in ostala koda: najprej mreža (cache:'no-cache'), da so posodobitve vidne takoj; če mreža
     v 1,5 s ne odgovori, shranjena kopija — mreža pa v ozadju vseeno osveži shrambo za naslednje odprtje.
   - Slike/pisave: cache-first (redko se menjajo). APK: vedno z mreže (3+ MB, ob novi različici bi sicer
     tablica dobila star paket iz predpomnilnika). */
var CACHE = 'sc-portal';
var ROK_MREZE = 1500;
var PRECACHE = ['./boot.js', './portal.css', './portal.js', './start.js', './supabase.js', './config.js', './index.html',
  './pdfgen.js', './spremni-pdf.js'];   // lena modula za PDF — prednaloži, da PDF deluje tudi brez povezave
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // ob namestitvi vzemi sveže kopije (brez HTTP predpomnilnika)
      return Promise.all(PRECACHE.map(function (u) {
        return fetch(u, { cache: 'no-cache' }).then(function (r) { return c.put(u, r); }).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    // samo LASTNI stari predpomnilniki — aplikacija za spremne liste (/mobile, »pralnica-…«) je na isti
    // domeni; prej je portal izbrisal njen predpomnilnik in se na iPhonu brez povezave ni zagnala
    return Promise.all(ks.map(function (k) { if (k !== CACHE && k.indexOf('sc-portal') === 0) return caches.delete(k); }));
  }).then(function () {
    // stare kopije APK iz predpomnilnika (prej cache-first) odstrani
    return caches.open(CACHE).then(function (c) { return c.keys().then(function (zahteve) {
      return Promise.all(zahteve.filter(function (r) { return /\.apk(\?|$)/i.test(r.url); }).map(function (r) { return c.delete(r); }));
    }); });
  }).then(function () { return self.clients.claim(); }));
});
// shranjena kopija: točna, sicer ista datoteka druge različice; stran (navigacija) → index.html, skripta nikoli ne dobi HTML
function izShrambe(req) { return caches.match(req).then(function (h) { return h || caches.match(req, { ignoreSearch: true }); }); }
function nadomestek(req) {
  return izShrambe(req).then(function (h) { return h || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : null); });
}
function izMreze(req, url) {
  return fetch(req, { cache: 'no-cache' }).then(function (res) {
    if (res.status >= 500) return izShrambe(req).then(function (h) { return h || res; });   // strežnik ne odgovarja pravilno
    if (!res.ok) return res;
    var c = res.clone();
    caches.open(CACHE).then(function (k) {   // ena kopija na datoteko: starejše različice (?v=…) iste poti ven
      return k.keys().then(function (zs) { zs.forEach(function (r) { var u = new URL(r.url); if (u.pathname === url.pathname && u.search !== url.search) k.delete(r); }); return k.put(req, c); });
    }).catch(function () {});
    return res;
  });
}
function jeMedij(p) { return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(p); }
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* Supabase / zunanje pusti */
  /* config.js: z mreže (vedno svež), brez povezave iz predpomnilnika — sicer se portal brez povezave ne zažene */
  if (/\.apk$/i.test(url.pathname)) return;           /* APK vedno z mreže */
  if (jeMedij(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (k) { k.put(req, c); }).catch(function () {}); return res; });
    }));
    return;
  }
  /* Koda z oznako različice: ista različica = ista vsebina → takoj iz shrambe; brez nje z mreže (shrani). */
  if (/[?&]v=/.test(url.search) && /\.(js|css)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || izMreze(req, url).catch(function () { return izShrambe(req).then(function (h) { return h || Response.error(); }); });
    }));
    return;
  }
  /* Stran in ostala koda: sveže z mreže; če ta v ROK_MREZE ne odgovori, shranjena kopija (mreža v ozadju osveži shrambo). */
  var mreza = izMreze(req, url);
  e.waitUntil(mreza.then(function () {}, function () {}));
  e.respondWith(new Promise(function (ok) {
    var poslano = false;
    function poslji(res) { if (!poslano && res) { poslano = true; ok(res); } }
    var ura = setTimeout(function () { nadomestek(req).then(poslji); }, ROK_MREZE);   // brez kopije: čakaj naprej na mrežo
    mreza.then(function (res) { clearTimeout(ura); poslji(res); }, function () {
      clearTimeout(ura);
      nadomestek(req).then(function (h) { poslji(h || Response.error()); });
    });
  }));
});
